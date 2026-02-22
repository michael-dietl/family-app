
<!-- src/pages/Gallery.vue -->
<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/" />
        </ion-buttons>
        <ion-title>{{ $t('auto.gallerien') }}</ion-title>
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
          <ion-title size="large">{{ $t('auto.gallerien') }}</ion-title>
        </ion-toolbar>
      </ion-header>

      <!-- Search -->
      <ion-searchbar
        v-if="galleries.length > 0"
        v-model="searchQuery"
        :placeholder="t('auto.gallerien_durchsuchen')"
        :debounce="200"
      />

      <!-- Loading State -->
      <div v-if="isLoading" class="loading-container">
        <ion-spinner />
      </div>

      <!-- Empty State -->
      <div v-else-if="galleries.length === 0" class="empty-state">
        <ion-icon :icon="imagesOutline" size="large" />
        <h2>{{ $t('auto.keine_gallerien_vorhanden') }}</h2>
        <p>{{ $t('auto.erstelle_deine_erste_gallerie_mit_dem_button') }}</p>
      </div>

      <!-- No Results -->
      <div v-else-if="filteredGalleries.length === 0" class="empty-state">
        <ion-icon :icon="imagesOutline" size="large" />
        <h2>{{ t('auto.keine_treffer') }}</h2>
        <p v-if="searchQuery">
          {{ t('auto.keine_gallerien_fuer_suchbegriff', { search: searchQuery }) }}
        </p>
        <p v-else>
          {{ t('auto.keine_gallerien_vorhanden') }}
        </p>
      </div>

      <!-- Gallery Grid -->
      <ion-grid v-else>
        <ion-row>
          <ion-col 
            v-for="gallery in filteredGalleries" 
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
                  {{ photoCount(gallery.id!) }} {{ t('auto.fotos') }}
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
            <ion-title>{{ $t('auto.neue_gallerie') }}</ion-title>
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
              :label="t('auto.name')" 
              label-placement="stacked"
              :placeholder="t('auto.z_b_urlaub_2026')"
            />
          </ion-item>
          <ion-item>
            <ion-textarea 
              v-model="newGalleryDescription" 
              :label="t('auto.beschreibung_optional')"
              label-placement="stacked"
              :rows="4"
              :placeholder="t('auto.beschreibe_deine_gallerie')"
            />
          </ion-item>
          
          <!-- Farbauswahl -->
          <ion-item>
            <ion-label position="stacked">{{ $t('auto.marker_farbe') }}</ion-label>
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
          <ion-item lines="none" class="gallery-date-row">
            <ion-label>
              <span class="date-label">{{ $t('auto.startdatum') }}</span>
              <span class="date-value">{{ formattedStartDate }}</span>
            </ion-label>
            <ion-button
              fill="clear"
              class="date-picker-icon"
              @click="openDatePicker('start')"
            >
              <ion-icon :icon="calendarOutline" />
            </ion-button>
          </ion-item>
          <ion-item lines="none" class="gallery-date-row">
            <ion-label>
              <span class="date-label">{{ $t('auto.enddatum') }}</span>
              <span class="date-value">{{ formattedEndDate }}</span>
            </ion-label>
            <ion-button
              fill="clear"
              class="date-picker-icon"
              @click="openDatePicker('end')"
            >
              <ion-icon :icon="calendarOutline" />
            </ion-button>
          </ion-item>
          
          <ion-button 
            expand="block" 
            @click="handleCreateGallery"
            :disabled="!newGalleryName"
            class="ion-margin-top"
          >
            {{ $t('auto.erstellen') }}
          </ion-button>
        </ion-content>
      </ion-modal>
      <ion-modal
        css-class="half-modal"
        :is-open="showDatePickerModal"
        @did-dismiss="cancelDatePicker"
      >
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="cancelDatePicker">
                {{ $t('buttons.cancel') }}
              </ion-button>
            </ion-buttons>
            <ion-title>
              {{ datePickerTarget === 'start' ? $t('auto.startdatum') : $t('auto.enddatum') }}
            </ion-title>
            <ion-buttons slot="end">
              <ion-button strong @click="confirmDatePicker">
                {{ $t('auto.speichern') }}
              </ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">
          <ion-datetime
            v-model="datePickerValue"
            presentation="date"
            display-format="DD.MM.YYYY"
            :locale="datetimeLocale"
            :show-default-buttons="false"
          />
          <div class="modal-actions">
            <ion-button expand="block" fill="clear" color="medium" @click="clearDatePicker">
              {{ $t('auto.zuruecksetzen') }}
            </ion-button>
          </div>
        </ion-content>
      </ion-modal>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
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
  IonSearchbar,
  IonSpinner,
  IonModal,
  IonItem,
  IonInput,
  IonTextarea,
  IonLabel,
  IonDatetime,
  alertController
} from '@ionic/vue';
import { add, close, imagesOutline, imageOutline, calendarOutline } from 'ionicons/icons';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useGallery } from '@/composables/useGallery';
import { usePocketbaseSync } from '@/composables/usePocketbaseSync';
import { db } from '@/services/database';

