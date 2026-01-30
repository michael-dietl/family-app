
<!-- src/pages/Gallery.vue -->
<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/" />
        </ion-buttons>
        <ion-title>Gallerien</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="showCreateDialog = true">
            <ion-icon :icon="add" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">Gallerien</ion-title>
        </ion-toolbar>
      </ion-header>

      <!-- Loading State -->
      <div v-if="isLoading" class="loading-container">
        <ion-spinner />
      </div>

      <!-- Empty State -->
      <div v-else-if="galleries.length === 0" class="empty-state">
        <ion-icon :icon="imagesOutline" size="large" />
        <h2>Keine Gallerien vorhanden</h2>
        <p>Erstelle deine erste Gallerie mit dem + Button</p>
      </div>

      <!-- Gallery Grid -->
      <ion-grid v-else>
        <ion-row>
          <ion-col 
            v-for="gallery in galleries" 
            :key="gallery.id" 
            size="6" 
            size-md="4" 
            size-lg="3"
          >
            <ion-card @click="openGallery(gallery.id!)" button>
              <div class="gallery-cover">
                <ion-icon v-if="!galleryCoverPhotos[gallery.id!]" :icon="imagesOutline" />
                <img v-else :src="getImageSrc(galleryCoverPhotos[gallery.id!])" alt="Cover" />
                <!-- Gallery name (max 2 Zeilen) and photo count badge -->
              </div>
              <ion-card-header>
                <ion-card-title>{{ gallery.name }}</ion-card-title>
                <br/>
                <ion-card-subtitle>
                  <ion-icon :icon="imageOutline" />
                  {{ photoCount(gallery.id!) }} Fotos
                </ion-card-subtitle>
              </ion-card-header>
            </ion-card>
          </ion-col>
        </ion-row>
      </ion-grid>

      <!-- Create Gallery Dialog -->
      <ion-modal :is-open="showCreateDialog" @did-dismiss="showCreateDialog = false">
        <ion-header>
          <ion-toolbar>
            <ion-title>Neue Gallerie</ion-title>
            <ion-buttons slot="end">
              <ion-button @click="showCreateDialog = false">
                <ion-icon :icon="close" />
              </ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">
          <ion-item>
            <ion-input 
              v-model="newGalleryName" 
              label="Name" 
              label-placement="stacked"
              placeholder="z.B. Urlaub 2026"
            />
          </ion-item>
          <ion-item>
            <ion-textarea 
              v-model="newGalleryDescription" 
              label="Beschreibung (optional)"
              label-placement="stacked"
              :rows="4"
              placeholder="Beschreibe deine Gallerie..."
            />
          </ion-item>
          
          <!-- Farbauswahl -->
          <ion-item>
            <ion-label position="stacked">Marker-Farbe</ion-label>
            <div class="color-picker-container">
              <div class="color-preview" :style="{ backgroundColor: newGalleryColor }"></div>
              <div class="preset-colors">
                <button
                  v-for="color in presetColors"
                  :key="color"
                  class="color-button"
                  :class="{ active: newGalleryColor === color }"
                  :style="{ backgroundColor: color }"
                  @click="newGalleryColor = color"
                  type="button"
                />
              </div>
            </div>
          </ion-item>
          
          <ion-button 
            expand="block" 
            @click="handleCreateGallery"
            :disabled="!newGalleryName"
            class="ion-margin-top"
          >
            Erstellen
          </ion-button>
        </ion-content>
      </ion-modal>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonButtons,
  IonBackButton,
  IonIcon,
  IonGrid,
  IonRow,
  IonCol,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonImg,
  IonSpinner,
  IonModal,
  IonItem,
  IonInput,
  IonTextarea,
  IonLabel,
  alertController
} from '@ionic/vue';
import { add, close, imagesOutline, imageOutline } from 'ionicons/icons';
import { Capacitor } from '@capacitor/core';
import { useGallery } from '@/composables/useGallery';
import { usePocketbaseSync } from '@/composables/usePocketbaseSync';
import { db } from '@/services/database';

const router = useRouter();
const { galleries, isLoading, loadGalleries, createGallery } = useGallery();
const { autoSyncIfEnabled } = usePocketbaseSync();

const showCreateDialog = ref(false);
const newGalleryName = ref('');
const newGalleryDescription = ref('');
const newGalleryColor = ref('#3880ff'); // Ionic Blue als Standard
const photoCounts = ref<Record<number, number>>({});
const galleryCoverPhotos = ref<Record<number, string>>({});

