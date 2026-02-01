<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="`/gallery/${galleryId}`" />
        </ion-buttons>
        <ion-title>{{ $t('auto.bild_bearbeiten') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="downloadImage" :disabled="isSaving">
            <ion-icon :icon="downloadOutline" />
          </ion-button>
          <ion-button @click="saveImage" color="primary" :disabled="isSaving">
            <ion-icon v-if="!isSaving" :icon="checkmark" />
            <ion-spinner v-else name="crescent" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-no-padding" :scroll-y="false">
      <div ref="editorContainer" class="image-editor-container"></div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonIcon, IonSpinner, IonBackButton, toastController } from '@ionic/vue';
import { checkmark, downloadOutline } from 'ionicons/icons';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import FilerobotImageEditor from 'filerobot-image-editor';
import { db } from '@/services/database';
import {
  buildFilerobotConfig,
  getDevicePixelRatio,
  getFilerobotLanguage,
  getImagePayload,
  loadFilerobotStyles,
  unloadFilerobotStyles,
} from '@/utils/filerobotEditor';

const route = useRoute();
const router = useRouter();
const editorContainer = ref<HTMLElement | null>(null);
const isSaving = ref(false);

const { locale } = useI18n();
const imageSrc = route.query.imageSrc as string;
const photoId = route.query.photoId as string;
const galleryId = route.params.galleryId as string;

let editorInstance: InstanceType<typeof FilerobotImageEditor> | null = null;
let stylesLoaded = false;
let styleLoadPromise: Promise<void> | null = null;

const scheduleStyleUnload = () => {
  if (styleLoadPromise) {
    const promise = styleLoadPromise;
    styleLoadPromise = null;
    promise.finally(() => {
      unloadFilerobotStyles();
      stylesLoaded = false;
    });
    return;
  }

  if (stylesLoaded) {
    unloadFilerobotStyles();
    stylesLoaded = false;
  }
};

const cleanupEditor = () => {
  if (editorInstance) {
    try {
      editorInstance.terminate();
    } catch (error) {
      console.warn('Failed to destroy Filerobot image editor', error);
    }
    editorInstance = null;
  }
  scheduleStyleUnload();
};

const initEditor = async () => {
  if (!editorContainer.value || !imageSrc) return;
  cleanupEditor();

  styleLoadPromise = loadFilerobotStyles();
  try {
    await styleLoadPromise;
    stylesLoaded = true;
  } finally {
    styleLoadPromise = null;
  }
  const language = getFilerobotLanguage(locale.value);
  editorInstance = new FilerobotImageEditor(
    editorContainer.value,
    buildFilerobotConfig(imageSrc, language, {
      backgroundColor: '#1e1e1e',
    })
  );
  editorInstance.render();
};

onMounted(() => {
  setTimeout(() => initEditor(), 150);
});

const saveImage = async () => {
  if (!editorInstance) return;

  try {
    isSaving.value = true;
    const { imageData } = editorInstance.getCurrentImgData(
      { name: 'EditImage', extension: 'jpg' },
      getDevicePixelRatio()
    );

    const payload = getImagePayload(imageData);
    const base64Data = payload.base64;
    const dataURL = payload.dataUrl;

    let fileName = 'edited.jpg';
    if (imageSrc.includes('galleries/')) {
      const parts = imageSrc.split('/');
      fileName = parts[parts.length - 1] || 'edited.jpg';
    } else {
      fileName = `photo_${Date.now()}.jpg`;
    }

    console.log('Saving to:', `galleries/${galleryId}/${fileName}`);

    try {
      await Filesystem.mkdir({
        path: `galleries/${galleryId}`,
        directory: Directory.Data,
        recursive: true,
      });
    } catch (mkdirError) {
      console.log('Directory already exists or created');
    }

    await Filesystem.writeFile({
      path: `galleries/${galleryId}/${fileName}`,
      data: base64Data,
      directory: Directory.Data,
    });

    if (photoId) {
      console.log('Updating photo in database for photoId:', photoId);
      await db.updatePhoto(Number(photoId), {
        thumbnail: dataURL,
        filepath: dataURL,
      });
    }

    const toast = await toastController.create({
      message: 'Bild gespeichert',
      duration: 2000,
      color: 'success',
      position: 'bottom',
    });
    await toast.present();

    setTimeout(() => router.replace(`/gallery/${galleryId}`), 500);
  } catch (error) {
    console.error('Error saving image:', error);
    const toast = await toastController.create({
      message: `Fehler beim Speichern: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`,
      duration: 3000,
      color: 'danger',
      position: 'bottom',
    });
    await toast.present();
  } finally {
    isSaving.value = false;
  }
};

const downloadImage = () => {
  if (!editorInstance) return;

  const { imageData } = editorInstance.getCurrentImgData(
    { name: 'EditImage', extension: 'jpg' },
    getDevicePixelRatio()
  );
  const payload = getImagePayload(imageData);
  const link = document.createElement('a');
  link.download = `edited_${Date.now()}.jpg`;
  link.href = payload.dataUrl;
  link.click();
};

onBeforeUnmount(() => {
  cleanupEditor();
});
</script>

<style scoped>
.image-editor-container {
  width: 100%;
  height: 100%;
  padding-bottom: env(safe-area-inset-bottom, 16px);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  overflow: hidden;
}

ion-content {
  --background: #1e1e1e;
  --padding-bottom: 0;
}

:global(.FIE_main-container),
:global(.FIE_editor-content) {
  width: 100%;
  height: 100%;
}

:global(.FIE_editor-content) {
  flex: 1;
  background: transparent;
}

:global(.FIE_topbar-buttons-wrapper) {
  display: none;
}

:global(.FIE_topbar-history-buttons) {
  gap: 8px;
}
</style>
