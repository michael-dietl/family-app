<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="`/library/book/${bookId}`" />
        </ion-buttons>
        <ion-title>Cover bearbeiten</ion-title>
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
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonIcon, IonSpinner, IonBackButton, toastController } from '@ionic/vue';
import { checkmark } from 'ionicons/icons';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import ImageEditor from 'tui-image-editor';
import { db } from '@/services/database';
import 'tui-image-editor/dist/tui-image-editor.css';
import 'tui-color-picker/dist/tui-color-picker.css';

const route = useRoute();
const router = useRouter();
const editorContainer = ref<HTMLElement | null>(null);
const isSaving = ref(false);

const imageSrc = route.query.imageSrc as string;
const bookId = route.query.bookId as string;
const coverPath = route.query.coverPath as string;

let editorInstance: ImageEditor | null = null;

onMounted(() => {
  if (!editorContainer.value) return;

  // Image Editor initialisieren mit responsive Einstellungen
  const containerWidth = editorContainer.value.clientWidth;
  const containerHeight = editorContainer.value.clientHeight;

  editorInstance = new ImageEditor(editorContainer.value, {
    includeUI: {
      loadImage: {
        path: imageSrc,
        name: 'Cover'
      },
      theme: {
        'common.bi.image': '',
        'common.bisize.width': '0px',
        'common.bisize.height': '0px',
        'common.backgroundImage': 'none',
        'common.backgroundColor': '#1e1e1e',
        'common.border': '0px'
      },
      menu: ['crop', 'flip', 'rotate', 'draw', 'shape', 'icon', 'text', 'filter'],
      initMenu: 'filter',
      uiSize: {
        width: `${containerWidth}px`,
        height: `${containerHeight}px`
      },
      menuBarPosition: 'bottom'
    },
    cssMaxWidth: containerWidth,
    cssMaxHeight: containerHeight,
    selectionStyle: {
      cornerSize: 20,
      rotatingPointOffset: 70
    }
  });
});

onBeforeUnmount(() => {
  if (editorInstance) {
    editorInstance.destroy();
  }
});

const saveImage = async () => {
  if (!editorInstance) return;

  isSaving.value = true;

  try {
    const dataURL = editorInstance.toDataURL();
    const base64Data = dataURL.split(',')[1];

    // Speichere bearbeitetes Bild
    const fileName = `book_cover_${bookId}_${Date.now()}.jpg`;
    const result = await Filesystem.writeFile({
      path: `books/${fileName}`,
      data: base64Data,
      directory: Directory.Data,
      recursive: true
    });

    // Update Buch mit neuem Cover
    await db.updateBook(parseInt(bookId), { coverImage: result.uri });

    const toast = await toastController.create({
      message: 'Cover gespeichert',
      duration: 2000,
      color: 'success'
    });
    await toast.present();

    // Zurück zur Detailseite
    router.push(`/library/book/${bookId}`);

  } catch (error) {
    console.error('Error saving cover:', error);
    const toast = await toastController.create({
      message: 'Fehler beim Speichern',
      duration: 2000,
      color: 'danger'
    });
    await toast.present();
  } finally {
    isSaving.value = false;
  }
};
</script>

<style scoped>
.image-editor-container {
  width: 100%;
  height: 100%;
}

:deep(.tui-image-editor-container) {
  width: 100% !important;
  height: 100% !important;
}

:deep(.tui-image-editor-canvas-container) {
  background-color: #1e1e1e;
}

:deep(.tui-image-editor-main-container) {
  height: 100% !important;
}
</style>