type GalleryDateField = 'start' | 'end';

const router = useRouter();
const { t, locale } = useI18n();
const datetimeLocale = computed(() => {
  return locale.value === 'bar' ? 'de' : locale.value || 'de';
});
const { galleries, isLoading, loadGalleries, createGallery } = useGallery();
const { autoSyncIfEnabled } = usePocketbaseSync();

const showCreateDialog = ref(false);
const newGalleryName = ref('');
const newGalleryDescription = ref('');
const newGalleryColor = ref('#3880ff'); // Ionic Blue als Standard
const newGalleryStartDate = ref('');
const newGalleryEndDate = ref('');
const photoCounts = ref<Record<number, number>>({});
const galleryCoverPhotos = ref<Record<number, string>>({});
const searchQuery = ref('');
const showDatePickerModal = ref(false);
const datePickerValue = ref('');
const datePickerTarget = ref<GalleryDateField>('start');

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

const filteredGalleries = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return galleries.value;
  return galleries.value.filter(gallery => {
    const name = gallery.name?.toLowerCase() || '';
    const description = gallery.description?.toLowerCase() || '';
    return name.includes(query) || description.includes(query);
  });
});

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
          const preview = await db.getLatestPhotoPreview(gallery.id);
          const coverSrc = preview?.thumbnail || preview?.filepath;
          if (coverSrc) {
            covers[gallery.id] = coverSrc;
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

const navigateToTimeline = () => {
  router.push('/timeline');
};

const getImageSrc = (path: string | undefined) => {
  if (!path) return '';
  return Capacitor.convertFileSrc(path);
};

const openDatePicker = (field: GalleryDateField) => {
  datePickerTarget.value = field;
  const currentValue = field === 'start' ? newGalleryStartDate.value : newGalleryEndDate.value;
  datePickerValue.value = currentValue || new Date().toISOString();
  showDatePickerModal.value = true;
};

const confirmDatePicker = () => {
  if (datePickerTarget.value === 'start') {
    newGalleryStartDate.value = datePickerValue.value;
  } else {
    newGalleryEndDate.value = datePickerValue.value;
  }
  showDatePickerModal.value = false;
};

const cancelDatePicker = () => {
  showDatePickerModal.value = false;
};

const clearDatePicker = () => {
  if (datePickerTarget.value === 'start') {
    newGalleryStartDate.value = '';
  } else {
    newGalleryEndDate.value = '';
  }
  showDatePickerModal.value = false;
};

const handleCreateGallery = async () => {
  if (!newGalleryName.value) return;

  try {
    // Galerie erstellen (lädt automatisch die Galerie-Liste neu in useGallery)
    await createGallery(
      newGalleryName.value,
      newGalleryDescription.value,
      newGalleryColor.value,
      newGalleryStartDate.value || undefined,
      newGalleryEndDate.value || undefined
    );
    
    // Photo counts laden (verwendet die aktualisierte galleries-Liste aus useGallery)
    await loadPhotoCounts();
    
    // Dialog schließen und Felder zurücksetzen (mit nextTick für proper state update)
    showCreateDialog.value = false;
    await nextTick();
    
    newGalleryName.value = '';
    newGalleryDescription.value = '';
    newGalleryColor.value = '#3880ff';
    newGalleryStartDate.value = '';
    newGalleryEndDate.value = '';
    
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

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

const previewDateValue = (value?: string) => (value ? formatDate(value) : '-');
const formattedStartDate = computed(() => previewDateValue(newGalleryStartDate.value));
const formattedEndDate = computed(() => previewDateValue(newGalleryEndDate.value));


onMounted(async () => {
  await StatusBar.setOverlaysWebView({ overlay: false });
  await StatusBar.setStyle({ style: Style.Dark });
});
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

.gallery-date-row {
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0;
}

.gallery-date-row ion-label {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  font-size: 0.75rem;
  color: var(--ion-color-medium);
}

.gallery-date-row .date-label {
  font-weight: 500;
}

.gallery-date-row .date-value {
  font-size: 0.85rem;
  color: var(--ion-color-dark);
}

.calendar-icon-only {
  --padding-start: 0;
  --padding-end: 0;
  --padding-top: 0;
  --padding-bottom: 0;
  min-width: 44px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
}

.calendar-icon-only::part(text) {
  display: none;
}

.calendar-icon-only::part(icon) {
  font-size: 1.25rem;
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

.date-picker-icon {
  --padding-start: 0;
  --padding-end: 0;
  --padding-top: 0;
  --padding-bottom: 0;
  min-width: 44px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
}

.modal-actions {
  margin-top: 1rem;
}

::v-deep .half-modal .modal-wrapper {
  height: 55vh;
  max-height: 75vh;
  border-radius: 20px 20px 0 0;
  overflow: hidden;
}

::v-deep .half-modal .modal-wrapper ion-content {
  --border-radius: 0;
  padding-bottom: 0;
}

::v-deep .half-modal .modal-wrapper ion-datetime {
  width: 100%;
}
</style>
