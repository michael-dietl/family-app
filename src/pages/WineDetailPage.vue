<template>
  <ion-page>
    <ion-header :translucent="false">
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

      <template v-else-if="wine">
        <div class="wine-detail">
          <ion-segment v-model="selectedTab" class="wine-tabs">
            <ion-segment-button value="info">
              <ion-label>{{ $t('auto.info') }}</ion-label>
            </ion-segment-button>
            <ion-segment-button value="photo">
              <ion-label>{{ $t('auto.foto') }}</ion-label>
            </ion-segment-button>
          </ion-segment>

          <div v-show="selectedTab === 'photo'" class="tab-content photo-tab ion-padding-bottom">
            <div v-if="wineLightboxItems.length" class="wine-photo-viewer">
              <button
                ref="photoAreaRef"
                class="wine-photo-active"
                type="button"
                @click="handlePhotoAreaClick"
                @touchstart="handlePhotoTouchStart"
                @touchmove="handlePhotoTouchMove"
                @touchend="handlePhotoTouchEnd"
                @touchcancel="handlePhotoTouchEnd"
              >
                <div v-if="isVideoMedia(currentActiveMedia)" class="wine-photo-video">
                  <video
                    :src="getImageSrc(currentActiveMedia?.filepath)"
                    playsinline
                    muted
                    preload="metadata"
                    controlsList="nodownload"
                    :style="photoMediaStyle"
                  ></video>
                  <div class="wine-photo-video-overlay">
                    <ion-icon :icon="playCircle"></ion-icon>
                  </div>
                </div>
                <img
                  v-else
                  :src="getImageSrc(currentActiveMedia?.filepath)"
                  :alt="currentActiveMedia?.filename || $t('auto.foto')"
                  loading="lazy"
                  :style="photoMediaStyle"
                />
                <span class="wine-photo-count">
                  {{ activePhotoIndex + 1 }} / {{ wineLightboxItems.length }}
                </span>
              </button>
              <div id="wine-photo-gallery" class="wine-photo-gallery" aria-hidden="true">
                <a
                  v-for="(media, index) in wineLightboxItems"
                  :key="media.id ?? media.filepath"
                  class="photo-link glightbox"
                  :href="getImageSrc(media.filepath)"
                  :data-type="isVideoMedia(media) ? 'video' : 'image'"
                  :data-source="isVideoMedia(media) ? 'local' : undefined"
                  :data-video="isVideoMedia(media) ? getVideoData(media.filepath, media.mimeType) : undefined"
                  @click.prevent="handlePhotoClick(index)"
                >
                  <span class="visually-hidden">{{ $t('auto.foto') }}</span>
                </a>
              </div>
            </div>
            <div v-else class="wine-photo-placeholder">
              <ion-icon :icon="wineOutline" size="large"></ion-icon>
              <p>{{ $t('auto.kein_foto_vorhanden') }}</p>
              <p class="wine-photo-placeholder__hint">{{ $t('auto.fotos_hinzufuegen') }}</p>
            </div>
          </div>

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
                  <p>{{ $t('auto.weingut') }}</p>
                  <h3>{{ wine.winery }}</h3>
                </ion-label>
              </ion-item>

              <!-- Region & Land -->
              <ion-item v-if="wine.region || wine.country">
                <ion-icon :icon="locationOutline" slot="start"></ion-icon>
                <ion-label>
                  <p>{{ $t('auto.herkunft') }}</p>
                  <h3>{{ [wine.region, wine.country].filter(Boolean).join(', ') }}</h3>
                </ion-label>
              </ion-item>

              <!-- Jahrgang -->
              <ion-item v-if="wine.year">
                <ion-icon :icon="calendar" slot="start"></ion-icon>
                <ion-label>
                  <p>{{ $t('auto.jahrgang') }}</p>
                  <h3>{{ wine.year }}</h3>
                </ion-label>
              </ion-item>

              <!-- Rebsorte -->
              <ion-item v-if="wine.grapeVariety">
                <ion-icon :icon="leaf" slot="start"></ion-icon>
                <ion-label>
                  <p>{{ $t('auto.rebsorte') }}</p>
                  <h3>{{ wine.grapeVariety }}</h3>
                </ion-label>
              </ion-item>

              <!-- Weintyp -->
              <ion-item v-if="wine.type">
                <ion-icon :icon="wineOutline" slot="start"></ion-icon>
                <ion-label>
                  <p>{{ $t('auto.weintyp') }}</p>
                  <h3>{{ wine.type }}</h3>
                </ion-label>
              </ion-item>

              <!-- Preis -->
              <ion-item v-if="wine.price">
                <ion-icon :icon="cash" slot="start"></ion-icon>
                <ion-label>
                  <p>{{ $t('auto.preis') }}</p>
                  <h3>{{ wine.price.toFixed(2) }} €</h3>
                </ion-label>
              </ion-item>

              <!-- Anzahl -->
              <ion-item v-if="wine.quantity">
                <ion-icon :icon="layers" slot="start"></ion-icon>
                <ion-label>
                  <p>{{ $t('auto.anzahl_flaschen') }}</p>
                  <h3>{{ wine.quantity }}</h3>
                </ion-label>
              </ion-item>

              <!-- Lagerort -->
              <ion-item v-if="wine.storageLocation">
                <ion-icon :icon="cube" slot="start"></ion-icon>
                <ion-label>
                  <p>{{ $t('auto.lagerort') }}</p>
                  <h3>{{ wine.storageLocation }}</h3>
                </ion-label>
              </ion-item>

              <!-- Kaufdatum -->
              <ion-item v-if="wine.purchaseDate">
                <ion-icon :icon="cartOutline" slot="start"></ion-icon>
                <ion-label>
                  <p>{{ $t('auto.kaufdatum') }}</p>
                  <h3>{{ formatDate(wine.purchaseDate) }}</h3>
                </ion-label>
              </ion-item>

              <!-- GPS Koordinaten -->
              <ion-item v-if="wine.latitude && wine.longitude" button @click="showOnMap">
                <ion-icon :icon="map" slot="start"></ion-icon>
                <ion-label>
                  <p>{{ $t('auto.gps_position') }}</p>
                  <h3>{{ wine.latitude.toFixed(6) }}, {{ wine.longitude.toFixed(6) }}</h3>
                </ion-label>
                <ion-icon :icon="chevronForward" slot="end"></ion-icon>
              </ion-item>

              <!-- Notizen -->
              <ion-item v-if="wine.notes">
                <ion-label class="ion-text-wrap">
                  <p>{{ $t('auto.notizen') }}</p>
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
      </template>

      <div v-else class="empty-state">
        <ion-icon :icon="wineOutline" size="large"></ion-icon>
        <h2>{{ $t('auto.wein_nicht_gefunden') }}</h2>
      </div>
    </ion-content>

    <!-- Edit Modal -->
    <ion-modal :is-open="showEditModal" @didDismiss="closeEditModal">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button @click="closeEditModal">{{ $t('auto.abbrechen') }}</ion-button>
          </ion-buttons>
          <ion-buttons slot="end">
            <ion-button :strong="true" @click="handleSaveEdit">{{ $t('auto.speichern') }}</ion-button>
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
              v-model.number="editWine.price"
              type="number"
              label="Preis (€)"
              label-placement="stacked"
              placeholder="z.B. 29.90"
            ></ion-input>
          </ion-item>

          <ion-item>
            <ion-input
              v-model.number="editWine.quantity"
              type="number"
              :label="$t('auto.anzahl_flaschen')"
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
            <ion-label>{{ $t('auto.bewertung') }}</ion-label>
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
import { ref, onMounted, watch, computed, nextTick, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
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
  alertController,
  toastController,
  loadingController
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
  trash,
  trashOutline,
  playCircle,
  sparkles,
  camera
} from 'ionicons/icons';
import { useWine } from '@/composables/useWine';
import { useLightbox, type MediaItem } from '@/composables/useLightbox';
import { db, type Wine, type WinePhoto } from '@/services/database';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Filesystem } from '@capacitor/filesystem';
import { removeBackground } from '@imgly/background-removal';
import { buildSharedStoragePath, getSharedStorageDirectory, ensureDirectoryExists, getSharedStorageRelativePath } from '@/services/storagePaths';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { getWine, updateWine, deleteWine, takeWinePhoto } = useWine();
const { initLightbox, openLightbox, destroyLightbox } = useLightbox();
const wineLightboxBodyClass = 'wine-detail-lightbox-short';

