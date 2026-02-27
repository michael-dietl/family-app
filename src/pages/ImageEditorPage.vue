<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button fill="clear" @click="handleClose">
            <ion-icon slot="icon-only" :icon="arrowBackOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ t('auto.bild_bearbeiten') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button color="primary" :disabled="isSaving || !editorReady" @click="handleSave">
            <ion-icon v-if="!isSaving" :icon="checkmark" />
            <ion-spinner v-else name="crescent" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-no-padding image-editor-content" :scroll-y="false">
      <div v-if="!imageSrc" class="empty-state">
        <p>Kein Bild zum Bearbeiten</p>
        <ion-button expand="block" @click="handleClose">{{ t('auto.zurueck') }}</ion-button>
      </div>
      <div v-else ref="editorContainer" class="image-editor-container"></div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonSpinner, toastController } from '@ionic/vue';
import { arrowBackOutline, checkmark } from 'ionicons/icons';
import FilerobotImageEditor from 'filerobot-image-editor';
import {
  buildFilerobotConfig,
  convertSavedImageDataToBlob,
  getDevicePixelRatio,
  getFilerobotLanguage,
  loadFilerobotStyles,
  unloadFilerobotStyles,
} from '@/utils/filerobotEditor';
import { storeEditedBookCover } from '@/services/bookCoverStorage';
import {
  useImageEditorNavigationContext,
  clearImageEditorNavigationContext
} from '@/composables/useImageEditorNavigation';

const router = useRouter();
const route = useRoute();
const { t, locale } = useI18n();
const { editorContext } = useImageEditorNavigationContext();

const editorContainer = ref<HTMLElement | null>(null);
const isSaving = ref(false);
const editorReady = ref(false);
let editorInstance: InstanceType<typeof FilerobotImageEditor> | null = null;
let stylesLoaded = false;
let styleLoadPromise: Promise<void> | null = null;
let initTimeout: ReturnType<typeof setTimeout> | null = null;

const imageSrc = computed(() => editorContext.value?.imageSrc ?? '');
const returnPath = computed(() => (route.query.return as string) || '');
let isNavigating = false;

const goBack = () => {
  if (isNavigating) return;
  isNavigating = true;
  clearImageEditorNavigationContext();
  if (returnPath.value) {
    router.replace(returnPath.value);
  } else {
    router.back();
  }
};

const handleClose = () => {
  editorContext.value?.onClose?.();
  goBack();
};

const getRotateConfig = (): { componentType: 'slider'; angle: number } => ({
  componentType: 'slider',
  angle: 0.1
});

const scheduleStyleUnload = () => {
  if (styleLoadPromise) {
    const pending = styleLoadPromise;
    styleLoadPromise = null;
    pending.finally(() => {
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
  if (initTimeout) {
    clearTimeout(initTimeout);
    initTimeout = null;
  }

  if (editorInstance) {
    try {
      editorInstance.terminate();
    } catch (error) {
      console.warn('Failed to terminate Filerobot Image Editor', error);
    }
    editorInstance = null;
  }

  editorReady.value = false;
  scheduleStyleUnload();
};

const initEditor = async () => {
  if (!editorContainer.value || !imageSrc.value) return;
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
    buildFilerobotConfig(imageSrc.value, language, {
      onClose: handleClose,
      Rotate: getRotateConfig()
    })
  );
  editorInstance.render();
  editorReady.value = true;
};

const scheduleInit = () => {
  if (initTimeout) {
    clearTimeout(initTimeout);
  }
  initTimeout = setTimeout(() => {
    initEditor();
    initTimeout = null;
  }, 150);
};

watch(imageSrc, (newSrc) => {
  if (!newSrc) {
    cleanupEditor();
    return;
  }
  scheduleInit();
});

const handleSave = async () => {
  if (isSaving.value || !editorInstance) return;
  const currentContext = editorContext.value;

  isSaving.value = true;
  try {
    const { imageData } = editorInstance.getCurrentImgData(
      { name: 'photo', extension: 'jpg' },
      getDevicePixelRatio()
    );
    const blob = await convertSavedImageDataToBlob(imageData);
    let saved = false;
    if (currentContext) {
      await currentContext.onSave(blob);
      saved = true;
    }
    const bookCoverIdParam = route.query.bookCoverId as string | undefined;
    const bookCoverId = bookCoverIdParam ? parseInt(bookCoverIdParam, 10) : NaN;
    if (!saved && bookCoverIdParam && !Number.isNaN(bookCoverId)) {
      saved = true;
      await storeEditedBookCover(bookCoverId, blob);
      const toast = await toastController.create({
        message: 'Cover gespeichert',
        duration: 2000,
        color: 'success'
      });
      await toast.present();
    }
    if (saved) {
      goBack();
    } else {
      console.warn('ImageEditorPage: no save handler available');
    }
  } catch (error) {
    console.error('Error saving edited image: ', error);
  } finally {
    isSaving.value = false;
  }
};

onMounted(() => {
  if (imageSrc.value) {
    scheduleInit();
  }
});

onBeforeUnmount(() => {
  cleanupEditor();
  clearImageEditorNavigationContext();
});
</script>

<style scoped>
.image-editor-content {
  min-height: 100vh;
  height: 100vh;
  width: 100vw;
  display: flex;
  background: #fff;
}

.image-editor-container {
  width: 100%;
  flex: 1;
  min-height: 0;
  background: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  margin-top: 0;
  padding-top: 0;
  margin-bottom: env(safe-area-inset-bottom, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  height: calc(100% - 60px);
  border-radius: 0;
}

:global(.FIE_main-container),
:global(.FIE_editor-content) {
  border-radius: 0;
}

.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  gap: 6px;
  text-align: center;
}
</style>
