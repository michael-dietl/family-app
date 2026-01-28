<template>
  <ion-modal :is-open="isOpen" @did-dismiss="handleClose" :initial-breakpoint="1" :breakpoints="[0, 1]">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="handleClose">
            <ion-icon :icon="close" />
          </ion-button>
        </ion-buttons>
        <ion-title>Bild bearbeiten</ion-title>
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

  editorInstance = new ImageEditor(editorContainer.value, {
    includeUI: {
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
      initMenu: 'filter',
      uiSize: {
        width: '100%',
        height: '100%',
      },
      menuBarPosition: 'bottom',
    },
    cssMaxWidth: document.documentElement.clientWidth,
    cssMaxHeight: document.documentElement.clientHeight - 120,
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
  height: calc(100vh - 156px);
  background: #1e1e1e;
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
</style>
