<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons  slot="start">
          <ion-back-button v-if="!selectionMode" :default-href="backHref"/>
          <ion-button v-else @click="cancelSelectionMode">
            <ion-icon :icon="close"/>
          </ion-button>
        </ion-buttons>
        <ion-title v-if="!selectionMode"  size="large">{{ currentGallery?.name || 'Gallerie' }}</ion-title>
        <ion-title v-else>{{ selectedPhotos.size }} ausgewählt</ion-title>
        <ion-buttons slot="end">
          <ion-button v-if="selectedPhoto && !selectionMode" @click="clearSelection">
            <ion-icon :icon="closeCircle" />
          </ion-button>
          <ion-button v-if="selectedPhoto && !selectionMode" @click="openSelectedEditor" color="primary" class="gallery-edit-button">
            <ion-icon :icon="create" />
          </ion-button>
          <ion-button v-if="!selectedPhoto && !selectionMode" @click="showPhotoOptions">
            <ion-icon :icon="add" />
          </ion-button>
          <ion-button v-if="!selectedPhoto && !selectionMode" @click="showGalleryMenu">
            <ion-icon :icon="ellipsisVertical" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <!-- Mehrfachselektion Toolbar -->
      <ion-toolbar v-if="selectionMode" color="primary">
        <ion-buttons slot="start">
          <ion-button @click="selectAllPhotos">
            <ion-icon :icon="checkmarkCircle" />
            {{ $t('auto.alle_auswählen') }}
          </ion-button>
        </ion-buttons>
        <ion-buttons slot="end">
          <ion-button @click="deleteSelectedPhotos" :disabled="selectedPhotos.size === 0">
            <ion-icon :icon="trashOutline" />
            {{ $t('auto.löschen') }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">{{ currentGallery?.name }}</ion-title>
        </ion-toolbar>
      </ion-header>

      <!-- Description -->
      <div v-if="currentGallery?.description" class="gallery-description ion-padding">
        <p>{{ currentGallery.description }}</p>
      </div>

      <!-- View Toggle (nur wenn Fotos vorhanden) -->
      <div v-if="!isLoading && photos.length > 0" class="view-toggle ion-padding-horizontal">
        <ion-segment :value="currentView" @ionChange="handleViewChange">
          <ion-segment-button value="grid">
            <ion-icon :icon="gridOutline" />
            <ion-label>{{ $t('auto.fotos') }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="map">
            <ion-icon :icon="mapOutline" />
            <ion-label>{{ $t('auto.karte') }}</ion-label>
          </ion-segment-button>
        </ion-segment>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="loading-container">
        <ion-spinner />
      </div>

      <!-- Upload Progress -->
      <div v-else-if="isProcessing && uploadProgress.total > 0" class="upload-progress ion-padding">
        <ion-spinner />
        <p>Verarbeite Fotos: {{ uploadProgress.current }} / {{ uploadProgress.total }}</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="photos.length === 0" class="empty-state">
        <ion-icon :icon="cameraOutline" size="large" />
        <h2>{{ $t('auto.keine_fotos_vorhanden') }}</h2>
        <p>{{ $t('auto.füge_fotos_mit_dem_button_hinzu') }}</p>
      </div>

      <!-- Photo Grid -->
      <ion-grid v-else-if="currentView === 'grid'" id="photo-gallery">
        <!-- Mehrfachselektion Button -->
        <ion-row v-if="!selectionMode && photos.length > 0">
          <ion-col size="12">
            <ion-button expand="block" fill="outline" @click="startSelectionMode">
              <ion-icon :icon="checkmarkCircle" />
              {{ $t('auto.mehrfachauswahl') }}
            </ion-button>
          </ion-col>
        </ion-row>
        
        <ion-row>
          <ion-col 
            v-for="(photo, index) in photos" 
            :key="photo.id" 
            size="4" 
            size-md="3" 
            size-lg="2"
          >
            <div class="photo-container">
              <template v-if="!selectionMode">
                <a
                  :href="getImageSrc(photo.filepath)"
                  :data-type="isVideoPhoto(photo) ? 'video' : 'image'"
                  :data-poster="isVideoPhoto(photo) ? getVideoPoster(photo.id) : undefined"
                  @click="handlePhotoClick(photo, index, $event)"
                  @touchstart.passive="handleTouchStart(photo, $event)"
                  @touchend.passive="handleTouchEnd"
                  @touchmove.passive="handleTouchEnd"
                  class="photo-item"
                  :class="{ glightbox: true, 'photo-selected': selectedPhoto?.id === photo.id }"
                >
                  <div v-if="isVideoPhoto(photo)" class="video-thumbnail-wrapper">
                    <video 
                      :src="getImageSrc(photo.filepath)"
                      :poster="getVideoPoster(photo.id)"
                      class="video-thumbnail"
                      preload="none"
                      muted
                      playsinline
                    ></video>
                    <div class="video-overlay" @click.stop.prevent="openLightbox(index)">
                      <ion-icon :icon="playCircle" />
                    </div>
                  </div>
                  <img 
                    v-else
                    :src="getImageSrc(photo.filepath)" 
                    :alt="photo.filename"
                    loading="lazy"
                    class="photo-img"
                  />
                </a>
                <div class="photo-actions">
                  <ion-button
                    fill="clear"
                    size="small"
                    class="action-button"
                    @click.stop.prevent="isVideoPhoto(photo) ? openVideoEditor(photo) : openImageEditor(photo)"
                  >
                    <ion-icon :icon="pencilOutline" />
                  </ion-button>
                </div>
              </template>

              <!-- Mehrfachselektion Modus -->
              <div
                v-else
                @click="togglePhotoSelection(photo)"
                class="photo-item selectable"
                :class="{ 'selected': selectedPhotos.has(typeof photo.id === 'number' ? photo.id : -1) }"
              >
                <div v-if="isVideoPhoto(photo)" class="video-thumbnail-wrapper">
                  <video 
                    :src="getImageSrc(photo.filepath)"
                    :poster="getVideoPoster(photo.id)"
                    class="video-thumbnail"
                    preload="none"
                    muted
                    playsinline
                  ></video>
                  <div class="video-overlay">
                    <ion-icon :icon="playCircle" />
                  </div>
                </div>
                <img 
                  v-else
                  :src="getImageSrc(photo.filepath)" 
                  :alt="photo.filename"
                  loading="lazy"
                  class="photo-img"
                />
                <div class="selection-checkbox">
                  <ion-checkbox :checked="selectedPhotos.has(typeof photo.id === 'number' ? photo.id : -1)" />
                </div>
              </div>
            </div>
          </ion-col>
        </ion-row>
      </ion-grid>

      <!-- Map View -->
      <div v-else-if="currentView === 'map'" class="map-view ion-padding">
        <GalleryMap :photos="photos" @photo-click="openPhoto" />
      </div>

      <ion-fab vertical="bottom" horizontal="end" class="gallery-play-fab app-fab">
        <ion-fab-button
          color="primary"
          class="fab-outline-shadow"
          :disabled="photos.length === 0"
          @click="handleAutoplayToggle"
        >
          <ion-icon :icon="autoplayActive ? pause : playCircle" />
        </ion-fab-button>
      </ion-fab>
    </ion-content>
    
    <!-- Location Picker Modal -->
    <LocationPickerModal 
      :is-open="showLocationPicker"
      @confirm="handleLocationConfirm"
      @cancel="handleLocationCancel"
    />
    <ion-modal :is-open="photoEditorOpen" @didDismiss="closeImageEditor">
      <ion-header>
        <ion-toolbar>
          <ion-buttons>
            <ion-button slot="start" @click="closeImageEditor">{{ $t('auto.abbrechen') }}</ion-button>
          </ion-buttons>
          <ion-title>{{ $t('auto.bild_bearbeiten') }}</ion-title>
          <ion-buttons>
            <ion-button slot="end" :strong="true" @click="saveImageEditor" :disabled="isSaving">
              <ion-icon v-if="!isSaving" :icon="checkmark" />
              <ion-spinner v-else name="crescent" />
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-no-padding">
        <ImageEditor
          :is-open="true"
          :image-src="photoEditorSrc"
          :compact="true"
          @close="closeImageEditor"
          @save="handleImageEditorSave"
        />
      </ion-content>
    </ion-modal>
    <ion-modal
      :is-open="videoPreviewOpen"
      @did-dismiss="closeVideoPreview"
      class="video-preview-modal"
      :initial-breakpoint="0.8"
      :breakpoints="[0.4, 0.7, 0.95]"
    >
      <ion-header>
        <ion-toolbar>
          <ion-buttons>
            <ion-button @click="closeVideoPreview">
              <ion-icon :icon="close" />
            </ion-button>
          </ion-buttons>
          <ion-title>Video Vorschau</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="video-preview-content">
        <div class="video-preview-container">
          <video
            v-if="videoPreviewSrc"
            ref="videoPreviewRef"
            :src="videoPreviewSrc"
            controls
            autoplay
            playsinline
            class="video-preview-player"
          ></video>
        </div>
      </ion-content>
    </ion-modal>
    <ion-modal :is-open="showEditDialog" @did-dismiss="closeEditGalleryModal">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button @click="closeEditGalleryModal">
              <ion-icon :icon="close" />
            </ion-button>
          </ion-buttons>
          <ion-title>{{ $t('auto.gallerie_bearbeiten') }}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <ion-item>
          <ion-input
            v-model="editGalleryName"
            label="Name"
            label-placement="stacked"
            placeholder="z.B. Urlaub 2026"
          />
        </ion-item>
        <ion-item>
          <ion-textarea
            v-model="editGalleryDescription"
            :label="$t('auto.beschreibung') + ' (optional)'"
            label-placement="stacked"
            :rows="4"
            placeholder="Beschreibe deine Gallerie..."
          />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">{{ $t('auto.marker_farbe') }}</ion-label>
          <div class="color-picker-container">
            <div class="color-preview" :style="{ backgroundColor: editGalleryColor }" />
            <div class="preset-colors">
              <button
                v-for="color in colorPresets"
                :key="color"
                class="color-button"
                :class="{ active: editGalleryColor === color }"
                :style="{ backgroundColor: color }"
                @click="editGalleryColor = color"
                type="button"
              />
            </div>
          </div>
        </ion-item>
        <ion-item lines="none" class="gallery-date-row">
          <ion-label>
            <span class="date-label">{{ $t('auto.startdatum') }}</span>
            <span class="date-value">{{ formattedEditStartDate }}</span>
          </ion-label>
          <ion-datetime
            class="calendar-icon-only"
            v-model="editGalleryStartDate"
            presentation="date"
            display-format="DD.MM.YYYY"
          />
        </ion-item>
        <ion-item lines="none" class="gallery-date-row">
          <ion-label>
            <span class="date-label">{{ $t('auto.enddatum') }}</span>
            <span class="date-value">{{ formattedEditEndDate }}</span>
          </ion-label>
          <ion-datetime
            class="calendar-icon-only"
            v-model="editGalleryEndDate"
            presentation="date"
            display-format="DD.MM.YYYY"
          />
        </ion-item>
        <ion-button
          expand="block"
          class="ion-margin-top"
          :disabled="!editGalleryName.trim()"
          @click="handleUpdateGallery"
        >
          {{ $t('auto.speichern') }}
        </ion-button>
      </ion-content>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, onBeforeUnmount, onActivated } from 'vue';
import { checkmark, image } from 'ionicons/icons';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonModal,
  IonButtons,
  IonButton,
  IonBackButton,
  IonIcon,
  IonGrid,
  IonRow,
  IonCol,
  IonImg,
  IonSpinner,
  IonSegment,
  IonSegmentButton,
  IonCheckbox,
  IonLabel,
  IonItem,
  IonInput,
  IonTextarea,
  IonDatetime,
  IonFab,
  IonFabButton,
  actionSheetController,
  alertController
} from '@ionic/vue';
import {
  add,
  ellipsisVertical,
  cameraOutline,
  camera,
  images,
  gridOutline,
  mapOutline,
  trashOutline,
  playCircle,
  pause,
  create,
  closeCircle,
  close,
  checkmarkCircle,
  pencilOutline
} from 'ionicons/icons';
import { CameraSource } from '@capacitor/camera';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { useGallery } from '@/composables/useGallery';
import { usePhoto } from '@/composables/usePhoto';
import { useLightbox } from '@/composables/useLightbox';
import { useWakeLock } from '@/composables/useWakeLock';
import { extractExifFromUri, extractExifFromImage } from '@/services/exif';
import { default as GalleryMap } from '@/components/GalleryMap.vue';
import { default as LocationPickerModal } from '@/components/LocationPickerModal.vue';
import { default as ImageEditor } from '@/components/ImageEditor.vue';
// import { extractExifFromUri, extractExifFromImage } from '@/services/exif'; // ungenutzt
import { db, type Photo } from '@/services/database';

