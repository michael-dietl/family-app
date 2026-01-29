<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button v-if="!selectionMode" default-href="/gallery" />
          <ion-button v-else @click="cancelSelectionMode">
            <ion-icon :icon="close" />
          </ion-button>
        </ion-buttons>
        <ion-title v-if="!selectionMode">{{ currentGallery?.name || 'Gallerie' }}</ion-title>
        <ion-title v-else>{{ selectedPhotos.size }} ausgewählt</ion-title>
        <ion-buttons slot="end">
          <ion-button v-if="selectedPhoto && !selectionMode" @click="clearSelection">
            <ion-icon :icon="closeCircle" />
          </ion-button>
          <ion-button v-if="selectedPhoto && !selectionMode" @click="openSelectedEditor" color="primary">
            <ion-icon :icon="create" />
          </ion-button>
          <ion-button v-if="!selectedPhoto && !selectionMode" @click="showPhotoOptions">
            <ion-icon :icon="add" />
          </ion-button>
          <ion-button v-if="!selectedPhoto && !selectionMode" @click="showGalleryMenu">
            <ion-icon :icon="ellipsisVertical" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <!-- Mehrfachselektion Toolbar -->
      <ion-toolbar v-if="selectionMode" color="primary">
        <ion-buttons slot="start">
          <ion-button @click="selectAllPhotos">
            <ion-icon slot="start" :icon="checkmarkCircle" />
            Alle auswählen
          </ion-button>
        </ion-buttons>
        <ion-buttons slot="end">
          <ion-button @click="deleteSelectedPhotos" :disabled="selectedPhotos.size === 0">
            <ion-icon slot="start" :icon="trashOutline" />
            Löschen
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">{{ currentGallery?.name }}</ion-title>
        </ion-toolbar>
      </ion-header>

      <!-- Description -->
      <div v-if="currentGallery?.description" class="gallery-description ion-padding">
        <p>{{ currentGallery.description }}</p>
      </div>

      <!-- View Toggle (nur wenn Fotos vorhanden) -->
      <div v-if="!isLoading && photos.length > 0" class="view-toggle ion-padding-horizontal">
        <ion-segment :value="currentView" @ionChange="handleViewChange">
          <ion-segment-button value="grid">
            <ion-icon :icon="gridOutline" />
            <ion-label>Fotos</ion-label>
          </ion-segment-button>
          <ion-segment-button value="map">
            <ion-icon :icon="mapOutline" />
            <ion-label>Karte</ion-label>
          </ion-segment-button>
        </ion-segment>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="loading-container">
        <ion-spinner />
      </div>

      <!-- Upload Progress -->
      <div v-else-if="isProcessing && uploadProgress.total > 0" class="upload-progress ion-padding">
        <ion-spinner />
        <p>Verarbeite Fotos: {{ uploadProgress.current }} / {{ uploadProgress.total }}</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="photos.length === 0" class="empty-state">
        <ion-icon :icon="cameraOutline" size="large" />
        <h2>Keine Fotos vorhanden</h2>
        <p>Füge Fotos mit dem + Button hinzu</p>
      </div>

      <!-- Photo Grid -->
      <ion-grid v-else-if="currentView === 'grid'" id="photo-gallery">
        <!-- Mehrfachselektion Button -->
        <ion-row v-if="!selectionMode && photos.length > 0">
          <ion-col size="12">
            <ion-button expand="block" fill="outline" @click="startSelectionMode">
              <ion-icon slot="start" :icon="checkmarkCircle" />
              Mehrfachauswahl
            </ion-button>
          </ion-col>
        </ion-row>
        
        <ion-row>
          <ion-col 
            v-for="(photo, index) in photos" 
            :key="photo.id" 
            size="4" 
            size-md="3" 
            size-lg="2"
          >
            <div class="photo-container">
              <a
                v-if="!selectionMode"
                :href="getImageSrc(photo.filepath)"
                :data-pswp-width="photo.width || 1920"
                :data-pswp-height="photo.height || 1080"
                target="_blank"
                @click="handlePhotoClick(photo, index, $event)"
                @touchstart.passive="handleTouchStart(photo, $event)"
                @touchend.passive="handleTouchEnd"
                @touchmove.passive="handleTouchEnd"
                class="photo-item"
                :class="{ 'photo-selected': selectedPhoto?.id === photo.id }"
              >
              <div v-if="photo.isVideo" class="video-thumbnail-wrapper">
                <video 
                  :src="getImageSrc(photo.filepath)"
                  :poster="getVideoPoster(photo.id)"
                  class="video-thumbnail"
                  preload="none"
                  muted
                  playsinline
                ></video>
                <div class="video-overlay">
                  <ion-icon :icon="playCircle" />
                </div>
              </div>
              <img 
                v-else
                :src="getImageSrc(photo.filepath)" 
                :alt="photo.filename"
                loading="lazy"
                class="photo-img"
              />
              </a>
              
              <!-- Mehrfachselektion Modus -->
              <div
                v-else
                @click="togglePhotoSelection(photo)"
                class="photo-item selectable"
                :class="{ 'selected': selectedPhotos.has(photo.id!) }"
              >
                <div v-if="photo.isVideo" class="video-thumbnail-wrapper">
                  <video 
                    :src="getImageSrc(photo.filepath)"
                    :poster="getVideoPoster(photo.id)"
                    class="video-thumbnail"
                    preload="none"
                    muted
                    playsinline
                  ></video>
                  <div class="video-overlay">
                    <ion-icon :icon="playCircle" />
                  </div>
                </div>
                <img 
                  v-else
                  :src="getImageSrc(photo.filepath)" 
                  :alt="photo.filename"
                  loading="lazy"
                  class="photo-img"
                />
                <div class="selection-checkbox">
                  <ion-checkbox :checked="selectedPhotos.has(photo.id!)" />
                </div>
              </div>
            </div>
          </ion-col>
        </ion-row>
      </ion-grid>

      <!-- Map View -->
      <div v-else-if="currentView === 'map'" class="map-view ion-padding">
        <GalleryMap :photos="photos" @photo-click="openPhoto" />
      </div>
    </ion-content>
    
    <!-- Location Picker Modal -->
    <LocationPickerModal 
      :is-open="showLocationPicker"
      @confirm="handleLocationConfirm"
      @cancel="handleLocationCancel"
    />
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount, onActivated } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonBackButton,
  IonIcon,
  IonGrid,
  IonRow,
  IonCol,
  IonImg,
  IonSpinner,
  IonSegment,
  IonSegmentButton,
  IonCheckbox,
  IonLabel,
  actionSheetController,
  alertController
} from '@ionic/vue';
import {
  add,
  ellipsisVertical,
  cameraOutline,
  camera,
  images,
  gridOutline,
  mapOutline,
  trashOutline,
  playCircle,
  create,
  closeCircle,
  close,
  checkmarkCircle
} from 'ionicons/icons';
import { CameraSource } from '@capacitor/camera';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { useGallery } from '@/composables/useGallery';
import { usePhoto } from '@/composables/usePhoto';
import { useLightbox } from '@/composables/useLightbox';
import { extractExifFromUri } from '@/services/exif';
import GalleryMap from '@/components/GalleryMap.vue';
import LocationPickerModal from '@/components/LocationPickerModal.vue';
import type { Photo } from '@/services/database';