const wine = ref<Wine | null>(null);
const isLoading = ref(true);
const selectedTab = ref('info');
const showEditModal = ref(false);
const editWine = ref<Partial<Wine>>({});
const isRemovingBackground = ref(false);
const isUpdatingPhoto = ref(false);
const winePhotos = ref<WinePhoto[]>([]);
const videoExtensions = ['mp4', 'mov', 'webm', 'mkv', 'avi', '3gp', 'm4v'];

onMounted(async () => {
  if (typeof document !== 'undefined') {
    document.body.classList.add(wineLightboxBodyClass);
  }
  const id = parseInt(route.params.id as string);
  if (isNaN(id)) {
    router.replace('/wine');
    return;
  }

  try {
    wine.value = await getWine(id);
    await loadWinePhotos(id);
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

const getFileExtension = (path: string) => path.split('.').pop()?.toLowerCase() || '';

const getFileNameFromPath = (path: string) => path.split('/').pop() || `wine_${Date.now()}`;

const inferMimeTypeFromPath = (path: string) => {
  const ext = getFileExtension(path);
  if (!ext) return 'image/jpeg';
  if (videoExtensions.includes(ext)) {
    if (ext === '3gp') return 'video/3gpp';
    if (ext === 'mkv') return 'video/x-matroska';
    return `video/${ext}`;
  }
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
};

const isVideoMedia = (
  media?: { filepath?: string; mimeType?: string } | null
) => {
  if (!media) return false;
  if (media.mimeType?.startsWith('video/')) return true;
  const ext = getFileExtension(media.filepath || '');
  return videoExtensions.includes(ext);
};

const getVideoData = (filepath: string, mimeType?: string) => {
  const source = getImageSrc(filepath);
  if (!source) return undefined;
  const type = mimeType || inferMimeTypeFromPath(filepath) || 'video/mp4';
  return JSON.stringify({
    source: [{ src: source, type }],
    attributes: {
      preload: 'metadata',
      playsinline: true
    }
  });
};

const wineLightboxItems = computed<MediaItem[]>(() => {
  const currentWine = wine.value;
  if (!currentWine) return [];
  const items: MediaItem[] = [];
  const seenPaths = new Set<string>();

  const pushItem = (payload: {
    filepath?: string;
    filename?: string;
    mimeType?: string;
    id?: number;
    foreignID?: string;
    created?: string;
    updated?: string;
  }) => {
    if (!payload.filepath) return;
    if (seenPaths.has(payload.filepath)) return;
    seenPaths.add(payload.filepath);
    const video = isVideoMedia(payload);
    items.push({
      id: payload.id,
      foreignID: payload.foreignID,
      galleryId: currentWine.id,
      filename: payload.filename || getFileNameFromPath(payload.filepath),
      filepath: payload.filepath,
      created: payload.created ?? currentWine.created,
      updated: payload.updated ?? currentWine.updated,
      mimeType: payload.mimeType || inferMimeTypeFromPath(payload.filepath),
      isVideo: video,
      videoUrl: payload.filepath
    } as MediaItem);
  };

  pushItem({
    filepath: currentWine.photoPath,
    filename: currentWine.photoPath ? `wine_${currentWine.id}_primary` : undefined,
    created: currentWine.created,
    updated: currentWine.updated,
    mimeType: 'image/jpeg'
  });

  for (const photo of winePhotos.value) {
    pushItem({
      id: photo.id,
      foreignID: photo.foreignID,
      filepath: photo.filepath,
      filename: photo.filename,
      created: photo.created,
      updated: photo.updated,
      mimeType: photo.mimeType
    });
  }

  return items;
});

const activePhotoIndex = ref(0);
const currentActiveMedia = computed<MediaItem | null>(() => {
  const items = wineLightboxItems.value;
  if (!items.length) {
    return null;
  }
  const normalizedIndex = Math.min(Math.max(activePhotoIndex.value, 0), items.length - 1);
  return items[normalizedIndex];
});

const triggerLightbox = () => {
  if (!wineLightboxItems.value.length) return;
  openLightbox(activePhotoIndex.value);
};

const photoAreaRef = ref<HTMLElement | null>(null);
const initialScale = 0.85;
const minZoom = initialScale;
const maxZoom = 3;
const photoScale = ref(initialScale);
const photoTranslateX = ref(0);
const photoTranslateY = ref(0);
const pinchActive = ref(false);
const pinchStartDistance = ref(0);
const pinchStartScale = ref(initialScale);
const panActive = ref(false);
const lastPanX = ref(0);
const lastPanY = ref(0);
const skipNextSwipe = ref(false);
const photoBounds = ref({ width: 0, height: 0 });

const clampScale = (value: number) => Math.min(Math.max(value, minZoom), maxZoom);
const getTouchDistance = (a: Touch, b: Touch) => {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
};

const updatePhotoBounds = () => {
  const rect = photoAreaRef.value?.getBoundingClientRect();
  if (!rect) return;
  photoBounds.value.width = rect.width;
  photoBounds.value.height = rect.height;
};

const getMaxOffset = (axis: 'x' | 'y') => {
  const dimension = axis === 'x' ? photoBounds.value.width : photoBounds.value.height;
  if (!dimension) return 0;
  return Math.max((dimension * (photoScale.value - 1)) / 2, 0);
};

const clampTranslation = (value: number, axis: 'x' | 'y') => {
  const max = getMaxOffset(axis);
  if (max === 0) return 0;
  return Math.min(Math.max(value, -max), max);
};

const resetPhotoScale = () => {
  photoScale.value = initialScale;
  photoTranslateX.value = 0;
  photoTranslateY.value = 0;
  pinchActive.value = false;
  pinchStartDistance.value = 0;
  pinchStartScale.value = initialScale;
  panActive.value = false;
  skipNextSwipe.value = false;
};

const photoMediaStyle = computed(() => ({
  transform: `translate(${photoTranslateX.value}px, ${photoTranslateY.value}px) scale(${photoScale.value})`,
  transformOrigin: 'center center',
  transition: pinchActive.value || panActive.value ? 'none' : 'transform 0.2s ease'
}));

const handlePinchStart = (event: TouchEvent) => {
  if (event.touches.length !== 2) return;
  updatePhotoBounds();
  pinchActive.value = true;
  pinchStartDistance.value = getTouchDistance(event.touches[0], event.touches[1]);
  pinchStartScale.value = photoScale.value;
  skipNextSwipe.value = true;
  swipeStartX = null;
  swipeStartY = null;
};

const handlePinchMove = (event: TouchEvent) => {
  if (!pinchActive.value || event.touches.length < 2) return;
  event.preventDefault();
  if (!pinchStartDistance.value) return;
  const distance = getTouchDistance(event.touches[0], event.touches[1]);
  const scaleRatio = distance / pinchStartDistance.value;
  photoScale.value = clampScale(pinchStartScale.value * scaleRatio);
  photoTranslateX.value = clampTranslation(photoTranslateX.value, 'x');
  photoTranslateY.value = clampTranslation(photoTranslateY.value, 'y');
};

const handlePinchEnd = () => {
  if (!pinchActive.value) return;
  pinchActive.value = false;
  pinchStartDistance.value = 0;
  pinchStartScale.value = clampScale(photoScale.value);
  if (photoScale.value <= 1) {
    photoTranslateX.value = 0;
    photoTranslateY.value = 0;
  }
};

const startPan = (event: TouchEvent) => {
  if (photoScale.value <= 1 || event.touches.length !== 1) return;
  updatePhotoBounds();
  panActive.value = true;
  const touch = event.touches[0];
  lastPanX.value = touch.clientX;
  lastPanY.value = touch.clientY;
  skipNextSwipe.value = true;
  swipeStartX = null;
  swipeStartY = null;
};

const handlePanMove = (event: TouchEvent) => {
  if (!panActive.value || event.touches.length !== 1) return;
  event.preventDefault();
  const touch = event.touches[0];
  const deltaX = touch.clientX - lastPanX.value;
  const deltaY = touch.clientY - lastPanY.value;
  lastPanX.value = touch.clientX;
  lastPanY.value = touch.clientY;
  photoTranslateX.value = clampTranslation(photoTranslateX.value + deltaX, 'x');
  photoTranslateY.value = clampTranslation(photoTranslateY.value + deltaY, 'y');
};

const endPan = () => {
  if (!panActive.value) return;
  panActive.value = false;
  if (photoScale.value <= 1) {
    photoTranslateX.value = 0;
    photoTranslateY.value = 0;
  }
};

const handlePhotoTouchStart = (event: TouchEvent) => {
  if (event.touches.length === 2) {
    handlePinchStart(event);
    return;
  }
  if (photoScale.value > 1) {
    startPan(event);
    return;
  }
  handlePhotoSwipeStart(event);
};

const handlePhotoTouchMove = (event: TouchEvent) => {
  if (pinchActive.value) {
    handlePinchMove(event);
    return;
  }
  if (panActive.value) {
    handlePanMove(event);
  }
};

const handlePhotoTouchEnd = (event: TouchEvent) => {
  handlePinchEnd();
  endPan();
  if (event.touches.length === 0 && skipNextSwipe.value) {
    skipNextSwipe.value = false;
    return;
  }
  if (skipNextSwipe.value) {
    return;
  }
  handlePhotoSwipeEnd(event);
};

watch(selectedTab, (value) => {
  if (value !== 'photo') {
    resetPhotoScale();
  }
});

watch(currentActiveMedia, () => {
  resetPhotoScale();
});

watch(photoScale, (scale) => {
  if (scale <= 1) {
    photoTranslateX.value = 0;
    photoTranslateY.value = 0;
    return;
  }
  photoTranslateX.value = clampTranslation(photoTranslateX.value, 'x');
  photoTranslateY.value = clampTranslation(photoTranslateY.value, 'y');
});

const swipeDetected = ref(false);
let swipeStartX: number | null = null;
let swipeStartY: number | null = null;
const swipeThreshold = 40;

const goToAdjacentPhoto = (offset: number) => {
  const items = wineLightboxItems.value;
  if (!items.length) return;
  const nextIndex = (activePhotoIndex.value + offset + items.length) % items.length;
  activePhotoIndex.value = nextIndex;
};

const handlePhotoAreaClick = () => {
  if (swipeDetected.value) {
    swipeDetected.value = false;
    return;
  }
  triggerLightbox();
};

const handlePhotoSwipeStart = (event: TouchEvent) => {
  if (event.touches.length !== 1) return;
  const touch = event.touches[0];
  swipeStartX = touch.clientX;
  swipeStartY = touch.clientY;
  swipeDetected.value = false;
};

const handlePhotoSwipeEnd = (event: TouchEvent) => {
  if (swipeStartX === null || swipeStartY === null) return;
  const touch = event.changedTouches[0];
  const dx = touch.clientX - swipeStartX;
  const dy = touch.clientY - swipeStartY;
  if (Math.abs(dx) > swipeThreshold && Math.abs(dx) > Math.abs(dy)) {
    swipeDetected.value = true;
    goToAdjacentPhoto(dx < 0 ? 1 : -1);
    setTimeout(() => {
      swipeDetected.value = false;
    }, 200);
  }
  swipeStartX = null;
  swipeStartY = null;
};

const loadWinePhotos = async (id?: number) => {
  if (!id) return;
  try {
    winePhotos.value = await db.getWinePhotos(id);
  } catch (error) {
    console.error('Could not load wine photos:', error);
  }
};

const handlePhotoClick = (index: number) => {
  if (!wineLightboxItems.value.length) return;
  activePhotoIndex.value = Math.min(Math.max(index, 0), wineLightboxItems.value.length - 1);
  triggerLightbox();
};

const deleteFileFromStorage = async (filepath?: string) => {
  if (!filepath) return;
  const relativePath = getSharedStorageRelativePath(filepath);
  if (!relativePath) return;
  try {
    await Filesystem.deleteFile({
      path: relativePath,
      directory: getSharedStorageDirectory()
    });
  } catch (error) {
    console.warn('Could not remove file from storage:', error);
  }
};

const performDeleteCurrentLightboxPhoto = async (media: MediaItem) => {
  if (!wine.value?.id) return;
  const wineId = wine.value.id;
  const filepath = media.filepath;
  try {
    if (media.id) {
      await db.deleteWinePhoto(media.id);
    } else if (wine.value.photoPath === filepath) {
      await updateWine(wineId, { photoPath: undefined });
    }
    await deleteFileFromStorage(filepath);
    await loadWinePhotos(wineId);
    wine.value = await getWine(wineId);
    const successToast = await toastController.create({
      message: 'Foto gelöscht',
      duration: 2000,
      color: 'success'
    });
    await successToast.present();
  } catch (error) {
    console.error('Failed to delete wine photo:', error);
    const failureToast = await toastController.create({
      message: 'Foto konnte nicht gelöscht werden.',
      duration: 2500,
      color: 'danger'
    });
    await failureToast.present();
  }
};

const confirmDeleteCurrentLightboxPhoto = async () => {
  const media = currentActiveMedia.value;
  if (!media?.filepath) return;
  const alert = await alertController.create({
    header: 'Foto löschen?',
    message: 'Dieses Foto wird dauerhaft entfernt.',
    buttons: [
      {
        text: 'Löschen',
        role: 'destructive',
        handler: async () => {
          destroyLightbox();
          await performDeleteCurrentLightboxPhoto(media);
        }
      }
    ]
  });
  await alert.present();
};

watch(wineLightboxItems, (items) => {
  if (!items.length) {
    destroyLightbox();
    return;
  }
  nextTick(() => {
    destroyLightbox();
    activePhotoIndex.value = Math.min(activePhotoIndex.value, items.length - 1);
    initLightbox('#wine-photo-gallery', items, (index) => {
      activePhotoIndex.value = index;
    });
  });
}, { immediate: true });

onBeforeUnmount(() => {
  destroyLightbox();
  if (typeof document !== 'undefined') {
    document.body.classList.remove(wineLightboxBodyClass);
  }
});

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

const handleBackgroundRemoval = async () => {
  const media = currentActiveMedia.value;
  if (!media?.filepath || isVideoMedia(media) || isRemovingBackground.value || !wine.value?.id) return;
  isRemovingBackground.value = true;
  const loading = await loadingController.create({
    spinner: 'crescent',
    message: `${t('auto.hintergrund_entfernen')} …`
  });
  await loading.present();

  try {
    const imageUrl = getImageSrc(media.filepath);
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error('Unable to fetch wine photo');
    }
    const imageBlob = await response.blob();
    const processedBlob = await removeBackground(imageBlob, {
      output: {
        format: 'image/png',
        quality: 0.9
      }
    });
    const base64Data = await convertBlobToBase64(processedBlob);

    await ensureDirectoryExists(getSharedStorageDirectory(), buildSharedStoragePath('wines'));
    const fileName = `wine_${wine.value.id}_${Date.now()}_fg.png`;
    const savedFile = await Filesystem.writeFile({
      path: buildSharedStoragePath('wines', fileName),
      data: base64Data,
      directory: getSharedStorageDirectory(),
      recursive: true
    });

    const currentWineId = wine.value.id;
    const updatedMimeType = 'image/png';
    if (media.id) {
      await db.updateWinePhoto(media.id, {
        filepath: savedFile.uri,
        mimeType: updatedMimeType,
        filesize: processedBlob.size
      });
    } else {
      await updateWine(currentWineId, { photoPath: savedFile.uri });
    }
    await loadWinePhotos(currentWineId);
    wine.value = await getWine(currentWineId);

    const successToast = await toastController.create({
      message: t('auto.hintergrund_entfernt'),
      duration: 2000,
      color: 'success'
    });
    await successToast.present();
  } catch (error) {
    console.error('Failed to remove background:', error);
    const failureToast = await toastController.create({
      message: t('auto.hintergrund_entfernen_fehlgeschlagen'),
      duration: 2500,
      color: 'danger'
    });
    await failureToast.present();
  } finally {
    isRemovingBackground.value = false;
    if (loading) {
      try {
        await loading.dismiss();
      } catch (dismissError) {
        console.warn('Background removal loader already dismissed', dismissError);
      }
    }
  }
};

const createWinePhotoRecord = async (photoPath: string) => {
  if (!wine.value?.id) return;
  await db.createWinePhoto({
    wineId: wine.value.id,
    filename: getFileNameFromPath(photoPath),
    filepath: photoPath,
    mimeType: inferMimeTypeFromPath(photoPath)
  });
};

const handleAddPhoto = async () => {
  if (isUpdatingPhoto.value || !wine.value?.id) return;
  isUpdatingPhoto.value = true;

  try {
    const { photoPath, latitude, longitude } = await takeWinePhoto();
    if (!photoPath) {
      throw new Error('Foto konnte nicht gespeichert werden.');
    }
    await createWinePhotoRecord(photoPath);
    if (latitude !== undefined && longitude !== undefined) {
      await updateWine(wine.value.id, { latitude, longitude });
    }
    await loadWinePhotos(wine.value.id);
    wine.value = await getWine(wine.value.id);

    const successToast = await toastController.create({
      message: t('auto.foto_aufgenommen'),
      duration: 2000,
      color: 'success'
    });
    await successToast.present();
  } catch (error) {
    console.error('Failed to add wine photo:', error);
    const failureToast = await toastController.create({
      message: 'Foto konnte nicht hinzugefügt werden.',
      duration: 2500,
      color: 'danger'
    });
    await failureToast.present();
  } finally {
    isUpdatingPhoto.value = false;
  }
};

const showOptions = async () => {
  const actionSheet = await actionSheetController.create({
    header: 'Optionen',
    buttons: [
      {
        text: 'Foto hinzufügen',
        icon: camera,
        handler: () => {
          handleAddPhoto();
        }
      },
      {
        text: 'Bearbeiten',
        icon: create,
        handler: () => {
          openEditModal();
        }
      },
        {
          text: 'Freistellen',
          icon: sparkles,
          disabled:
            !currentActiveMedia.value?.filepath ||
            isRemovingBackground.value ||
            isVideoMedia(currentActiveMedia.value),
          handler: () => {
            handleBackgroundRemoval();
          }
        },
        {
          text: 'Aktuelles Foto löschen',
          icon: trashOutline,
          role: 'destructive',
          disabled: !currentActiveMedia.value?.filepath,
          handler: () => {
            confirmDeleteCurrentLightboxPhoto();
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
    ]
  });

  await actionSheet.present();
};

const convertBlobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
};


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
  height: 200px;
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

.wine-photo-placeholder__hint {
  color: var(--ion-color-medium);
  margin-top: 8px;
  font-size: 14px;
}

.wine-photo-viewer {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 4px;
}

.wine-photo-active {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 22px;
  overflow: hidden;
  padding: 0;
  border: none;
  background: var(--ion-color-step-50);
  width: 100%;
  min-height: calc(280px * 0.85);
  max-height: calc(80vh * 0.97);
  touch-action: none;
  cursor: pointer;
}

.wine-photo-active img,
.wine-photo-active video {
  width: 100%;
  height: auto;
  max-height: 80%;
  object-fit: contain;
  display: block;
}

.wine-photo-video {
  position: relative;
  width: 100%;
  height: 100%;
}

.wine-photo-video video {
  height: 100%;
}

.wine-photo-video-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0.55));
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ion-color-light);
  font-size: 48px;
}