// Default Back-Link für ion-back-button
const backHref = '/gallery';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { currentGallery, photos, isLoading, loadGallery, deleteGallery, updateGallery } = useGallery();
const { takePhoto, pickSinglePhoto, pickMultiplePhotos, savePhoto, saveMultiplePhotos, deletePhoto: removePhoto, isProcessing, extractExifData } = usePhoto();
const { initLightbox, openLightbox, destroyLightbox, startAutoplay, stopAutoplay, autoplayActive, isLightboxOpen } = useLightbox();
const { activate: activateWakeLock, deactivate: deactivateWakeLock } = useWakeLock();

const uploadProgress = ref({ current: 0, total: 0 });
const currentView = ref<'grid' | 'map'>('grid');
const cacheBuster = ref(Date.now());
const selectedPhoto = ref<Photo | null>(null);

// Mehrfachselektion
const selectionMode = ref(false);
const selectedPhotos = ref<Set<number>>(new Set());

const showEditDialog = ref(false);
const editGalleryName = ref('');
const editGalleryDescription = ref('');
const editGalleryColor = ref('#3880ff');
const editGalleryStartDate = ref('');
const editGalleryEndDate = ref('');

const colorPresets = [
  '#3880ff',
  '#eb445a',
  '#2dd36f',
  '#ffc409',
  '#92949c',
  '#ff6b6b',
  '#4ecdc4',
  '#45b7d1',
  '#f9ca24',
  '#6c5ce7',
  '#a29bfe',
  '#fd79a8',
  '#fdcb6e',
  '#00b894',
  '#2d3436'
];
const formatDateValue = (dateStr: string) => {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};
const previewDateValue = (value?: string) => (value ? formatDateValue(value) : '-');
const formattedEditStartDate = computed(() => previewDateValue(editGalleryStartDate.value));
const formattedEditEndDate = computed(() => previewDateValue(editGalleryEndDate.value));