const route = useRoute();
const router = useRouter();
const { currentGallery, photos, isLoading, loadGallery, deleteGallery } = useGallery();
const { takePhoto, pickSinglePhoto, pickMultiplePhotos, savePhoto, saveMultiplePhotos, deletePhoto: removePhoto, isProcessing, extractExifData } = usePhoto();
const { initLightbox, openLightbox, destroyLightbox } = useLightbox();

const uploadProgress = ref({ current: 0, total: 0 });
const currentView = ref<'grid' | 'map'>('grid');
const cacheBuster = ref(Date.now());
const selectedPhoto = ref<Photo | null>(null);

// Mehrfachselektion
const selectionMode = ref(false);
const selectedPhotos = ref<Set<number>>(new Set());

// Manuelle GPS-Eingabe
const showLocationPicker = ref(false);
const pendingPhotoData = ref<{
  photoUri: string;
  galleryId: number;
  filename?: string;
  cameraExifData?: any;
} | null>(null);

let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let longPressPhoto: Photo | null = null;

const handlePhotoClick = (photo: Photo, index: number, event: Event) => {
  event.preventDefault();
  
  // Wenn Foto selektiert ist, nichts tun (Editor wird über Button geöffnet)
  if (selectedPhoto.value?.id === photo.id) {
    return;
  }
  
  // Sonst: Öffne Lightbox
  openLightbox(index);
};

