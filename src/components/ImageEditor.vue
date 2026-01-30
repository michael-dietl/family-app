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
import { IonModal, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonIcon, IonSpinner } from '@ionic/vue';
import { close, checkmark } from 'ionicons/icons';
import ImageEditor from 'tui-image-editor';
import 'tui-image-editor/dist/tui-image-editor.css';
import 'tui-color-picker/dist/tui-color-picker.css';

interface Props {
  isOpen: boolean;
  imageSrc: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', imageBlob: Blob): void;
}>();

const editorContainer = ref<HTMLElement | null>(null);
const isSaving = ref(false);
let editorInstance: ImageEditor | null = null;

const initEditor = () => {
  if (!editorContainer.value || !props.imageSrc) return;

  // Zerstöre vorhandene Instanz
  if (editorInstance) {
    editorInstance.destroy();
  }

  // Berechne verfügbare Höhe basierend auf dem sichtbaren Editor-Container
  // (berücksichtigt Safe-Areas / Navigation-Bar). Fallback zu window.innerHeight.
  const containerEl = editorContainer.value as HTMLElement;
  const availableHeight = (containerEl?.clientHeight && containerEl.clientHeight > 0)
    ? containerEl.clientHeight
    : Math.max(window.innerHeight - 126, 200);

  editorInstance = new ImageEditor(editorContainer.value, {
    includeUI: {
      menuBarPosition: 'top',
      loadImage: {
        path: props.imageSrc,
        name: 'EditImage',
      },
      theme: {
        'common.bi.image': '',
        'common.bisize.width': '0px',
        'common.bisize.height': '0px',
        'common.backgroundImage': 'none',
        'common.backgroundColor': '#1e1e1e',
        'common.border': '0px',
      },
      menu: ['crop', 'flip', 'rotate', 'draw', 'shape', 'icon', 'text', 'filter'],
      initMenu: 'crop',
      uiSize: {
        width: '100%',
        height: `${availableHeight}px`,
      },
    },
    cssMaxWidth: containerEl?.clientWidth || window.innerWidth,
    cssMaxHeight: availableHeight,
    selectionStyle: {
      cornerSize: 50,
      rotatingPointOffset: 100,
    },
    usageStatistics: false,
  });
};

watch(() => props.isOpen, (newVal) => {
  if (newVal && props.imageSrc) {
    setTimeout(() => initEditor(), 100);
  }
});

const saveImage = async () => {
  if (!editorInstance) return;

  try {
    isSaving.value = true;
    
    // Hole bearbeitetes Bild als Data URL
    const dataURL = editorInstance.toDataURL();
    
    // Konvertiere zu Blob
    const response = await fetch(dataURL);
    const blob = await response.blob();
    
    emit('save', blob);
  } catch (error) {
    console.error('Error saving image:', error);
  } finally {
    isSaving.value = false;
  }
};

const handleClose = () => {
  if (editorInstance) {
    editorInstance.destroy();
    editorInstance = null;
  }
  emit('close');
};

onBeforeUnmount(() => {
  if (editorInstance) {
    editorInstance.destroy();
  }
});
</script>

<style scoped>
.image-editor-container {
  width: 100%;
  /* Reserve space for header (56px) and device safe area (nav bar)
     Use env(safe-area-inset-bottom) when available to avoid overlap. */
  box-sizing: border-box;
  padding-bottom: env(safe-area-inset-bottom, 16px);
  height: calc(100vh - 56px - env(safe-area-inset-bottom, 16px));
  max-height: calc(100vh - 56px - env(safe-area-inset-bottom, 16px));
  background: #1e1e1e;
  overflow: hidden;
  position: relative;
}
</style>

<style>
/* Global TUI Editor Styles */
.tui-image-editor-container {
  background: #1e1e1e !important;
}

.tui-image-editor-canvas-container {
  background: #1e1e1e !important;
}

.tui-image-editor-menu {
  background: var(--ion-background-color) !important;
  border-top: 1px solid var(--ion-color-light-shade) !important;
}

.tui-image-editor-item {
  color: var(--ion-text-color) !important;
}

/* Crop Grid Lines - Gitternetzwerk sichtbar machen */
.tui-image-editor-canvas-container .tui-image-editor-grid-line {
  stroke: rgba(255, 255, 255, 0.5) !important;
  stroke-width: 1 !important;
}

.tui-image-editor-canvas-container .tui-image-editor-grid-visual {
  stroke: rgba(255, 255, 255, 0.5) !important;
  stroke-width: 1 !important;
}

/* Crop-Bereich hervorheben */
.tui-image-editor-canvas-container .cropper-crop-box {
  outline: 2px solid rgba(255, 255, 255, 0.8) !important;
}

.tui-image-editor-canvas-container .cropper-view-box {
  outline: 1px solid rgba(255, 255, 255, 0.5) !important;
}

/* Additional selectors to catch cropperjs/tui variants where grid lines are rendered differently */
.tui-image-editor-canvas-container .cropper-line,
.tui-image-editor-canvas-container .cropper-dashed,
.tui-image-editor-canvas-container .cropper-face,
.tui-image-editor-canvas-container .cropper-center {
  background: rgba(255,255,255,0.35) !important;
}

.tui-image-editor-canvas-container .cropper-line {
  height: 1px !important;
}

/* If the grid is SVG-based with .grid-line or .grid-visual classes */
.tui-image-editor-canvas-container .grid-line,
.tui-image-editor-canvas-container .grid-visual {
  stroke: rgba(255,255,255,0.45) !important;
  stroke-width: 1 !important;
}
</style>