const videoExtensions = ['mp4', 'mov', 'webm', 'mkv', 'avi', '3gp', 'm4v'];

const getImageSrc = (path: string | undefined) => {
  if (!path) return '';
  if (path.startsWith('data:') || path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return Capacitor.convertFileSrc(path);
};

const isVideoPhoto = (photo: Photo) => {
  if (photo.isVideo) return true;
  if (photo.mimeType?.startsWith('video/')) return true;
  const filenameExt = photo.filename?.split('.').pop()?.toLowerCase() || '';
  if (videoExtensions.includes(filenameExt)) return true;
  const cleanPath = (photo.filepath || '').split('?')[0].split('#')[0];
  const pathExt = cleanPath.split('.').pop()?.toLowerCase() || '';
  return videoExtensions.includes(pathExt);
};

// Manuelle GPS-Eingabe
const showLocationPicker = ref(false);
const pendingPhotoData = ref<{
  photoUri: string;
  galleryId: number;
  filename?: string;
  cameraExifData?: any;
} | null>(null);
// Image editor state
const photoEditorOpen = ref(false);
const photoBeingEdited = ref<Photo | null>(null);
const photoEditorSrc = computed(() => {
  if (!photoBeingEdited.value) return '';
  return getImageSrc(photoBeingEdited.value.filepath);
});
// Video preview state
const videoPreviewOpen = ref(false);
const videoPreviewSrc = ref<string | null>(null);
const videoPreviewRef = ref<HTMLVideoElement | null>(null);

let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let longPressPhoto: Photo | null = null;
// let longPressPhoto: Photo | null = null; // ungenutzt

const handlePhotoClick = (photo: Photo, index: number, event: Event) => {
  event.preventDefault();
  
  // Wenn Foto selektiert ist, nichts tun (Editor wird über Button geöffnet)
  if (selectedPhoto.value?.id === photo.id) {
    return;
  }

  // Öffne Lightbox (Bilder und Videos)
  openLightbox(index);
};

const handleAutoplayToggle = () => {
  if (autoplayActive.value) {
    stopAutoplay();
    return;
  }
  if (photos.value.length === 0) {
    return;
  }
  openLightbox(0);
  startAutoplay();
};

const handleTouchStart = (photo: Photo, event: TouchEvent) => {
  event.preventDefault();
  longPressPhoto = photo;
  
  // 5 Sekunden Long-Press für Selektion
  longPressTimer = setTimeout(() => {
    Haptics.impact({ style: ImpactStyle.Medium });
    selectedPhoto.value = photo;
    longPressTimer = null;
  }, 5000);
};

const handleTouchEnd = () => {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  longPressPhoto = null;
};

const handleViewChange = (event: CustomEvent) => {
  const value = event.detail.value;
  if (value === 'grid' || value === 'map') {
    currentView.value = value;
  }
};
const openImageEditor = (photo: Photo) => {
  photoBeingEdited.value = photo;
  photoEditorOpen.value = true;
};

const isSaving = ref(false);
const closeImageEditor = () => {
  if (isSaving.value) return;
  photoEditorOpen.value = false;
  photoBeingEdited.value = null;
};

const saveImageEditor = async () => {
  if (isSaving.value) return;
  isSaving.value = true;
  try {
    // Trigger save in ImageEditor via ref or event (ImageEditor emits 'save' with imageBlob)
    // Hier wird handleImageEditorSave aufgerufen, wenn ImageEditor speichert
    // Falls direkter Zugriff nötig: ggf. $refs nutzen
    // (ImageEditor ruft handleImageEditorSave auf, das schließt das Modal und setzt isSaving=false)
  } finally {
    isSaving.value = false;
  }
};
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
const handleImageEditorSave = async (blob: Blob) => {
  if (!photoBeingEdited.value || !currentGallery.value) return;
  const galleryId = currentGallery.value.id;
  if (!galleryId) return;

  try {
    const base64 = await blobToBase64(blob);
    const fileName = photoBeingEdited.value.filename || `photo_${photoBeingEdited.value.id}_${Date.now()}.jpg`;
    const targetPath = `galleries/${galleryId}/${fileName}`;

    const result = await Filesystem.writeFile({
      path: targetPath,
      data: base64,
      directory: Directory.Data,
      recursive: true
    });

    await db.updatePhoto(photoBeingEdited.value.id!, {
      filepath: result.uri,
      thumbnail: `data:image/jpeg;base64,${base64}`
    });

    await loadGallery(galleryId);
  } catch (error) {
    console.error('Error saving edited photo:', error);
  } finally {
    closeImageEditor();
  }
};
const openVideoPreview = (photo: Photo) => {
// const openVideoPreview = (photo: Photo) => {
//   videoPreviewSrc.value = getImageSrc(photo.filepath);
  videoPreviewOpen.value = true;
};
const closeVideoPreview = () => {
  if (videoPreviewRef.value) {
    videoPreviewRef.value.pause();
    videoPreviewRef.value.currentTime = 0;
    videoPreviewRef.value = null;
  }
  videoPreviewOpen.value = false;
  videoPreviewSrc.value = null;
};


onMounted(async () => {
  try {
    const galleryId = parseInt(route.params.id as string);
    if (!galleryId || isNaN(galleryId)) {
      throw new Error('Ungültige oder fehlende Galerie-ID in Route!');
    }
    await loadGallery(galleryId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    alert('Fehler beim Laden der Galerie: ' + msg);
    console.error('Fehler beim Laden der Galerie/DB:', err);
  }

  // Orientation/Resize-Handling für Lightbox/Video-Preview
  const handleOrientationOrResize = () => {
    // Video-Preview: NICHT neu laden, einfach Layout anpassen
    // Lightbox: Schließe und öffne sie neu, falls offen
    if (isLightboxOpen.value && typeof destroyLightbox === 'function' && typeof openLightbox === 'function') {
      destroyLightbox();
      setTimeout(() => {
        initLightbox('#photo-gallery', photos.value);
      }, 100);
    }
  };
  window.addEventListener('orientationchange', handleOrientationOrResize);
  window.addEventListener('resize', handleOrientationOrResize);

  // Cleanup
  onBeforeUnmount(() => {
    window.removeEventListener('orientationchange', handleOrientationOrResize);
    window.removeEventListener('resize', handleOrientationOrResize);
  });
});

// Reload gallery when returning from editor
onActivated(async () => {
  const galleryId = parseInt(route.params.id as string);
  if (galleryId) {
    console.log('Gallery reactivated - reloading photos');
    cacheBuster.value = Date.now();
    await loadGallery(galleryId);
  }
});

// Initialisiere Lightbox wenn Fotos geladen sind

// Lightbox initialisieren und WakeLock an Lightbox-Status koppeln
watch(photos, (newPhotos) => {
  if (newPhotos.length > 0) {
    setTimeout(() => {
      initLightbox('#photo-gallery', newPhotos);
    }, 100);
  }
}, { immediate: true });

watch([isLightboxOpen, autoplayActive], ([open, auto]) => {
  if (open || auto) {
    activateWakeLock();
  } else {
    deactivateWakeLock();
  }
});

watch(currentGallery, (gallery) => {
  if (gallery && !showEditDialog.value) {
    populateEditFields();
  }
}, { immediate: true });

onBeforeUnmount(() => {
  destroyLightbox();
});

const showPhotoOptions = async () => {
    const actionSheet = await actionSheetController.create({
      header: t("gallery.add_header"),
    buttons: [
      {
        text: t("gallery.take_photo"),
        icon: camera,
        handler: () => handleAddPhoto(CameraSource.Camera)
      },
      {
        text: t('gallery.select_single_photo'),
        icon: image,
        handler: () => handleAddPhotoFromGallery()
      },
      {
        text: t('gallery.select_multiple_photos'),
        icon: images,
        handler: () => handleAddMultiplePhotos()
      }
    ]
  });
  await actionSheet.present();
};

const handleAddPhoto = async (source: CameraSource) => {
  try {
    const galleryId = parseInt(route.params.id as string);
    const photo = await takePhoto(source);
    
    // WICHTIG: Verwende photo.path statt webPath für Android Gallery (content:// URI)
    const photoUri = photo.path || photo.webPath;
    
    if (photoUri) {
      console.log('📸 Photo captured:', photoUri);
      console.log('📋 Photo EXIF from Camera API:', photo.exif);
      
      let hasGPS = false;
      
      // Prüfe zuerst ob Camera API GPS-Daten hat
      if (photo.exif?.GPSLatitude && photo.exif?.GPSLongitude) {
        console.log('✅ GPS-Daten in Camera API gefunden');
        hasGPS = true;
      } else {
        // Fallback: Für Galerie-Import einfach direkt speichern - GPS wird in savePhoto() extrahiert
        console.log('🔍 Keine GPS in Camera API - speichere Foto, GPS wird in savePhoto() extrahiert');
        // Keine EXIF-Prüfung hier - das macht savePhoto()
        hasGPS = true; // Annahme dass Bild GPS hat oder User wählt manuell
      }
      
      if (!hasGPS) {
        // Zeige Location Picker Dialog
        console.log('⚠️ Keine GPS-Daten gefunden - zeige Location Picker');
        pendingPhotoData.value = {
          photoUri: photoUri,
          galleryId,
          cameraExifData: photo.exif
        };
        showLocationPicker.value = true;
      } else {
        // GPS vorhanden, speichere direkt
        console.log('✅ GPS vorhanden - speichere Foto direkt');
        await savePhoto(photoUri, galleryId, undefined, photo.exif);
        console.log('Photo saved successfully with GPS');
        
        // WICHTIG: Galerie neu laden, damit das neue Foto sofort in der Liste erscheint
        await loadGallery(galleryId);
        cacheBuster.value = Date.now(); // Force re-render für Thumbnails
      }
    }
  } catch (error) {
    console.error('❌ Error adding photo:', error);
    console.error('❌ Error details:', JSON.stringify(error, null, 2));
    const errorMessage = error instanceof Error ? error.message : String(error);
    const alert = await alertController.create({
      header: 'Fehler',
      message: `Das Foto konnte nicht hinzugefügt werden.\n\nDetails: ${errorMessage}`,
      buttons: ['OK']
    });
    await alert.present();
  }
};

// Handler für Einzelfoto (Kamera oder Galerie via Camera API)
// Die Camera API gibt photo.exif mit GPS-Daten zurück!
const handleAddPhotoFromGallery = async () => {
  try {
    const galleryId = parseInt(route.params.id as string);

    // Verwende unseren Picker (native PhotoPicker) statt Camera Photos source,
    // damit nur die native Auswahl geöffnet wird (kein doppelter UI‑Flow).
    const picked = await pickSinglePhoto();
    const photoPath = picked.path || '';
    const photoData = picked.data || null; // optional raw base64 (no prefix)

    if (!photoPath && !photoData) {
      return; // user cancelled
    }

    console.log('📸 Photo selected (picker):', photoPath || '[base64 data]');

    let hasGPS = false;
    let exifData: any = {};

    // Wenn wir Base64 vom Picker haben, benutze die Bytes direkt
    if (photoData) {
      try {
        const binaryString = atob(photoData);
        const len = binaryString.length;
        const buffer = new ArrayBuffer(len);
        const view = new Uint8Array(buffer);
        for (let i = 0; i < len; i++) view[i] = binaryString.charCodeAt(i);
        exifData = await extractExifFromImage(buffer);
        hasGPS = !!(exifData?.latitude && exifData?.longitude);
        console.log('📊 Extracted EXIF from base64 data:', exifData);
      } catch (e) {
        console.warn('⚠️ Could not extract EXIF from base64 data:', e);
      }
    } else if (photoPath) {
      // Fallback: versuche EXIF aus URI zu extrahieren
      try {
        exifData = await extractExifData(photoPath);
        hasGPS = !!(exifData as any).latitude && !!(exifData as any).longitude;
        console.log('📊 Extracted EXIF data from URI:', exifData);
      } catch (e) {
        console.warn('⚠️ Could not extract EXIF from URI:', e);
      }
    }

    if (!hasGPS) {
      // Zeige Location Picker Dialog
      console.log('⚠️ Keine GPS-Daten gefunden - zeige Location Picker');
      pendingPhotoData.value = {
        photoUri: photoPath || `data:image/jpeg;base64,${photoData}`,
        galleryId,
        cameraExifData: exifData
      };
      showLocationPicker.value = true;
    } else {
      // GPS vorhanden, speichere direkt
      console.log('✅ GPS vorhanden - speichere Foto direkt');
      // Wenn wir nur Base64 haben, übergebe sie als letzten Parameter an savePhoto
      await savePhoto(photoPath || '', galleryId, undefined, exifData, undefined, photoData);
      console.log('Photo saved successfully with GPS');

      // WICHTIG: Galerie neu laden, damit das neue Foto sofort in der Liste erscheint
      await loadGallery(galleryId);
      cacheBuster.value = Date.now(); // Force re-render für Thumbnails
    }
  } catch (error) {
    console.error('❌ Error adding photo:', error);
    console.error('❌ Error details:', JSON.stringify(error, null, 2));
    const errorMessage = error instanceof Error ? error.message : String(error);
    const alert = await alertController.create({
      header: 'Fehler',
      message: `Das Foto konnte nicht hinzugefügt werden.\n\nDetails: ${errorMessage}`,
      buttons: ['OK']
    });
    await alert.present();
  }
};

const handleAddMultiplePhotos = async () => {
  try {
    const galleryId = parseInt(route.params.id as string);
    const contentUris = await pickMultiplePhotos();
    
    if (contentUris.length === 0) {
      return; // Benutzer hat abgebrochen
    }

    console.log(`Uploading ${contentUris.length} files...`);
    
    // Speichere Fotos mit Progress-Tracking
    // TODO: GPS-Check für jedes Bild einzeln - aktuell keine GPS-Prüfung bei Mehrfachauswahl
    await saveMultiplePhotos(contentUris, galleryId, (current: number, total: number) => {
      uploadProgress.value = { current, total };
      console.log(`Upload progress: ${current}/${total}`);
    });
    
    uploadProgress.value = { current: 0, total: 0 };
    
    // WICHTIG: Galerie neu laden, damit alle neuen Fotos sofort angezeigt werden
    await loadGallery(galleryId);
    cacheBuster.value = Date.now(); // Force re-render für Thumbnails
    
    console.log('All photos uploaded successfully');
  } catch (error) {
    console.error('Error adding multiple photos:', error);
    // Zeige Fehler-Toast
    const alert = await alertController.create({
      header: 'Fehler',
      message: 'Die Fotos konnten nicht hinzugefügt werden.',
      buttons: ['OK']
    });
    await alert.present();
  }
};

const showGalleryMenu = async () => {
  const actionSheet = await actionSheetController.create({
    header: t('auto.gallerie_optionen'),
    buttons: [
      {
        text: t('auto.gallerie_bearbeiten'),
        icon: pencilOutline,
        handler: openEditGalleryModal
      },
      {
        text: t('auto.gallerie_löschen'),
        role: 'destructive',
        icon: trashOutline,
        handler: () => confirmDeleteGallery()
      }
    ]
  });
  await actionSheet.present();
};

function populateEditFields() {
  if (!currentGallery.value) return;
  editGalleryName.value = currentGallery.value.name || '';
  editGalleryDescription.value = currentGallery.value.description || '';
  editGalleryColor.value = currentGallery.value.color || '#3880ff';
  editGalleryStartDate.value = currentGallery.value.startDate || '';
  editGalleryEndDate.value = currentGallery.value.endDate || '';
}

function openEditGalleryModal() {
  populateEditFields();
  showEditDialog.value = true;
}

function closeEditGalleryModal() {
  showEditDialog.value = false;
}

const handleUpdateGallery = async () => {
  if (!currentGallery.value || !editGalleryName.value.trim()) return;

  const galleryId = currentGallery.value.id;
  if (!galleryId) return;

  try {
    const trimmedDescription = editGalleryDescription.value.trim();
    await updateGallery(galleryId, {
      name: editGalleryName.value.trim(),
      description: trimmedDescription || undefined,
      color: editGalleryColor.value,
      startDate: editGalleryStartDate.value || undefined,
      endDate: editGalleryEndDate.value || undefined
    });
    showEditDialog.value = false;
  } catch (error) {
    console.error('Error updating gallery:', error);
    const errorAlert = await alertController.create({
      header: t('auto.fehler'),
      message: t('auto.gallerie_bearbeiten_fehler'),
      buttons: ['OK']
    });
    await errorAlert.present();
  }
};

const confirmDeleteGallery = async () => {
  const alert = await alertController.create({
    header: 'Gallerie löschen?',
    message: 'Alle Fotos in dieser Gallerie werden ebenfalls gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.',
    buttons: [
      {
        text: 'Abbrechen',
        role: 'cancel'
      },
      {
        text: 'Löschen',
        role: 'destructive',
        handler: async () => {
          const galleryId = parseInt(route.params.id as string);
          await deleteGallery(galleryId);
          router.push('/gallery');
        }
      }
    ]
  });
  await alert.present();
};

const clearSelection = () => {
  selectedPhoto.value = null;
};

const openSelectedEditor = () => {
  if (!selectedPhoto.value) return;
  
  if (isVideoPhoto(selectedPhoto.value)) {
    openVideoEditor(selectedPhoto.value);
  } else {
    openImageEditor(selectedPhoto.value);
  }
  
  selectedPhoto.value = null;
};

const openPhoto = (index: number) => {
  openLightbox(index);
};

const getVideoPoster = (photoId: number | undefined) => {
  const photo = photos.value.find(p => p.id === photoId);
  if (!photo) return '';
  if (photo.thumbnail) {
    return photo.thumbnail.startsWith('data:')
      ? photo.thumbnail
      : `data:image/jpeg;base64,${photo.thumbnail}`;
  }
  return '';
};

const openVideoEditor = (video: Photo) => {
  const galleryId = route.params.id as string;
  router.push({
    path: `/gallery/${galleryId}/video-editor`,
    query: {
      videoSrc: video.filepath,
      videoId: video.id?.toString()
    }
  });
};

// Location Picker Funktionen
const handleLocationConfirm = async (lat: number, lng: number) => {
  if (!pendingPhotoData.value) return;
  
  try {
    const { photoUri, galleryId, cameraExifData } = pendingPhotoData.value;
    
    await savePhoto(
      photoUri, 
      galleryId, 
      undefined, 
      cameraExifData, 
      { latitude: lat, longitude: lng }
    );
    
    console.log('Photo saved with manual location:', { lat, lng });
    
    // WICHTIG: Galerie neu laden, damit das neue Foto sofort erscheint
    await loadGallery(galleryId);
    cacheBuster.value = Date.now(); // Force re-render für Thumbnails
  } catch (error) {
    console.error('Error saving photo with manual location:', error);
  } finally {
    showLocationPicker.value = false;
    pendingPhotoData.value = null;
  }
};

const handleLocationCancel = () => {
  showLocationPicker.value = false;
  pendingPhotoData.value = null;
};

// Mehrfachselektion Funktionen
const startSelectionMode = () => {
  selectionMode.value = true;
  selectedPhotos.value.clear();
};

const cancelSelectionMode = () => {
  selectionMode.value = false;
  selectedPhotos.value.clear();
};

const togglePhotoSelection = (photo: Photo) => {
  if (!photo.id) return;
  
  if (selectedPhotos.value.has(photo.id)) {
    selectedPhotos.value.delete(photo.id);
  } else {
    selectedPhotos.value.add(photo.id);
  }
};

const selectAllPhotos = () => {
  selectedPhotos.value.clear();
  photos.value.forEach(photo => {
    if (photo.id) {
      selectedPhotos.value.add(photo.id);
    }
  });
};

const deleteSelectedPhotos = async () => {
  if (selectedPhotos.value.size === 0) return;
  
  const alert = await alertController.create({
    header: 'Fotos löschen?',
    message: `Möchtest du ${selectedPhotos.value.size} Foto(s) wirklich löschen?`,
    buttons: [
      {
        text: 'Abbrechen',
        role: 'cancel'
      },
      {
        text: 'Löschen',
        role: 'destructive',
        handler: async () => {
          try {
            const photosToDelete = photos.value.filter(p => 
              p.id && selectedPhotos.value.has(p.id)
            );
            
            for (const photo of photosToDelete) {
              await removePhoto(photo);
            }
            
            const galleryId = parseInt(route.params.id as string);
            await loadGallery(galleryId);
            
            cancelSelectionMode();
          } catch (error) {
            console.error('Error deleting photos:', error);
            const errorAlert = await alertController.create({
              header: 'Fehler',
              message: 'Fehler beim Löschen der Fotos.',
              buttons: ['OK']
            });
            await errorAlert.present();
          }
        }
      }
    ]
  });
  await alert.present();
};
</script>

<style scoped>

.fab-outline-shadow { 
  --background: transparent; 
  --background-hover: transparent; 
  --background-activated: transparent; 
  --border-width: 1px; 
  --border-style: solid; 
  --border-color: var(--ion-color-primary); 
  --color: var(--ion-color-primary); 
  --box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25); 
  bottom: calc(env(safe-area-inset-bottom) + 70px);
}
.gallery-description {
  background: var(--ion-color-light);
  border-bottom: 1px solid var(--ion-color-light-shade);
}
.gallery-edit-button {
  --padding-start: 0;
  --padding-end: 0;
  --padding-top: 0;
  --padding-bottom: 0;
  width: 40px;
  height: 40px;
  --border-radius: 50%;
  --background: var(--ion-color-light);
  border: 1px solid var(--ion-color-primary);
  --color: var(--ion-color-primary);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
}

.view-toggle {
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
}

.view-toggle ion-segment {
  max-width: 400px;
  margin: 0 auto;
}

.map-view {
  height: calc(100vh - 200px);
  min-height: 400px;
  /* Let the child map fill this container via CSS variable */
  --gallery-map-height: 100%;
  display: flex;
  align-items: stretch;
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

.upload-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
}

.upload-progress ion-spinner {
  margin-bottom: 1rem;
}

.upload-progress p {
  color: var(--ion-color-medium);
  font-weight: 500;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2rem;
  text-align: center;
}

.empty-state ion-icon {
  font-size: 80px;
  color: var(--ion-color-medium);
  margin-bottom: 1rem;
}

.empty-state h2 {
  color: var(--ion-color-dark);
  margin-bottom: 0.5rem;
}

.empty-state p {
  color: var(--ion-color-medium);
}

.gallery-date-row {
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0;
}

.gallery-date-row ion-label {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  font-size: 0.75rem;
  color: var(--ion-color-medium);
}

.gallery-date-row .date-label {
  font-weight: 500;
}

.gallery-date-row .date-value {
  font-size: 0.85rem;
  color: var(--ion-color-dark);
}

.calendar-icon-only {
  --padding-start: 0;
  --padding-end: 0;
  --padding-top: 0;
  --padding-bottom: 0;
  min-width: 44px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
}

.calendar-icon-only::part(text) {
  display: none;
}

.calendar-icon-only::part(icon) {
  font-size: 1.25rem;
}

.color-picker-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem 0;
  width: 100%;
}

