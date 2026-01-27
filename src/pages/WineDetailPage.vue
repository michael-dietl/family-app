<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/wine"></ion-back-button>
        </ion-buttons>
        <ion-title>{{ wine?.name || 'Wein' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="openEditModal">
            <ion-icon slot="icon-only" :icon="createOutline"></ion-icon>
          </ion-button>
          <ion-button @click="showOptions">
            <ion-icon slot="icon-only" :icon="ellipsisVertical"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div v-if="isLoading" class="loading-container">
        <ion-spinner></ion-spinner>
      </div>

      <div v-else-if="wine" class="wine-detail">
        <!-- Tabs -->
        <ion-segment v-model="selectedTab" class="wine-tabs">
          <ion-segment-button value="info">
            <ion-label>Info</ion-label>
          </ion-segment-button>
          <ion-segment-button value="photo">
            <ion-label>Foto</ion-label>
          </ion-segment-button>
        </ion-segment>

        <!-- Tab: Foto -->
        <div v-show="selectedTab === 'photo'" class="tab-content">
          <div v-if="wine.photoPath" class="wine-photo">
            <img :src="getImageSrc(wine.photoPath)" />
          </div>
          <div v-else class="wine-photo-placeholder">
            <ion-icon :icon="wineOutline" size="large"></ion-icon>
            <p>Kein Foto vorhanden</p>
          </div>
        </div>

        <!-- Tab: Info (Metadaten) -->
        <div v-show="selectedTab === 'info'">
        <ion-list>
          <!-- Name & Bewertung -->
          <ion-list-header>
            <ion-label>
              <h1>{{ wine.name }}</h1>
              <div v-if="wine.rating" class="rating">
                <ion-icon
                  v-for="star in 5"
                  :key="star"
                  :icon="star <= wine.rating ? starIcon : starOutline"
                  :color="star <= wine.rating ? 'warning' : 'medium'"
                ></ion-icon>
              </div>
            </ion-label>
          </ion-list-header>

          <!-- Weingut -->
          <ion-item v-if="wine.winery">
            <ion-icon :icon="business" slot="start"></ion-icon>
            <ion-label>
              <p>Weingut</p>
              <h3>{{ wine.winery }}</h3>
            </ion-label>
          </ion-item>

          <!-- Region & Land -->
          <ion-item v-if="wine.region || wine.country">
            <ion-icon :icon="locationOutline" slot="start"></ion-icon>
            <ion-label>
              <p>Herkunft</p>
              <h3>{{ [wine.region, wine.country].filter(Boolean).join(', ') }}</h3>
            </ion-label>
          </ion-item>

          <!-- Jahrgang -->
          <ion-item v-if="wine.year">
            <ion-icon :icon="calendar" slot="start"></ion-icon>
            <ion-label>
              <p>Jahrgang</p>
              <h3>{{ wine.year }}</h3>
            </ion-label>
          </ion-item>

          <!-- Rebsorte -->
          <ion-item v-if="wine.grapeVariety">
            <ion-icon :icon="leaf" slot="start"></ion-icon>
            <ion-label>
              <p>Rebsorte</p>
              <h3>{{ wine.grapeVariety }}</h3>
            </ion-label>
          </ion-item>

          <!-- Weintyp -->
          <ion-item v-if="wine.type">
            <ion-icon :icon="wineOutline" slot="start"></ion-icon>
            <ion-label>
              <p>Weintyp</p>
              <h3>{{ wine.type }}</h3>
            </ion-label>
          </ion-item>

          <!-- Preis -->
          <ion-item v-if="wine.price">
            <ion-icon :icon="cash" slot="start"></ion-icon>
            <ion-label>
              <p>Preis</p>
              <h3>{{ wine.price.toFixed(2) }} €</h3>
            </ion-label>
          </ion-item>

          <!-- Anzahl -->
          <ion-item v-if="wine.quantity">
            <ion-icon :icon="layers" slot="start"></ion-icon>
            <ion-label>
              <p>Anzahl Flaschen</p>
              <h3>{{ wine.quantity }}</h3>
            </ion-label>
          </ion-item>

          <!-- Lagerort -->
          <ion-item v-if="wine.storageLocation">
            <ion-icon :icon="cube" slot="start"></ion-icon>
            <ion-label>
              <p>Lagerort</p>
              <h3>{{ wine.storageLocation }}</h3>
            </ion-label>
          </ion-item>

          <!-- Kaufdatum -->
          <ion-item v-if="wine.purchaseDate">
            <ion-icon :icon="cartOutline" slot="start"></ion-icon>
            <ion-label>
              <p>Kaufdatum</p>
              <h3>{{ formatDate(wine.purchaseDate) }}</h3>
            </ion-label>
          </ion-item>

          <!-- GPS Koordinaten -->
          <ion-item v-if="wine.latitude && wine.longitude" button @click="showOnMap">
            <ion-icon :icon="map" slot="start"></ion-icon>
            <ion-label>
              <p>GPS Position</p>
              <h3>{{ wine.latitude.toFixed(6) }}, {{ wine.longitude.toFixed(6) }}</h3>
            </ion-label>
            <ion-icon :icon="chevronForward" slot="end"></ion-icon>
          </ion-item>

          <!-- Notizen -->
          <ion-item v-if="wine.notes">
            <ion-label class="ion-text-wrap">
              <p>Notizen</p>
              <ion-text>{{ wine.notes }}</ion-text>
            </ion-label>
          </ion-item>

          <!-- Timestamps -->
          <ion-item>
            <ion-label class="ion-text-wrap">
              <p>Erstellt: {{ formatDate(wine.created) }}</p>
              <p>Aktualisiert: {{ formatDate(wine.updated) }}</p>
            </ion-label>
          </ion-item>
        </ion-list>
        </div>
      </div>

      <div v-else class="empty-state">
        <ion-icon :icon="wineOutline" size="large"></ion-icon>
        <h2>Wein nicht gefunden</h2>
      </div>
    </ion-content>

    <!-- Edit Modal -->
    <ion-modal :is-open="showEditModal" @didDismiss="closeEditModal">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button @click="closeEditModal">Abbrechen</ion-button>
          </ion-buttons>
          <ion-title>Wein bearbeiten</ion-title>
          <ion-buttons slot="end">
            <ion-button :strong="true" @click="handleSaveEdit">Speichern</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      <ion-content class="ion-padding">
        <ion-list>
          <!-- Pflichtfeld: Name -->
          <ion-item>
            <ion-input
              v-model="editWine.name"
              label="Name"
              label-placement="stacked"
              placeholder="z.B. Château Margaux"
              required
            ></ion-input>
          </ion-item>

          <!-- Weingut -->
          <ion-item>
            <ion-input
              v-model="editWine.winery"
              label="Weingut"
              label-placement="stacked"
              placeholder="z.B. Domaine de la Romanée-Conti"
            ></ion-input>
          </ion-item>

          <!-- Region -->
          <ion-item>
            <ion-input
              v-model="editWine.region"
              label="Region"
              label-placement="stacked"
              placeholder="z.B. Bordeaux, Mosel"
            ></ion-input>
          </ion-item>

          <!-- Land -->
          <ion-item>
            <ion-input
              v-model="editWine.country"
              label="Land"
              label-placement="stacked"
              placeholder="z.B. Frankreich, Deutschland"
            ></ion-input>
          </ion-item>

          <!-- Jahrgang -->
          <ion-item>
            <ion-input
              v-model.number="editWine.year"
              type="number"
              label="Jahrgang"
              label-placement="stacked"
              placeholder="z.B. 2018"
            ></ion-input>
          </ion-item>

          <!-- Rebsorte -->
          <ion-item>
            <ion-input
              v-model="editWine.grapeVariety"
              label="Rebsorte"
              label-placement="stacked"
              placeholder="z.B. Riesling, Pinot Noir"
            ></ion-input>
          </ion-item>

          <!-- Weintyp -->
          <ion-item>
            <ion-select
              v-model="editWine.type"
              label="Weintyp"
              label-placement="stacked"
              placeholder="Auswählen"
            >
              <ion-select-option value="Rotwein">Rotwein</ion-select-option>
              <ion-select-option value="Weißwein">Weißwein</ion-select-option>
              <ion-select-option value="Rosé">Rosé</ion-select-option>
              <ion-select-option value="Schaumwein">Schaumwein</ion-select-option>
              <ion-select-option value="Dessertwein">Dessertwein</ion-select-option>
            </ion-select>
          </ion-item>

          <!-- Preis -->
          <ion-item>
            <ion-input
              v-model.number="editWine.price"
              type="number"
              label="Preis (€)"
              label-placement="stacked"
              placeholder="z.B. 29.90"
            ></ion-input>
          </ion-item>

          <!-- Anzahl -->
          <ion-item>
            <ion-input
              v-model.number="editWine.quantity"
              type="number"
              label="Anzahl Flaschen"
              label-placement="stacked"
              placeholder="z.B. 6"
            ></ion-input>
          </ion-item>

          <!-- Lagerort -->
          <ion-item>
            <ion-input
              v-model="editWine.storageLocation"
              label="Lagerort"
              label-placement="stacked"
              placeholder="z.B. Keller, Regal 3"
            ></ion-input>
          </ion-item>

          <!-- Kaufdatum -->
          <ion-item>
            <ion-input
              v-model="editWine.purchaseDate"
              type="date"
              label="Kaufdatum"
              label-placement="stacked"
            ></ion-input>
          </ion-item>

          <!-- Bewertung -->
          <ion-item>
            <ion-label>Bewertung</ion-label>
            <div class="rating-selector">
              <ion-icon
                v-for="star in 5"
                :key="star"
                :icon="star <= (editWine.rating || 0) ? starIcon : starOutline"
                :color="star <= (editWine.rating || 0) ? 'warning' : 'medium'"
                @click="editWine.rating = star"
                style="font-size: 32px; cursor: pointer;"
              ></ion-icon>
            </div>
          </ion-item>

          <!-- Notizen -->
          <ion-item>
            <ion-textarea
              v-model="editWine.notes"
              label="Notizen"
              label-placement="stacked"
              placeholder="Zusätzliche Informationen..."
              :auto-grow="true"
              :rows="3"
            ></ion-textarea>
          </ion-item>
        </ion-list>
      </ion-content>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonButton,
  IonIcon,
  IonList,
  IonListHeader,
  IonItem,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonSpinner,
  IonText,
  IonModal,
  IonSelect,
  IonSelectOption,
  IonInput,
  IonTextarea,
  actionSheetController,
  alertController
} from '@ionic/vue';
import {
  ellipsisVertical,
  wineOutline,
  business,
  locationOutline,
  calendar,
  leaf,
  cash,
  layers,
  cube,
  cartOutline,
  map,
  chevronForward,
  star as starIcon,
  starOutline,
  create,
  createOutline,
  trash
} from 'ionicons/icons';
import { useWine } from '@/composables/useWine';
import type { Wine } from '@/services/database';
import { Capacitor } from '@capacitor/core';

const route = useRoute();
const router = useRouter();
const { getWine, updateWine, deleteWine } = useWine();

const wine = ref<Wine | null>(null);
const isLoading = ref(true);
const selectedTab = ref('info');
const showEditModal = ref(false);
const editWine = ref<Partial<Wine>>({});

onMounted(async () => {
  const id = parseInt(route.params.id as string);
  if (isNaN(id)) {
    router.replace('/wine');
    return;
  }

  try {
    wine.value = await getWine(id);
  } catch (error) {
    console.error('Failed to load wine:', error);
  } finally {
    isLoading.value = false;
  }
});

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

const getImageSrc = (path: string | undefined) => {
  if (!path) return '';
  return Capacitor.convertFileSrc(path);
};

const showOnMap = () => {
  if (!wine.value?.latitude || !wine.value?.longitude) return;
  
  router.push({
    path: '/map',
    query: {
      lat: wine.value.latitude.toString(),
      lng: wine.value.longitude.toString(),
      zoom: '15'
    }
  });
};

const openEditModal = () => {
  if (!wine.value) return;
  
  // Copy current wine data to edit object
  editWine.value = {
    id: wine.value.id,
    name: wine.value.name,
    winery: wine.value.winery,
    region: wine.value.region,
    country: wine.value.country,
    year: wine.value.year,
    grapeVariety: wine.value.grapeVariety,
    type: wine.value.type,
    price: wine.value.price,
    quantity: wine.value.quantity,
    rating: wine.value.rating,
    notes: wine.value.notes,
    photoPath: wine.value.photoPath,
    latitude: wine.value.latitude,
    longitude: wine.value.longitude,
    purchaseDate: wine.value.purchaseDate,
    storageLocation: wine.value.storageLocation
  };
  
  showEditModal.value = true;
};

const closeEditModal = () => {
  showEditModal.value = false;
  editWine.value = {};
};

const handleSaveEdit = async () => {
  if (!editWine.value.name?.trim()) {
    const alert = await alertController.create({
      header: 'Fehler',
      message: 'Bitte gib einen Namen ein.',
      buttons: ['OK']
    });
    await alert.present();
    return;
  }

  try {
    await updateWine(editWine.value.id!, editWine.value);
    
    // Reload wine data
    wine.value = await getWine(editWine.value.id!);
    
    closeEditModal();
  } catch (error) {
    console.error('Failed to update wine:', error);
    const alert = await alertController.create({
      header: 'Fehler',
      message: 'Wein konnte nicht aktualisiert werden.',
      buttons: ['OK']
    });
    await alert.present();
  }
};

const showOptions = async () => {
  const actionSheet = await actionSheetController.create({
    header: 'Optionen',
    buttons: [
      {
        text: 'Bearbeiten',
        icon: create,
        handler: () => {
          // TODO: Edit modal öffnen
          console.log('Edit wine');
        }
      },
      {
        text: 'Löschen',
        role: 'destructive',
        icon: trash,
        handler: async () => {
          const alert = await alertController.create({
            header: 'Wein löschen?',
            message: 'Möchtest du diesen Wein wirklich löschen?',
            buttons: [
              {
                text: 'Abbrechen',
                role: 'cancel'
              },
              {
                text: 'Löschen',
                role: 'destructive',
                handler: async () => {
                  if (!wine.value?.id) return;
                  
                  try {
                    await deleteWine(wine.value.id);
                    router.replace('/wine');
                  } catch (error) {
                    const errorAlert = await alertController.create({
                      header: 'Fehler',
                      message: 'Wein konnte nicht gelöscht werden.',
                      buttons: ['OK']
                    });
                    await errorAlert.present();
                  }
                }
              }
            ]
          });
          await alert.present();
        }
      },
      {
        text: 'Abbrechen',
        role: 'cancel'
      }
    ]
  });

  await actionSheet.present();
};
</script>

<style scoped>
.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
}

.wine-photo {
  width: 100%;
  max-height: 400px;
  overflow: hidden;
}

.wine-photo img {
  width: 100%;
  height: auto;
  object-fit: cover;
}

.wine-photo-placeholder {
  width: 100%;
  height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ion-color-light);
}

.wine-photo-placeholder ion-icon {
  font-size: 120px;
  color: var(--ion-color-medium);
}

.wine-detail ion-list-header h1 {
  font-size: 24px;
  font-weight: bold;
  margin: 0;
}

.rating {
  display: flex;
  gap: 4px;
  margin-top: 8px;
}

.rating-selector {
  display: flex;
  gap: 4px;
  padding: 8px 0;
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
</style>