const handleTouchStart = (photo: Photo, event: TouchEvent) => {
  event.preventDefault();
  longPressPhoto = photo;
  
  // 5 Sekunden Long-Press für Selektion
  longPressTimer = setTimeout(() => {
    Haptics.impact({ style: ImpactStyle.Medium });
    selectedPhoto.value = photo;
    longPressTimer = null;
  }, 5000);
};

const handleTouchEnd = () => {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  longPressPhoto = null;
};

const handleViewChange = (event: CustomEvent) => {
  const value = event.detail.value;
  if (value === 'grid' || value === 'map') {
    currentView.value = value;
  }
};

onMounted(async () => {
  const galleryId = parseInt(route.params.id as string);
  if (galleryId) {
    await loadGallery(galleryId);
  }
});

// Reload gallery when returning from editor
onActivated(async () => {
  const galleryId = parseInt(route.params.id as string);
  if (galleryId) {
    console.log('Gallery reactivated - reloading photos');
    cacheBuster.value = Date.now();
    await loadGallery(galleryId);
  }
});

// Initialisiere Lightbox wenn Fotos geladen sind
watch(photos, (newPhotos) => {
  if (newPhotos.length > 0) {
    setTimeout(() => {
      initLightbox('#photo-gallery', newPhotos);
    }, 100);
  }
}, { immediate: true });

onBeforeUnmount(() => {
  destroyLightbox();
});

const showPhotoOptions = async () => {
  const actionSheet = await actionSheetController.create({
    header: 'Foto hinzufügen',
    buttons: [
      {
        text: 'Foto aufnehmen',
        icon: camera,
        handler: () => handleAddPhoto(CameraSource.Camera)
      },
      {
        text: 'Ein Foto auswählen',
        icon: images,
        handler: () => handleAddPhotoFromGallery()
      },
      {
        text: 'Mehrere Fotos auswählen',
        icon: images,
        handler: () => handleAddMultiplePhotos()
      },
      {
        text: 'Abbrechen',
        role: 'cancel'
      }
    ]
  });
  await actionSheet.present();
};

const handleAddPhoto = async (source: CameraSource) => {
  try {
    const galleryId = parseInt(route.params.id as string);
    const photo = await takePhoto(source);
    
    // WICHTIG: Verwende photo.path statt webPath für Android Gallery (content:// URI)
    const photoUri = photo.path || photo.webPath;
    
    if (photoUri) {
      console.log('📸 Photo captured:', photoUri);
      console.log('📋 Photo EXIF from Camera API:', photo.exif);
      
      let hasGPS = false;
      
      // Prüfe zuerst ob Camera API GPS-Daten hat
      if (photo.exif?.GPSLatitude && photo.exif?.GPSLongitude) {
        console.log('✅ GPS-Daten in Camera API gefunden');
        hasGPS = true;
      } else {
        // Fallback: Für Galerie-Import einfach direkt speichern - GPS wird in savePhoto() extrahiert
        console.log('🔍 Keine GPS in Camera API - speichere Foto, GPS wird in savePhoto() extrahiert');
        // Keine EXIF-Prüfung hier - das macht savePhoto()
        hasGPS = true; // Annahme dass Bild GPS hat oder User wählt manuell
      }
      
      if (!hasGPS) {
        // Zeige Location Picker Dialog
        console.log('⚠️ Keine GPS-Daten gefunden - zeige Location Picker');
        pendingPhotoData.value = {
          photoUri: photoUri,
          galleryId,
          cameraExifData: photo.exif
        };
        showLocationPicker.value = true;
      } else {
        // GPS vorhanden, speichere direkt
        console.log('✅ GPS vorhanden - speichere Foto direkt');
        await savePhoto(photoUri, galleryId, undefined, photo.exif);
        console.log('Photo saved successfully with GPS');
        
        // WICHTIG: Galerie neu laden, damit das neue Foto sofort in der Liste erscheint
        await loadGallery(galleryId);
        cacheBuster.value = Date.now(); // Force re-render für Thumbnails
      }
    }
  } catch (error) {
    console.error('❌ Error adding photo:', error);
    console.error('❌ Error details:', JSON.stringify(error, null, 2));
    const errorMessage = error instanceof Error ? error.message : String(error);
    const alert = await alertController.create({
      header: 'Fehler',
      message: `Das Foto konnte nicht hinzugefügt werden.\n\nDetails: ${errorMessage}`,
      buttons: ['OK']
    });
    await alert.present();
  }
};

