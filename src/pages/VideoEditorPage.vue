<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="`/gallery/${galleryId}`" />
        </ion-buttons>
        <ion-title>{{ $t('auto.video_bearbeiten') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="saveVideo" :disabled="isSaving">
            <ion-spinner v-if="isSaving" />
            <ion-icon v-else :icon="checkmark" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="video-editor-container">
        <div v-if="isLoading" class="loading-state">
          <ion-spinner />
          <p>{{ $t('auto.lade_video') }}</p>
        </div>

        <div v-else-if="videoPath" class="video-preview">
          <video 
            ref="videoElement"
            :src="videoPath"
            controls
            playsinline
            class="preview-video"
          ></video>

          <div class="editor-controls ion-padding">
            <h3>{{ $t('auto.video_bearbeiten') }}</h3>
            
            <!-- Trim Controls -->
            <div class="control-group">
              <ion-label>
                <h4>{{ $t('auto.trimmen') }}</h4>
                <p>{{ $t('auto.schneide_den_anfang_und_das_ende_des_videos') }}</p>
              </ion-label>
              <div class="trim-controls">
                <div class="trim-input">
                  <ion-label>{{ $t('auto.start_sek') }}</ion-label>
                  <ion-input 
                    v-model.number="trimStart" 
                    type="number" 
                    min="0" 
                    :max="duration"
                    placeholder="0"
                  />
                </div>
                <div class="trim-input">
                  <ion-label>{{ $t('auto.ende_sek') }}</ion-label>
                  <ion-input 
                    v-model.number="trimEnd" 
                    type="number" 
                    min="0" 
                    :max="duration"
                    :placeholder="duration.toString()"
                  />
                </div>
              </div>
            </div>

            <!-- Quality Settings -->
            <div class="control-group">
              <ion-label>
                <h4>{{ $t('auto.qualität') }}</h4>
              </ion-label>
              <ion-select v-model="quality" interface="action-sheet">
                <ion-select-option value="high">{{ $t('auto.hoch') }}</ion-select-option>
                <ion-select-option value="medium">{{ $t('auto.mittel') }}</ion-select-option>
                <ion-select-option value="low">{{ $t('auto.niedrig') }}</ion-select-option>
              </ion-select>
            </div>

            <!-- Video Info -->
            <div class="video-info">
              <p><strong>Dauer:</strong> {{ formatDuration(duration) }}</p>
              <p v-if="trimStart > 0 || trimEnd < duration">
                <strong>{{ $t('auto.neue_dauer') }}</strong> {{ formatDuration(Math.max(0, trimEnd - trimStart)) }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { 
  IonPage, 
  IonHeader, 
  IonToolbar, 
  IonTitle, 
  IonContent, 
  IonButtons, 
  IonButton, 
  IonBackButton,
  IonIcon, 
  IonSpinner,
  IonLabel,
  IonInput,
  IonSelect,
  IonSelectOption,
  toastController 
} from '@ionic/vue';
import { checkmark } from 'ionicons/icons';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { VideoEditor } from '@whiteguru/capacitor-plugin-video-editor';
import { db } from '@/services/database';

const route = useRoute();
const router = useRouter();

const galleryId = route.params.galleryId as string;
const videoSrc = route.query.videoSrc as string;
const videoId = route.query.videoId as string;

const isLoading = ref(true);
const isSaving = ref(false);
const videoPath = ref('');
const videoElement = ref<HTMLVideoElement | null>(null);
const duration = ref(0);
const trimStart = ref(0);
const trimEnd = ref(0);
const quality = ref<'high' | 'medium' | 'low'>('medium');

onMounted(async () => {
  if (!videoSrc) {
    const toast = await toastController.create({
      message: 'Keine Video-Quelle angegeben',
      duration: 2000,
      color: 'danger'
    });
    await toast.present();
    router.back();
    return;
  }

  videoPath.value = videoSrc;
  isLoading.value = false;

  // Warte auf Video-Metadaten
  if (videoElement.value) {
    videoElement.value.onloadedmetadata = () => {
      if (videoElement.value) {
        duration.value = Math.floor(videoElement.value.duration);
        trimEnd.value = duration.value;
      }
    };
  }
});

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const saveVideo = async () => {
  if (!videoPath.value) return;

  try {
    isSaving.value = true;

    const isNative = Capacitor.getPlatform() !== 'web';

    if (!isNative) {
      const toast = await toastController.create({
        message: 'Videobearbeitung wird nur auf nativen Plattformen unterstützt',
        duration: 3000,
        color: 'warning'
      });
      await toast.present();
      return;
    }

    // Konvertiere Data URL zu temporärer Datei falls nötig
    let inputPath = videoPath.value;
    if (videoPath.value.startsWith('data:')) {
      // Speichere temporär
      const base64Data = videoPath.value.split(',')[1];
      const tempPath = `temp_video_${Date.now()}.mp4`;
      
      await Filesystem.writeFile({
        path: tempPath,
        data: base64Data,
        directory: Directory.Cache
      });

      const fileUri = await Filesystem.getUri({
        path: tempPath,
        directory: Directory.Cache
      });
      inputPath = fileUri.uri;
    }

    // Erstelle Output-Pfad
    const outputFileName = `edited_video_${Date.now()}.mp4`;
    
    // Edit Video (simplified options)
    const result = await VideoEditor.edit({
      path: inputPath
    });

    if (!result || !result.file) {
      throw new Error('Video-Bearbeitung fehlgeschlagen');
    }

    // Lese bearbeitetes Video
    const editedVideoPath = typeof result.file === 'string' ? result.file : (result.file as any)?.path || '';
    if (!editedVideoPath) {
      throw new Error('Kein Dateipfad vom Video-Editor erhalten');
    }
    
    const response = await fetch(editedVideoPath);
    const blob = await response.blob();
    const reader = new FileReader();

    await new Promise<void>((resolve, reject) => {
      reader.onloadend = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1];
          const dataUrl = reader.result as string;

          // Speichere im Filesystem
          await Filesystem.writeFile({
            path: `galleries/${galleryId}/${outputFileName}`,
            data: base64Data,
            directory: Directory.Data
          });

          // Aktualisiere Datenbank
          if (videoId) {
            await db.updatePhoto(Number(videoId), {
              filepath: dataUrl,
              thumbnail: dataUrl,
              filesize: blob.size
            });
          }

          const toast = await toastController.create({
            message: 'Video gespeichert',
            duration: 2000,
            color: 'success'
          });
          await toast.present();

          setTimeout(() => router.back(), 500);
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  } catch (error) {
    console.error('Error saving video:', error);
    const toast = await toastController.create({
      message: `Fehler beim Speichern: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`,
      duration: 3000,
      color: 'danger'
    });
    await toast.present();
  } finally {
    isSaving.value = false;
  }
};
</script>

<style scoped>
.video-editor-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 1rem;
}

.video-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.preview-video {
  width: 100%;
  max-height: 400px;
  background: #000;
  object-fit: contain;
}

.editor-controls {
  flex: 1;
  overflow-y: auto;
}

.control-group {
  margin: 1.5rem 0;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--ion-color-light);
}

.control-group h4 {
  margin: 0 0 0.5rem 0;
  font-weight: 600;
}

.control-group p {
  margin: 0 0 1rem 0;
  color: var(--ion-color-medium);
  font-size: 0.9rem;
}

.trim-controls {
  display: flex;
  gap: 1rem;
  margin-top: 1rem;
}

.trim-input {
  flex: 1;
}

.trim-input ion-label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
  font-weight: 500;
}

.video-info {
  margin-top: 1rem;
  padding: 1rem;
  background: var(--ion-color-light);
  border-radius: 8px;
}

.video-info p {
  margin: 0.5rem 0;
}
</style>
