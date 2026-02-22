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
import { IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonSpinner } from '@ionic/vue';
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
  if (!currentContext) return;

  isSaving.value = true;
  try {
    const { imageData } = editorInstance.getCurrentImgData(
      { name: 'photo', extension: 'jpg' },
      getDevicePixelRatio()
    );
    const blob = await convertSavedImageDataToBlob(imageData);
    await currentContext.onSave(blob);
    goBack();
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
  display: flex;
}

.image-editor-container {
  width: 100%;
  flex: 1;
  min-height: 0;
  background: #1e1e1e;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  margin-top: calc(env(safe-area-inset-top, 0px) + 8px);
  margin-bottom: env(safe-area-inset-bottom, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
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
