<template>
  <ion-modal
    :is-open="isOpen"
    @did-dismiss="handleClose"
    :initial-breakpoint="compact ? 0.7 : 1"
    :breakpoints="compact ? [0.5, 0.7, 0.95] : [1]"
    :class="{ 'compact-modal': compact }"
  >
    <ion-header>
      <ion-toolbar>
        <ion-buttons>
          <ion-button @click="handleClose">
            <ion-icon :icon="close" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ $t('auto.bild_bearbeiten') }}</ion-title>
        <ion-buttons>
          <ion-button @click="saveImage" color="primary" :disabled="isSaving">
            <ion-icon v-if="!isSaving" :icon="checkmark" />
            <ion-spinner v-else name="crescent" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-no-padding">
      <div
        ref="editorContainer"
        class="image-editor-container"
        :class="{ compact: compact }"
      ></div>
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
  compact?: boolean;
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

const getRotateConfig = (): { componentType: 'slider'; angle: number } => ({
  componentType: 'slider',
  angle: 0.1,
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
      Rotate: getRotateConfig(),
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
        Rotate: getRotateConfig(),
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
  width: 100vw;
  height: calc(100vh - env(safe-area-inset-bottom, 0px));
  background: #1e1e1e;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  transition: height 0.2s;
}


.image-editor-container.compact {
  width: 96vw;
  max-width: 600px;
  height: 90vh;
  max-height: 600px;
  margin: 0 auto;
  border-radius: 0 0 18px 18px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.18);
}


.compact-modal .modal-wrapper,
.compact-modal::part(content) {
  top: 0 !important;
  transform: none !important;
  border-radius: 0 0 18px 18px !important;
  margin: 0 auto !important;
  max-width: 600px;
  width: 96vw;
  height: 100vh !important;
  min-height: 0 !important;
  display: flex;
  flex-direction: column;
}

.compact-modal ion-header {
  border-radius: 0 0 12px 12px;
  padding-bottom: 0;
  min-height: 48px;
}

.compact-modal ion-toolbar {
  min-height: 44px;
  padding: 0 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.compact-modal ion-title {
  font-size: 1.08rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  flex: 1 1 auto;
  margin: 0 8px;
}

.compact-modal ion-buttons {
  flex: 0 0 auto;
}

.compact-modal ion-button,
.compact-modal ion-icon {
  --padding-start: 0;
  --padding-end: 0;
  font-size: 1.1em;
  min-width: 32px;
  min-height: 32px;
}

.image-editor-container.compact {
  width: 100%;
  max-width: 100%;
  height: calc(100% - 30px);
  max-height: calc(100% - 30px);
  margin: 0 0 30px 0;
  border-radius: 0 0 18px 18px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.18);
}

.compact-modal::part(backdrop) {
  background: rgba(0,0,0,0.7) !important;
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

:global(.FIE_rotate_button_left),
:global(.FIE_rotate_button_right) {
  display: none;
}

:global(.FIE_rotate-slider) {
  flex: 1;
  min-width: 0;
}
</style>