.color-preview {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  border: 3px solid var(--ion-color-light);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.preset-colors {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.5rem;
}

.color-button {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
  padding: 0;
}

.color-button:hover {
  transform: scale(1.1);
}

.color-button.active {
  border-color: var(--ion-color-dark);
  box-shadow: 0 0 0 2px var(--ion-background-color), 0 0 0 4px var(--ion-color-primary);
}

.photo-item {
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 4px;
  cursor: pointer;
  background: var(--ion-color-light);
  display: block;
  text-decoration: none;
  position: relative;
  transition: all 0.2s ease;
}

.photo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.photo-actions {
  position: absolute;
  bottom: 8px;
  right: 8px;
  display: flex;
  gap: 6px;
  pointer-events: none;
  z-index: 12;
}

.photo-actions ion-button {
  width: 36px;
  height: 36px;
  --padding-start: 0;
  --padding-end: 0;
  --border-radius: 50%;
  --background: rgba(0, 0, 0, 0.55);
  color: #fff;
  pointer-events: auto;
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
}

.photo-actions ion-icon {
  font-size: 18px;
}

.photo-selected {
  outline: 4px solid var(--ion-color-primary);
  outline-offset: -4px;
  transform: scale(0.95);
}

.photo-container {
  position: relative;
  width: 100%;
}

.photo-item.selectable {
  cursor: pointer;
}

.photo-item.selected {
  outline: 4px solid var(--ion-color-success);
  outline-offset: -4px;
}

.selection-checkbox {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  padding: 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.selection-checkbox ion-checkbox {
  margin: 0;
}

.photo-item ion-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.video-thumbnail-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  background: #000;
  overflow: hidden;
}

.video-thumbnail {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
  background: #1a1a1a;
}

.video-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: auto;
  cursor: pointer;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 50%;
  padding: 8px;
  z-index: 10;
}

.video-overlay ion-icon {
  font-size: 48px;
  color: white;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
}

.video-preview-content {
  --background: #0d0d0d;
}

.video-preview-container {
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  width: 100vw;
  height: 100vh;
  box-sizing: border-box;
  background: #0d0d0d;
}

.video-preview-player {
  width: 100vw;
  height: 100vh;
  max-width: 100vw;
  max-height: 100vh;
  border-radius: 0;
  background: #000;
  object-fit: contain;
}
</style>

<style>
/* PhotoSwipe Custom Styles (global) */
.pswp__video-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.pswp__video-wrapper video {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
</style>