// Vordefinierte Farben für schnelle Auswahl
const presetColors = [
  '#3880ff', // Ionic Blue
  '#eb445a', // Ionic Red
  '#2dd36f', // Ionic Green
  '#ffc409', // Ionic Yellow
  '#92949c', // Ionic Grey
  '#ff6b6b', // Rot
  '#4ecdc4', // Türkis
  '#45b7d1', // Hellblau
  '#f9ca24', // Gold
  '#6c5ce7', // Lila
  '#a29bfe', // Lavendel
  '#fd79a8', // Pink
  '#fdcb6e', // Orange
  '#00b894', // Grün
  '#2d3436', // Dunkelgrau
];

onMounted(async () => {
  await loadGalleries();
  await loadPhotoCounts();
  await autoSyncIfEnabled();
});

const loadPhotoCounts = async () => {
  try {
    const counts: Record<number, number> = {};
    const covers: Record<number, string> = {};
    
    // Optimierung: Alle Counts parallel laden statt sequenziell
    const countPromises = galleries.value.map(async (gallery) => {
      if (gallery.id) {
        const count = await db.getPhotoCount(gallery.id);
        counts[gallery.id] = count;
        
        // Cover nur laden wenn es Fotos gibt (spart unnötige DB-Abfragen)
        if (count > 0) {
          const photos = await db.getPhotosByGallery(gallery.id);
          if (photos.length > 0 && photos[0].filepath) {
            covers[gallery.id] = photos[0].filepath;
          }
        }
      }
    });
    
    await Promise.all(countPromises);
    
    photoCounts.value = counts;
    galleryCoverPhotos.value = covers;
  } catch (error) {
    console.error('Error loading photo counts:', error);
  }
};

const photoCount = (galleryId: number) => {
  return photoCounts.value[galleryId] || 0;
};

const openGallery = (galleryId: number) => {
  router.push(`/gallery/${galleryId}`);
};

const getImageSrc = (path: string | undefined) => {
  if (!path) return '';
  return Capacitor.convertFileSrc(path);
};

const handleCreateGallery = async () => {
  if (!newGalleryName.value) return;

  try {
    // Galerie erstellen (lädt automatisch die Galerie-Liste neu in useGallery)
    await createGallery(newGalleryName.value, newGalleryDescription.value, newGalleryColor.value);
    
    // Photo counts laden (verwendet die aktualisierte galleries-Liste aus useGallery)
    await loadPhotoCounts();
    
    // Dialog schließen und Felder zurücksetzen (mit nextTick für proper state update)
    showCreateDialog.value = false;
    await nextTick();
    
    newGalleryName.value = '';
    newGalleryDescription.value = '';
    newGalleryColor.value = '#3880ff';
    
    console.log('✅ Galerie erfolgreich erstellt, Dialog geschlossen und Liste aktualisiert');
  } catch (error) {
    console.error('Create gallery error:', error);
    const alert = await alertController.create({
      header: 'Fehler',
      message: 'Die Gallerie konnte nicht erstellt werden.',
      buttons: ['OK']
    });
    await alert.present();
  }
};
</script>

<style scoped>
.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
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

.gallery-cover {
  aspect-ratio: 4/3;
  background: var(--ion-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.gallery-cover ion-icon {
  font-size: 48px;
  color: var(--ion-color-medium);
}

.gallery-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.gallery-label {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 8px;
  padding: 6px 10px;
  background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-radius: 6px;
  z-index: 2;
}

.gallery-label-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
  font-size: 14px;
}

.gallery-label-count {
  background: rgba(255,255,255,0.12);
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

ion-card {
  margin: 0;
  cursor: pointer;
}

ion-card-subtitle {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

ion-card-subtitle ion-icon {
  font-size: 14px;
}

.color-picker-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem 0;
  width: 100%;
}

.color-preview {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  border: 3px solid var(--ion-color-light);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.preset-colors {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.5rem;
}

.color-button {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
  padding: 0;
}

.color-button:hover {
  transform: scale(1.1);
}

.color-button.active {
  border-color: var(--ion-color-dark);
  box-shadow: 0 0 0 2px var(--ion-background-color), 0 0 0 4px var(--ion-color-primary);
}
</style>