// Handler für Einzelfoto (Kamera oder Galerie via Camera API)
// Die Camera API gibt photo.exif mit GPS-Daten zurück!
const handleAddPhotoFromGallery = async () => {
  try {
    const galleryId = parseInt(route.params.id as string);
    
    // Verwende Camera API mit Photos source - die gibt EXIF mit GPS zurück!
    const photo = await takePhoto(CameraSource.Photos);
    
    if (photo.webPath) {
      console.log('📸 Photo selected:', photo.webPath);
      console.log('📋 Photo EXIF from Camera API:', photo.exif);
      
      let hasGPS = false;
      
      // Prüfe zuerst ob Camera API GPS-Daten hat
      if (photo.exif?.GPSLatitude && photo.exif?.GPSLongitude) {
        console.log('✅ GPS-Daten in Camera API gefunden');
        hasGPS = true;
      } else {
        // Fallback: Extrahiere EXIF aus Bild (für Fotos ohne Camera API EXIF)
        console.log('🔍 Keine GPS in Camera API - extrahiere EXIF aus Bild...');
        const exifData = await extractExifData(photo.webPath);
        console.log('📊 Extracted EXIF data:', exifData);
        hasGPS = !!(exifData as any).latitude && !!(exifData as any).longitude;
        console.log('📍 Has GPS from image:', hasGPS, 'Lat:', (exifData as any).latitude, 'Lng:', (exifData as any).longitude);
      }
      
      if (!hasGPS) {
        // Zeige Location Picker Dialog
        console.log('⚠️ Keine GPS-Daten gefunden - zeige Location Picker');
        pendingPhotoData.value = {
          photoUri: photo.webPath,
          galleryId,
          cameraExifData: photo.exif
        };
        showLocationPicker.value = true;
      } else {
        // GPS vorhanden, speichere direkt
        console.log('✅ GPS vorhanden - speichere Foto direkt');
        await savePhoto(photo.webPath, galleryId, undefined, photo.exif);
        console.log('Photo saved successfully with GPS');
        
        // WICHTIG: Galerie neu laden, damit das neue Foto sofort in der Liste erscheint
        await loadGallery(galleryId);
        cacheBuster.value = Date.now(); // Force re-render für Thumbnails
      }
    }
  } catch (error) {
    console.error('❌ Error adding photo:', error);
    console.error('❌ Error details:', JSON.stringify(error, null, 2));
    const errorMessage = error instanceof Error ? error.message : String(error);
    const alert = await alertController.create({
      header: 'Fehler',
      message: `Das Foto konnte nicht hinzugefügt werden.\n\nDetails: ${errorMessage}`,
      buttons: ['OK']
    });
    await alert.present();
  }
};

