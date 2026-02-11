<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/gallery"></ion-back-button>
        </ion-buttons>
        <ion-title>{{ $t('auto.weinkeller') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button v-if="!selectionMode" @click="toggleSelectionMode">
            <ion-icon slot="icon-only" :icon="checkmarkCircleOutline"></ion-icon>
          </ion-button>
          <ion-button v-if="selectionMode" color="danger" @click="deleteSelectedWines" :disabled="selectedWineIds.size === 0">
            <ion-icon slot="icon-only" :icon="trashOutline"></ion-icon>
          </ion-button>
          <ion-button v-if="selectionMode" @click="cancelSelection">
            {{ $t('auto.abbrechen') }}
          </ion-button>
          <ion-button v-if="!selectionMode" @click="openCreateModal">
            <ion-icon slot="icon-only" :icon="add"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">{{ $t('auto.weinkeller') }}</ion-title>
        </ion-toolbar>
      </ion-header>

      <!-- Suchleiste -->
      <ion-toolbar>
        <ion-searchbar
          v-model="searchTerm"
          placeholder="Wein, Weingut, Region suchen..."
          :debounce="300"
          @ionInput="loadWines"
        ></ion-searchbar>
      </ion-toolbar>

      <!-- Lade-Indikator -->
      <div v-if="isLoading" class="loading-container">
        <ion-spinner></ion-spinner>
      </div>

      <!-- Wein-Liste -->
      <ion-list v-else-if="filteredWines.length > 0">
        <ion-item
          v-for="wine in filteredWines"
          :key="wine.id"
          button
          @click="selectionMode ? toggleWineSelection(wine.id!) : openWineDetail(wine.id!)"
        >
          <!-- Checkbox im Auswahlmodus -->
          <ion-checkbox
            v-if="selectionMode && wine.id !== undefined"
            slot="start"
            :checked="selectedWineIds.has(wine.id!)"
            @ionChange="toggleWineSelection(wine.id!)"
          ></ion-checkbox>

          <!-- Wein-Foto links -->
          <ion-thumbnail slot="start" class="wine-thumbnail">
            <img
              v-if="wine.photoPath"
              :src="getImageSrc(wine.photoPath)"
            />
            <div v-else class="no-photo">
              <ion-icon :icon="wineOutline" size="large"></ion-icon>
            </div>
          </ion-thumbnail>

          <!-- Metadaten rechts -->
          <ion-label>
            <h2>{{ wine.name }}</h2>
            <p>
              <ion-text color="medium">
                <span v-if="wine.quantity && wine.quantity > 1">{{ wine.quantity }}x Flaschen</span>
                <span v-if="wine.quantity && wine.quantity > 1 && (wine.winery || wine.region || wine.country || wine.year || wine.grapeVariety)"> • </span>
                <span v-if="wine.winery">{{ wine.winery }}</span>
                <span v-if="wine.winery && (wine.region || wine.country)"> • </span>
                <span v-if="wine.region || wine.country">{{ [wine.region, wine.country].filter(Boolean).join(', ') }}</span>
                <span v-if="(wine.region || wine.country) && (wine.year || wine.grapeVariety)"> • </span>
                <span v-if="wine.year || wine.grapeVariety">{{ [wine.year, wine.grapeVariety].filter(Boolean).join(' ') }}</span>
              </ion-text>
            </p>
            <div v-if="wine.rating" class="rating">
              <ion-icon
                v-for="star in 5"
                :key="star"
                :icon="star <= wine.rating ? starIcon : starOutline"
                :color="star <= wine.rating ? 'warning' : 'medium'"
                size="small"
              ></ion-icon>
            </div>
          </ion-label>
        </ion-item>
      </ion-list>

      <!-- Empty State -->
      <div v-else class="empty-state">
        <ion-icon :icon="wineOutline" size="large"></ion-icon>
        <h2>{{ $t('auto.keine_weine_gefunden') }}</h2>
        <p v-if="searchTerm">{{ $t('auto.versuche_es_mit_einem_anderen_suchbegriff') }}</p>
        <p v-else>{{ $t('auto.füge_deinen_ersten_wein_hinzu') }}</p>
      </div>

      <!-- Create button moved to header for consistent UI -->

      <!-- Create Wine Modal -->
      <ion-modal
        ref="createModalRef"
        :is-open="showCreateModal"
        @didDismiss="resetCreateForm(); showCreateModal = false"
      >
        <ion-header>
          <ion-toolbar>
            <ion-title>{{ $t('auto.neuer_wein') }}</ion-title>
            <ion-buttons slot="end">
              <ion-button @click="closeCreateModal()">{{ $t('auto.abbrechen') }}</ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>

        <ion-content class="ion-padding">
          <ion-list>
            <!-- Pflichtfeld: Name -->
            <ion-item>
              <ion-input
                v-model="newWine.name"
                label="Name"
                label-placement="stacked"
                placeholder="z.B. Château Margaux"
                required
              ></ion-input>
            </ion-item>

            <!-- Weingut -->
            <ion-item>
              <ion-input
                v-model="newWine.winery"
                label="Weingut"
                label-placement="stacked"
                placeholder="z.B. Domaine de la Romanée-Conti"
              ></ion-input>
            </ion-item>

            <!-- Region -->
            <ion-item>
              <ion-input
                v-model="newWine.region"
                label="Region"
                label-placement="stacked"
                placeholder="z.B. Bordeaux, Mosel"
              ></ion-input>
            </ion-item>

            <!-- Land -->
            <ion-item>
              <ion-input
                v-model="newWine.country"
                label="Land"
                label-placement="stacked"
                placeholder="z.B. Frankreich, {{ $t('auto.deutsch') }}land"
              ></ion-input>
            </ion-item>

            <!-- Jahrgang -->
            <ion-item>
              <ion-input
                v-model.number="newWine.year"
                type="number"
                label="Jahrgang"
                label-placement="stacked"
                placeholder="z.B. 2018"
              ></ion-input>
            </ion-item>

            <!-- Rebsorte -->
            <ion-item>
              <ion-input
                v-model="newWine.grapeVariety"
                label="Rebsorte"
                label-placement="stacked"
                placeholder="z.B. Riesling, Pinot Noir"
              ></ion-input>
            </ion-item>

            <!-- Weintyp -->
            <ion-item>
              <ion-select
                v-model="newWine.type"
                label="Weintyp"
                label-placement="stacked"
                placeholder="Auswählen"
              >
                <ion-select-option value="Rotwein">{{ $t('auto.rotwein') }}</ion-select-option>
                <ion-select-option value="Weißwein">{{ $t('auto.weißwein') }}</ion-select-option>
                <ion-select-option value="Rosé">{{ $t('auto.ros') }}</ion-select-option>
                <ion-select-option value="Schaumwein">{{ $t('auto.schaumwein') }}</ion-select-option>
                <ion-select-option value="Dessertwein">{{ $t('auto.dessertwein') }}</ion-select-option>
              </ion-select>
            </ion-item>

            <!-- Preis -->
            <ion-item>
              <ion-input
                v-model.number="newWine.price"
                type="number"
                label="Preis (€)"
                label-placement="stacked"
                placeholder="z.B. 29.90"
              ></ion-input>
            </ion-item>

            <!-- {{ $t('auto.anzahl') }} -->
            <ion-item>
              <ion-input
                v-model.number="newWine.quantity"
                type="number"
                label="{{ $t('auto.anzahl') }} Flaschen"
                label-placement="stacked"
                placeholder="1"
              ></ion-input>
            </ion-item>

            <!-- Lagerort -->
            <ion-item>
              <ion-input
                v-model="newWine.storageLocation"
                label="Lagerort"
                label-placement="stacked"
                placeholder="z.B. Regal 3, Fach 2"
              ></ion-input>
            </ion-item>

            <!-- Bewertung -->
            <ion-item>
              <ion-label>{{ $t('auto.bewertung') }}</ion-label>
              <div class="rating-selector">
                <ion-icon
                  v-for="star in 5"
                  :key="star"
                  :icon="star <= (newWine.rating || 0) ? starIcon : starOutline"
                  :color="star <= (newWine.rating || 0) ? 'warning' : 'medium'"
                  size="large"
                  @click="newWine.rating = star"
                ></ion-icon>
              </div>
            </ion-item>

            <!-- Notizen -->
            <ion-item>
              <ion-textarea
                v-model="newWine.notes"
                label="Notizen"
                label-placement="stacked"
                placeholder="Deine Notizen zum Wein..."
                :rows="4"
              ></ion-textarea>
            </ion-item>

            <!-- Foto Button -->
            <ion-item button @click="handleTakePhoto">
              <ion-icon :icon="camera" slot="start"></ion-icon>
              <ion-label>
                {{ photoPreview ? 'Foto ersetzen' : $t('auto.foto_aufnehmen') }}
              </ion-label>
            </ion-item>

            <!-- Foto Preview -->
            <div v-if="photoPreview" class="photo-preview">
              <img :src="getImageSrc(photoPreview)" alt="Weinvorschau" />
              <ion-chip v-if="photoGPS" color="success">
                <ion-icon :icon="locationOutline"></ion-icon>
                <ion-label>{{ $t('auto.gps_daten_vorhanden') }}</ion-label>
              </ion-chip>
            </div>
          </ion-list>

          <div class="modal-footer">
            <ion-button
              expand="block"
              @click="handleCreateWine"
              :disabled="!newWine.name || isCreating"
            >
              <ion-spinner v-if="isCreating" slot="start"></ion-spinner>
              {{ isCreating ? 'Wird gespeichert...' : 'Wein hinzufügen' }}
            </ion-button>
          </div>
        </ion-content>
      </ion-modal>

      <!-- Image Editor Modal -->
      <ImageEditor
        :is-open="showImageEditor"
        :image-src="getImageSrc(tempPhotoForEdit)"
        @save="handleImageEditorSave"
        @close="handleImageEditorClose"
      />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonThumbnail,
  IonSearchbar,
  IonSpinner,
  IonIcon,
  IonFab,
  IonFabButton,
  IonModal,
  IonButtons,
  IonButton,
  IonBackButton,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonBadge,
  IonText,
  IonChip,
  IonCheckbox,
  alertController
} from '@ionic/vue';
import { add, wineOutline, camera, locationOutline, star as starIcon, starOutline, checkmarkCircleOutline, trashOutline } from 'ionicons/icons';
import { useWine } from '@/composables/useWine';
import type { Wine } from '@/services/database';
import { db } from '@/services/database';
import ImageEditor from '@/components/ImageEditor.vue';
import { Capacitor } from '@capacitor/core';

const router = useRouter();
const { wines, filteredWines, isLoading, searchTerm, loadWines, createWine, takeWinePhoto } = useWine();

const showCreateModal = ref(false);
const isCreating = ref(false);
const photoPreview = ref<string | null>(null);
const photoGPS = ref<{ latitude: number; longitude: number } | null>(null);
const showImageEditor = ref(false);
const tempPhotoForEdit = ref<string>('');
const createModalRef = ref<HTMLIonModalElement | null>(null);

// Mehrfachauswahl
const selectionMode = ref(false);
const selectedWineIds = ref(new Set<number>());

const newWine = ref<Partial<Wine>>({
  name: '',
  quantity: 1
});

onMounted(async () => {
  await loadWines();
});

const openCreateModal = () => {
  newWine.value = { name: '', quantity: 1 };
  photoPreview.value = null;
  photoGPS.value = null;
  showCreateModal.value = true;
};

const resetCreateForm = () => {
  newWine.value = { name: '', quantity: 1 };
  photoPreview.value = null;
  photoGPS.value = null;
  tempPhotoForEdit.value = '';
};

const closeCreateModal = () => {
  showCreateModal.value = false;
  createModalRef.value?.dismiss();
};

const handleTakePhoto = async () => {
  try {
    const result = await takeWinePhoto();
    
    // GPS Daten sofort speichern
    if (result.latitude && result.longitude) {
      newWine.value.latitude = result.latitude;
      newWine.value.longitude = result.longitude;
      photoGPS.value = { latitude: result.latitude, longitude: result.longitude };
    }
    
    // Öffne Bildeditor mit dem aufgenommenen Foto
    tempPhotoForEdit.value = result.photoPath;
    showImageEditor.value = true;
  } catch (error: any) {
    console.error('Photo error in component:', error);
    const alert = await alertController.create({
      header: 'Fehler',
      message: `Foto konnte nicht aufgenommen werden: ${error?.message || 'Unbekannter Fehler'}`,
      buttons: ['OK']
    });
    await alert.present();
  }
};

const handleImageEditorSave = async (imageBlob: Blob) => {
  try {
    // Konvertiere Blob zu base64 für Filesystem
    const reader = new FileReader();
    const base64Promise = new Promise<string>((resolve, reject) => {
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // Entferne data:image/jpeg;base64, Prefix
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(imageBlob);
    });
    
    const base64Data = await base64Promise;
    const fileName = `wine_${Date.now()}_edited.jpg`;
    
    // Speichere bearbeitetes Bild im Filesystem
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    
    // Stelle sicher, dass das wines-Verzeichnis existiert
    try {
      await Filesystem.mkdir({
        path: 'wines',
        directory: Directory.Data,
        recursive: true
      });
    } catch (e) {
      console.log('Directory already exists');
    }
    
    const savedFile = await Filesystem.writeFile({
      path: `wines/${fileName}`,
      data: base64Data,
      directory: Directory.Data
    });
    
    console.log('Edited image saved:', savedFile.uri);
    
    // Verwende Filesystem URI für Preview und DB
    photoPreview.value = savedFile.uri;
    newWine.value.photoPath = savedFile.uri;
    
    showImageEditor.value = false;
  } catch (error) {
    console.error('Error processing edited image:', error);
    const alert = await alertController.create({
      header: 'Fehler',
      message: 'Bearbeitetes Bild konnte nicht gespeichert werden.',
      buttons: ['OK']
    });
    await alert.present();
  }
};

const handleImageEditorClose = () => {
  showImageEditor.value = false;
  // Wenn Editor geschlossen wird ohne zu speichern, verwende Original
  if (!photoPreview.value && tempPhotoForEdit.value) {
    photoPreview.value = tempPhotoForEdit.value;
    newWine.value.photoPath = tempPhotoForEdit.value;
  }
};

const handleCreateWine = async () => {
  if (!newWine.value.name || !newWine.value.name.trim()) return;

  console.log('🍷 handleCreateWine - newWine.value:', JSON.stringify({
    name: newWine.value.name,
    photoPath: newWine.value.photoPath,
    latitude: newWine.value.latitude,
    longitude: newWine.value.longitude,
    hasGPS: !!(newWine.value.latitude && newWine.value.longitude)
  }));

  const previousSearchTerm = searchTerm.value;
  searchTerm.value = '';
  isCreating.value = true;
  try {
    await createWine(newWine.value as Omit<Wine, 'id' | 'created' | 'updated'>);
    resetCreateForm();
    closeCreateModal();
  } catch (error) {
    const alert = await alertController.create({
      header: 'Fehler',
      message: 'Wein konnte nicht gespeichert werden.',
      buttons: ['OK']
    });
    await alert.present();
    searchTerm.value = previousSearchTerm;
  } finally {
    isCreating.value = false;
  }
};

const openWineDetail = (id: number) => {
  router.push(`/wine/${id}`);
};

// Mehrfachauswahl-Funktionen
const toggleSelectionMode = () => {
  selectionMode.value = !selectionMode.value;
  if (!selectionMode.value) {
    selectedWineIds.value.clear();
  }
};

const toggleWineSelection = (id: number) => {
  if (selectedWineIds.value.has(id)) {
    selectedWineIds.value.delete(id);
  } else {
    selectedWineIds.value.add(id);
  }
};

const cancelSelection = () => {
  selectionMode.value = false;
  selectedWineIds.value.clear();
};

const deleteSelectedWines = async () => {
  const alert = await alertController.create({
    header: 'Weine löschen?',
    message: `Möchtest du ${selectedWineIds.value.size} ${selectedWineIds.value.size === 1 ? 'Wein' : 'Weine'} unwiderruflich löschen?`,
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
            // Lösche alle ausgewählten Weine
            for (const id of selectedWineIds.value) {
              await db.deleteWine(id);
            }
            
            // Liste neu laden
            await loadWines();
            
            // Auswahl beenden
            selectionMode.value = false;
            selectedWineIds.value.clear();
          } catch (error) {
            console.error('Error deleting wines:', error);
            const errorAlert = await alertController.create({
              header: 'Fehler',
              message: 'Weine konnten nicht gelöscht werden.',
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

const getImageSrc = (path: string | undefined) => {
  if (!path) return '';
  return Capacitor.convertFileSrc(path);
};
</script>

<style scoped>
.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-state ion-icon {
  font-size: 80px;
  color: var(--ion-color-medium);
  margin-bottom: 16px;
}

.empty-state h2 {
  color: var(--ion-color-dark);
  margin-bottom: 8px;
}

.empty-state p {
  color: var(--ion-color-medium);
}

.wine-thumbnail {
  --size: 120px;
  width: var(--size);
  height: var(--size);
}

.wine-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.no-photo {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ion-color-light);
}

.rating {
  display: flex;
  gap: 2px;
  margin-top: 4px;
}

.rating-selector {
  display: flex;
  gap: 8px;
  cursor: pointer;
}

.photo-preview {
  padding: 16px;
  text-align: center;
}

.photo-preview img {
  max-width: 100%;
  max-height: 300px;
  border-radius: 8px;
}

.photo-preview ion-chip {
  margin-top: 8px;
}

.wine-fab {
  margin-bottom: 20px;
  margin-right: 4px;
}

.modal-footer {
  padding: 16px;
  padding-bottom: 32px;
  background: var(--ion-background-color);
}
</style>