.wine-photo-count {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.6);
  color: var(--ion-color-light);
  font-weight: 600;
  font-size: 12px;
}

.wine-photo-gallery {
  width: 1px;
  height: 1px;
  overflow: hidden;
  position: absolute;
  opacity: 0;
  pointer-events: none;
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

/* Deine Klasse am ion-content */
ion-content.content-safe {
  /* Füge das Padding dem Scroll-Content hinzu */
  --padding-top: calc(var(--ion-safe-area-top) + var(--offset-top, 0px));
  --padding-bottom: var(--ion-safe-area-bottom);
}

/* Falls du lieber das Scroll-Element selbst paddest: */
ion-content.content-safe::part(scroll) {
  padding-top: calc(var(--ion-safe-area-top) + var(--offset-top, 0px));
  padding-bottom: var(--ion-safe-area-bottom);
}

/* gilt nur im Photo-Tab */
.tab-content.photo-tab {
  padding-top: 0;
}

:global(body.wine-detail-lightbox-short .glightbox-container),
:global(body.wine-detail-lightbox-short .glightbox-container .ginner-container),
:global(body.wine-detail-lightbox-short .glightbox-container .gslide),
:global(body.wine-detail-lightbox-short .glightbox-container .gslide-inner-content) {
  min-height: 100vh;
  height: 100vh;
}

:global(body.wine-detail-lightbox-short .glightbox-container .gslide-media) {
  max-height: 650vh;
}
</style>