const handleAddMultiplePhotos = async () => {
  try {
    const galleryId = parseInt(route.params.id as string);
    const contentUris = await pickMultiplePhotos();
    
    if (contentUris.length === 0) {
      return; // Benutzer hat abgebrochen
    }

    console.log(`Uploading ${contentUris.length} files...`);
    
    // Speichere Fotos mit Progress-Tracking
    // TODO: GPS-Check für jedes Bild einzeln - aktuell keine GPS-Prüfung bei Mehrfachauswahl
    await saveMultiplePhotos(contentUris, galleryId, (current: number, total: number) => {
      uploadProgress.value = { current, total };
      console.log(`Upload progress: ${current}/${total}`);
    });
    
    uploadProgress.value = { current: 0, total: 0 };
    
    // WICHTIG: Galerie neu laden, damit alle neuen Fotos sofort angezeigt werden
    await loadGallery(galleryId);
    cacheBuster.value = Date.now(); // Force re-render für Thumbnails
    
    console.log('All photos uploaded successfully');
  } catch (error) {
    console.error('Error adding multiple photos:', error);
    // Zeige Fehler-Toast
    const alert = await alertController.create({
      header: 'Fehler',
      message: 'Die Fotos konnten nicht hinzugefügt werden.',
      buttons: ['OK']
    });
    await alert.present();
  }
};

const showGalleryMenu = async () => {
  const actionSheet = await actionSheetController.create({
    header: 'Gallerie-Optionen',
    buttons: [
      {
        text: 'Gallerie löschen',
        role: 'destructive',
        icon: trashOutline,
        handler: () => confirmDeleteGallery()
      },
      {
        text: 'Abbrechen',
        role: 'cancel'
      }
    ]
  });
  await actionSheet.present();
};

const confirmDeleteGallery = async () => {
  const alert = await alertController.create({
    header: 'Gallerie löschen?',
    message: 'Alle Fotos in dieser Gallerie werden ebenfalls gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.',
    buttons: [
      {
        text: 'Abbrechen',
        role: 'cancel'
      },
      {
        text: 'Löschen',
        role: 'destructive',
        handler: async () => {
          const galleryId = parseInt(route.params.id as string);
          await deleteGallery(galleryId);
          router.push('/gallery');
        }
      }
    ]
  });
  await alert.present();
};

const clearSelection = () => {
  selectedPhoto.value = null;
};

const openSelectedEditor = () => {
  if (!selectedPhoto.value) return;
  
  if (selectedPhoto.value.isVideo) {
    openVideoEditor(selectedPhoto.value);
  } else {
    openEditor(selectedPhoto.value);
  }
  
  selectedPhoto.value = null;
};

const openPhoto = (index: number) => {
  openLightbox(index);
};

const getVideoPoster = (photoId: number | undefined) => {
  const photo = photos.value.find(p => p.id === photoId);
  // Verwende thumbnail falls vorhanden, sonst filepath
  return photo?.thumbnail || photo?.filepath || '';
};

const openEditor = (photo: Photo) => {
  const galleryId = route.params.id as string;
  router.push({
    path: `/gallery/${galleryId}/editor`,
    query: {
      imageSrc: photo.filepath,
      photoId: photo.id?.toString()
    }
  });
};

const openVideoEditor = (video: Photo) => {
  const galleryId = route.params.id as string;
  router.push({
    path: `/gallery/${galleryId}/video-editor`,
    query: {
      videoSrc: video.filepath,
      videoId: video.id?.toString()
    }
  });
};

// Location Picker Funktionen
const handleLocationConfirm = async (lat: number, lng: number) => {
  if (!pendingPhotoData.value) return;
  
  try {
    const { photoUri, galleryId, cameraExifData } = pendingPhotoData.value;
    
    await savePhoto(
      photoUri, 
      galleryId, 
      undefined, 
      cameraExifData, 
      { latitude: lat, longitude: lng }
    );
    
    console.log('Photo saved with manual location:', { lat, lng });
    
    // WICHTIG: Galerie neu laden, damit das neue Foto sofort erscheint
    await loadGallery(galleryId);
    cacheBuster.value = Date.now(); // Force re-render für Thumbnails
  } catch (error) {
    console.error('Error saving photo with manual location:', error);
  } finally {
    showLocationPicker.value = false;
    pendingPhotoData.value = null;
  }
};

