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
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonIcon, IonSpinner, IonBackButton, toastController } from '@ionic/vue';
import { checkmark, downloadOutline } from 'ionicons/icons';
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
const photoId = route.query.photoId as string;
const galleryId = route.params.galleryId as string;

let editorInstance: ImageEditor | null = null;

onMounted(() => {
  if (!editorContainer.value || !imageSrc) return;

  // Warte bis das Layout fertig ist
  setTimeout(() => {
    if (!editorContainer.value) return;
    
    const containerHeight = editorContainer.value.clientHeight;
    const containerWidth = editorContainer.value.clientWidth;
    
    console.log('Editor container dimensions:', { containerWidth, containerHeight });

    editorInstance = new ImageEditor(editorContainer.value, {
      includeUI: {
        loadImage: {
          path: imageSrc,
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
      cssMaxWidth: containerWidth,
      cssMaxHeight: containerHeight - 120, // Reserve more space for menu (was 100, now 120)
      usageStatistics: false,
    });
    
    // Ensure menu is always accessible after rendering
    setTimeout(() => {
      const menuBar = editorContainer.value?.querySelector('.tui-image-editor-menu');
      if (menuBar) {
        (menuBar as HTMLElement).style.pointerEvents = 'auto';
        (menuBar as HTMLElement).style.zIndex = '1000';
      }
    }, 200);
  }, 100);
});

const saveImage = async () => {
  if (!editorInstance) return;

  try {
    isSaving.value = true;
    
    const dataURL = editorInstance.toDataURL();
    console.log('Generated dataURL:', dataURL.substring(0, 50));
    
    const base64Data = dataURL.split(',')[1];
    
    let fileName = 'edited.jpg';
    if (imageSrc.includes('galleries/')) {
      const parts = imageSrc.split('/');
      fileName = parts[parts.length - 1] || 'edited.jpg';
    } else {
      fileName = `photo_${Date.now()}.jpg`;
    }
    
    console.log('Saving to:', `galleries/${galleryId}/${fileName}`);
    
    // Stelle sicher, dass das Verzeichnis existiert
    try {
      await Filesystem.mkdir({
        path: `galleries/${galleryId}`,
        directory: Directory.Data,
        recursive: true
      });
    } catch (mkdirError) {
      // Verzeichnis existiert bereits - OK
      console.log('Directory already exists or created');
    }
    
    // Speichere Datei im Filesystem
    await Filesystem.writeFile({
      path: `galleries/${galleryId}/${fileName}`,
      data: base64Data,
      directory: Directory.Data
    });
    
    // Aktualisiere filepath (DataURL) in der Datenbank
    if (photoId) {
      console.log('Updating photo in database for photoId:', photoId);
      await db.updatePhoto(Number(photoId), {
        thumbnail: dataURL,
        filepath: dataURL  // Update filepath mit neuem bearbeitetem Bild
      });
    }
    
    const toast = await toastController.create({
      message: 'Bild gespeichert',
      duration: 2000,
      color: 'success',
      position: 'bottom'
    });
    await toast.present();
    
    setTimeout(() => router.back(), 500);
  } catch (error) {
    console.error('Error saving image:', error);
    const toast = await toastController.create({
      message: `Fehler beim Speichern: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`,
      duration: 3000,
      color: 'danger',
      position: 'bottom'
    });
    await toast.present();
  } finally {
    isSaving.value = false;
  }
};

const downloadImage = () => {
  if (!editorInstance) return;
  
  const dataURL = editorInstance.toDataURL();
  const link = document.createElement('a');
  link.download = `edited_${Date.now()}.jpg`;
  link.href = dataURL;
  link.click();
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
  height: 100%;
  min-height: 0; /* Wichtig für Flexbox */
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  overflow: hidden;
}

ion-content {
  --background: #1e1e1e;
}
</style>

<style>
/* Global TUI Editor Styles - Fix für überlappende Elemente */

/* Container-Grundlayout */
.tui-image-editor-container {
  background: #1e1e1e !important;
  display: flex !important;
  flex-direction: column !important;
  height: 100% !important;
  width: 100% !important;
  overflow: hidden !important;
  position: relative !important;
}

/* Header ausblenden (wird von Ionic übernommen) */
.tui-image-editor-header {
  display: none !important;
}

/* Main Container - Canvas Bereich */
.tui-image-editor-main-container {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  overflow: hidden !important;
  display: flex !important;
  position: relative !important;
  z-index: 1 !important;
}

/* Canvas Container */
.tui-image-editor-canvas-container {
  background: #1e1e1e !important;
  height: 100% !important;
  width: 100% !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  position: relative !important;
  z-index: 1 !important; /* Ensure canvas is below menus */
}

.tui-image-editor-canvas-container canvas {
  max-width: 100% !important;
  max-height: 100% !important;
  object-fit: contain !important;
}

/* Menu Bar am unteren Rand */
.tui-image-editor-menu {
  background: var(--ion-background-color) !important;
  border-top: 1px solid var(--ion-color-light-shade) !important;
  flex-shrink: 0 !important;
  max-height: 60px !important;
  min-height: 60px !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  display: flex !important;
  z-index: 1000 !important; /* Ensure menu is on top */
  pointer-events: auto !important; /* Ensure menu is clickable */
  touch-action: manipulation !important; /* Ensure touch works */
  position: relative !important;
  padding: 0 !important;
}

/* Menu Items horizontal anordnen */
.tui-image-editor-menu > .tui-image-editor-item {
  flex: 0 0 auto !important;
  min-width: 70px !important;
  height: 60px !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 5px !important;
  color: var(--ion-text-color) !important;
  cursor: pointer !important;
  pointer-events: auto !important; /* CRITICAL: Menu items must be clickable */
  touch-action: manipulation !important; /* CRITICAL: Touch must work */
}

.tui-image-editor-menu > .tui-image-editor-item:hover {
  background: var(--ion-color-light) !important;
}

.tui-image-editor-menu > .tui-image-editor-item.active {
  background: var(--ion-color-primary) !important;
  color: white !important;
}

/* Submenu über dem Canvas */
.tui-image-editor-submenu {
  position: absolute !important;
  bottom: 60px !important; /* Über der Menu Bar */
  left: 0 !important;
  right: 0 !important;
  max-height: 200px !important;
  min-height: 100px !important;
  overflow-y: auto !important;
  background: var(--ion-background-color) !important;
  border-top: 1px solid var(--ion-color-light-shade) !important;
  z-index: 999 !important; /* Just below menu bar but above canvas */
  padding: 10px !important;
  display: none !important;
  pointer-events: auto !important; /* CRITICAL: Submenu must be clickable */
  touch-action: manipulation !important; /* CRITICAL: Touch must work */
}

.tui-image-editor-submenu.show {
  display: block !important;
}

/* Submenu Inhalte */
.tui-image-editor-submenu-item,
.tui-image-editor-button,
.tui-image-editor-partition > div {
  min-height: 44px !important;
  padding: 8px 12px !important;
  margin: 4px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  color: var(--ion-text-color) !important;
  background: var(--ion-color-light) !important;
  border-radius: 4px !important;
  border: 1px solid var(--ion-color-light-shade) !important;
  cursor: pointer !important;
  pointer-events: auto !important; /* CRITICAL: Buttons must be clickable */
  touch-action: manipulation !important; /* CRITICAL: Touch must work */
  white-space: nowrap !important;
}

.tui-image-editor-submenu-item:active,
.tui-image-editor-button:active {
  background: var(--ion-color-primary) !important;
  color: white !important;
}

/* Range Slider für bessere Touch-Bedienung */
.tui-image-editor-range-wrap {
  padding: 10px 20px !important;
  margin: 10px 0 !important;
}

.tui-image-editor-range {
  width: 100% !important;
  height: 40px !important;
}

.tui-image-editor-range-value {
  min-width: 50px !important;
  text-align: center !important;
  font-size: 16px !important;
  margin-left: 10px !important;
  color: var(--ion-text-color) !important;
}

/* Input Felder größer für Touch */
.tui-image-editor-submenu input[type="text"],
.tui-image-editor-submenu input[type="number"] {
  min-height: 44px !important;
  padding: 8px 12px !important;
  font-size: 16px !important;
  border: 1px solid var(--ion-color-light-shade) !important;
  border-radius: 4px !important;
  background: var(--ion-background-color) !important;
  color: var(--ion-text-color) !important;
}

/* Color Picker */
.tui-image-editor-partition.tui-image-editor-newline.tui-image-editor-color-picker-control {
  padding: 10px !important;
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 8px !important;
}

/* Icons größer machen */
.tui-image-editor-menu svg,
.tui-image-editor-item svg {
  width: 24px !important;
  height: 24px !important;
}

/* Partition Labels */
.tui-image-editor-partition label {
  color: var(--ion-text-color) !important;
  font-size: 14px !important;
  margin-bottom: 5px !important;
  display: block !important;
}

/* Checkboxes größer */
.tui-image-editor-checkbox-wrap {
  min-height: 44px !important;
  display: flex !important;
  align-items: center !important;
}

.tui-image-editor-checkbox {
  width: 24px !important;
  height: 24px !important;
  margin-right: 10px !important;
}

/* Help Text lesbarer */
.tui-image-editor-help-text {
  color: var(--ion-color-medium) !important;
  font-size: 12px !important;
  padding: 5px !important;
}
</style>
