<template>
  <ion-modal :is-open="isOpen" @did-dismiss="handleClose" :initial-breakpoint="0.95" :breakpoints="[0.2, 0.5, 0.95]">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="handleClose">
            <ion-icon :icon="close" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ $t('auto.bild_bearbeiten') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="saveImage" color="primary" :disabled="isSaving">
            <ion-icon v-if="!isSaving" :icon="checkmark" />
            <ion-spinner v-else name="crescent" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-no-padding">
      <div ref="editorContainer" class="image-editor-container"></div>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { IonModal, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonIcon, IonSpinner } from '@ionic/vue';
import { close, checkmark } from 'ionicons/icons';
import FilerobotImageEditor from 'filerobot-image-editor';
import {
  buildFilerobotConfig,
  convertSavedImageDataToBlob,
  getDevicePixelRatio,
  getFilerobotLanguage,
  loadFilerobotStyles,
  unloadFilerobotStyles,
} from '@/utils/filerobotEditor';

interface Props {
  isOpen: boolean;
  imageSrc: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', imageBlob: Blob): void;
}>();

const { locale } = useI18n();

const editorContainer = ref<HTMLElement | null>(null);
const isSaving = ref(false);
let editorInstance: InstanceType<typeof FilerobotImageEditor> | null = null;
let initTimeout: ReturnType<typeof setTimeout> | null = null;
let closing = false;
let stylesLoaded = false;
let styleLoadPromise: Promise<void> | null = null;

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

  scheduleStyleUnload();
};

const handleClose = () => {
  if (closing) return;
  closing = true;
  cleanupEditor();
  emit('close');
  closing = false;
};

const initEditor = async () => {
  if (!editorContainer.value || !props.imageSrc || !props.isOpen) return;

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
    buildFilerobotConfig(props.imageSrc, language, {
      onClose: handleClose,
    })
  );
  editorInstance.render();
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

watch(
  () => props.isOpen,
  (isOpen) => {
    if (isOpen && props.imageSrc) {
      scheduleInit();
    } else {
      cleanupEditor();
    }
  },
  { immediate: true }
);

watch(() => props.imageSrc, (newSrc) => {
  if (editorInstance && newSrc) {
    const language = getFilerobotLanguage(locale.value);
    editorInstance.render(
      buildFilerobotConfig(newSrc, language, {
        onClose: handleClose,
        backgroundColor: '#1e1e1e',
      })
    );
  }
});

const saveImage = async () => {
  if (!editorInstance) return;

  isSaving.value = true;
  try {
    const { imageData } = editorInstance.getCurrentImgData(
      { name: 'photo', extension: 'jpg' },
      getDevicePixelRatio()
    );
    const blob = await convertSavedImageDataToBlob(imageData);
    emit('save', blob);
  } catch (error) {
    console.error('Error saving edited image', error);
  } finally {
    isSaving.value = false;
  }
};

onBeforeUnmount(() => {
  cleanupEditor();
});
</script>

<style scoped>
.image-editor-container {
  width: 100%;
  height: calc(100vh - 56px - env(safe-area-inset-bottom, 16px));
  background: #1e1e1e;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

ion-content {
  --background: #1e1e1e;
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