const handleLocationCancel = () => {
  showLocationPicker.value = false;
  pendingPhotoData.value = null;
};

// Mehrfachselektion Funktionen
const startSelectionMode = () => {
  selectionMode.value = true;
  selectedPhotos.value.clear();
};

const cancelSelectionMode = () => {
  selectionMode.value = false;
  selectedPhotos.value.clear();
};

const getImageSrc = (path: string | undefined) => {
  if (!path) return '';
  return Capacitor.convertFileSrc(path);
};

const togglePhotoSelection = (photo: Photo) => {
  if (!photo.id) return;
  
  if (selectedPhotos.value.has(photo.id)) {
    selectedPhotos.value.delete(photo.id);
  } else {
    selectedPhotos.value.add(photo.id);
  }
};

const selectAllPhotos = () => {
  selectedPhotos.value.clear();
  photos.value.forEach(photo => {
    if (photo.id) {
      selectedPhotos.value.add(photo.id);
    }
  });
};

const deleteSelectedPhotos = async () => {
  if (selectedPhotos.value.size === 0) return;
  
  const alert = await alertController.create({
    header: 'Fotos löschen?',
    message: `Möchtest du ${selectedPhotos.value.size} Foto(s) wirklich löschen?`,
    buttons: [
      {
        text: 'Abbrechen',
        role: 'cancel'
      },
      {
        text: 'Löschen',
        role: 'destructive',
        handler: async () => {
          try {
            const photosToDelete = photos.value.filter(p => 
              p.id && selectedPhotos.value.has(p.id)
            );
            
            for (const photo of photosToDelete) {
              await removePhoto(photo);
            }
            
            const galleryId = parseInt(route.params.id as string);
            await loadGallery(galleryId);
            
            cancelSelectionMode();
          } catch (error) {
            console.error('Error deleting photos:', error);
            const errorAlert = await alertController.create({
              header: 'Fehler',
              message: 'Fehler beim Löschen der Fotos.',
              buttons: ['OK']
            });
            await errorAlert.present();
          }
        }
      }
    ]
  });
  await alert.present();
};
</script>

<style scoped>
.gallery-description {
  background: var(--ion-color-light);
  border-bottom: 1px solid var(--ion-color-light-shade);
}

.view-toggle {
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
}

.view-toggle ion-segment {
  max-width: 400px;
  margin: 0 auto;
}

.map-view {
  height: calc(100vh - 200px);
  min-height: 400px;
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

.upload-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
}

.upload-progress ion-spinner {
  margin-bottom: 1rem;
}

.upload-progress p {
  color: var(--ion-color-medium);
  font-weight: 500;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2rem;
  text-align: center;
}

.empty-state ion-icon {
  font-size: 80px;
  color: var(--ion-color-medium);
  margin-bottom: 1rem;
}

.empty-state h2 {
  color: var(--ion-color-dark);
  margin-bottom: 0.5rem;
}

.empty-state p {
  color: var(--ion-color-medium);
}

.photo-item {
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 4px;
  cursor: pointer;
  background: var(--ion-color-light);
  display: block;
  text-decoration: none;
  position: relative;
  transition: all 0.2s ease;
}

.photo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.photo-selected {
  outline: 4px solid var(--ion-color-primary);
  outline-offset: -4px;
  transform: scale(0.95);
}

.photo-container {
  position: relative;
  width: 100%;
}

.photo-item.selectable {
  cursor: pointer;
}

.photo-item.selected {
  outline: 4px solid var(--ion-color-success);
  outline-offset: -4px;
}

.selection-checkbox {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  padding: 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.selection-checkbox ion-checkbox {
  margin: 0;
}

.photo-item ion-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.video-thumbnail-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  background: #000;
  overflow: hidden;
}

.video-thumbnail {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
  background: #1a1a1a;
}

.video-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 10;
}

.video-overlay ion-icon {
  font-size: 48px;
  color: white;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
}
</style>

<style>
/* PhotoSwipe Custom Styles (global) */
.pswp__video-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.pswp__video-wrapper video {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
</style>
