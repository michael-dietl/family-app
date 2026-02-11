<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="`/library/book/${bookId}`" />
        </ion-buttons>
        <ion-title>{{ $t('auto.cover_bearbeiten') }}</ion-title>
        <ion-buttons slot="end">
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
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonIcon, IonSpinner, IonBackButton, toastController } from '@ionic/vue';
import { checkmark } from 'ionicons/icons';
import { Filesystem } from '@capacitor/filesystem';
import FilerobotImageEditor from 'filerobot-image-editor';
import { db } from '@/services/database';
import {
  buildFilerobotConfig,
  loadFilerobotStyles,
  unloadFilerobotStyles,
  getDevicePixelRatio,
  getFilerobotLanguage,
  getImagePayload,
} from '@/utils/filerobotEditor';
import { buildSharedStoragePath, getSharedStorageDirectory } from '@/services/storagePaths';

const route = useRoute();
const router = useRouter();
const { locale } = useI18n();
const editorContainer = ref<HTMLElement | null>(null);
const isSaving = ref(false);

const imageSrc = route.query.imageSrc as string;
const bookId = route.query.bookId as string;

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
      console.warn('Unable to destroy Filerobot editor', error);
    }
    editorInstance = null;
  }
  scheduleStyleUnload();
};

const initEditor = async () => {
  if (!editorContainer.value || !imageSrc) return;
  cleanupEditor();

  const language = getFilerobotLanguage(locale.value);
  styleLoadPromise = loadFilerobotStyles();
  try {
    await styleLoadPromise;
    stylesLoaded = true;
  } finally {
    styleLoadPromise = null;
  }
  editorInstance = new FilerobotImageEditor(
    editorContainer.value,
    buildFilerobotConfig(imageSrc, language, {
      backgroundColor: '#1e1e1e',
    })
  );
  editorInstance.render();
};

onMounted(async () => {
  if (!editorContainer.value) return;
  await nextTick();
  setTimeout(() => initEditor(), 60);
});

onBeforeUnmount(() => {
  cleanupEditor();
});

const saveImage = async () => {
  if (!editorInstance) return;

  isSaving.value = true;

  try {
    const { imageData } = editorInstance.getCurrentImgData(
      { name: 'Cover', extension: 'jpg' },
      getDevicePixelRatio()
    );
    const payload = getImagePayload(imageData);
    const base64Data = payload.base64;

    const fileName = `book_cover_${bookId}_${Date.now()}.jpg`;
    const relativePath = buildSharedStoragePath('books', fileName);
    await Filesystem.mkdir({
      directory: getSharedStorageDirectory(),
      path: buildSharedStoragePath('books'),
      recursive: true
    });
    const result = await Filesystem.writeFile({
      path: relativePath,
      data: base64Data,
      directory: getSharedStorageDirectory(),
      recursive: true,
    });

    await db.updateBook(parseInt(bookId), { coverImage: result.uri });

    const toast = await toastController.create({
      message: 'Cover gespeichert',
      duration: 2000,
      color: 'success',
    });
    await toast.present();

    router.push(`/library/book/${bookId}`);
  } catch (error) {
    console.error('Error saving cover:', error);
    const toast = await toastController.create({
      message: 'Fehler beim Speichern',
      duration: 2000,
      color: 'danger',
    });
    await toast.present();
  } finally {
    isSaving.value = false;
  }
};
</script>

<style scoped>
.image-editor-container {
  width: min(960px, 100%);
  max-width: 100%;
  height: min(calc(100vh - 140px - env(safe-area-inset-bottom, 16px)), 780px);
  margin: 0 auto;
  padding-bottom: env(safe-area-inset-bottom, 24px);
  background: #1e1e1e;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

ion-content {
  --background: #1e1e1e;
  --padding-bottom: 16px;
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
