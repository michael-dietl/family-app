<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/gallery" />
        </ion-buttons>
        <ion-title>{{ $t('auto.karte') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="showFilterOptions">
            <ion-icon slot="icon-only" :icon="filterOutline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="page-content" fullscreen>
      <!-- Loading State -->
      <div v-if="isLoading" class="loading-container">
        <ion-spinner />
      </div>

      <!-- Empty State -->
      <div v-else-if="markers.length === 0" class="empty-state">
        <ion-icon :icon="mapOutline" size="large" />
        <h2>{{ $t('auto.keine_gps_daten_vorhanden') }}</h2>
        <p>{{ $t('auto.fotos_und_weine_mit_gps_koordinaten_werden_hier_angezeigt') }}</p>
      </div>

      <!-- Map View -->
      <div v-else ref="mapContainer" class="map-container"></div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter, useRoute } from 'vue-router';
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
  IonSpinner,
  actionSheetController,
  toastController,
  loadingController
} from '@ionic/vue';
import { mapOutline, filterOutline } from 'ionicons/icons';
import { Capacitor } from '@capacitor/core';
import { db, type Photo, type Wine } from '@/services/database';
import { usePocketbaseSync } from '@/composables/usePocketbaseSync';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { StatusBar, Style } from '@capacitor/status-bar';

StatusBar.setOverlaysWebView({ overlay: false });
StatusBar.setStyle({ style: Style.Dark });


// Fix Leaflet Default Marker Icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const isLoading = ref(false);
const mapContainer = ref<HTMLElement | null>(null);
let map: L.Map | null = null;

interface MapMarker {
  type: 'photo' | 'wine';
  latitude: number;
  longitude: number;
  data: Photo | Wine;
}

const markers = ref<MapMarker[]>([]);
const showPhotos = ref(true);
const showWines = ref(true);
const galleryMeta = ref<Map<number, { color: string; name: string }>>(new Map());
const backfillInProgress = ref(false);
const { backfillPhotoCoordinatesAndSync } = usePocketbaseSync();

const toFiniteNumber = (value: unknown): number | null => {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const hasUsableCoordinates = (lat?: number | string | null, lng?: number | string | null): boolean => {
  const normalizedLat = toFiniteNumber(lat);
  const normalizedLng = toFiniteNumber(lng);
  if (normalizedLat == null || normalizedLng == null) return false;
  if (Math.abs(normalizedLat) < 0.000001 && Math.abs(normalizedLng) < 0.000001) return false;
  return true;
};

const getImageSrc = (path: string | undefined) => {
  if (!path) return '';
  return Capacitor.convertFileSrc(path);
};

onMounted(async () => {
  await loadMarkers();
  
  // Check for query parameters (z.B. von WineDetailPage)
  const lat = route.query.lat;
  const lng = route.query.lng;
  const zoom = route.query.zoom;
  
  if (lat && lng) {
    await nextTick();
    await initMap(parseFloat(lat as string), parseFloat(lng as string), parseInt(zoom as string) || 13);
  } else {
    await initMap();
  }
});

onBeforeUnmount(() => {
  destroyMap();
});

const loadMarkers = async () => {
  isLoading.value = true;
  try {
    const allMarkers: MapMarker[] = [];
    
    // Lade Fotos
    if (showPhotos.value) {
      const galleries = await db.getGalleries();
      // Build quick lookup for gallery metadata so markers can use colors and names
      galleryMeta.value.clear();
      galleries.forEach(g => {
        if (g.id) {
          galleryMeta.value.set(g.id, {
            color: g.color || '#3880ff',
            name: g.name || ''
          });
        }
      });
      const photoPromises = galleries.map(g => db.getPhotosByGallery(g.id!));
      const photoArrays = await Promise.all(photoPromises);
      const photos = photoArrays.flat();
      
      photos.forEach(photo => {
        const latitude = toFiniteNumber(photo.latitude);
        const longitude = toFiniteNumber(photo.longitude);
        if (!hasUsableCoordinates(latitude, longitude) || photo.isVideo || latitude === null || longitude === null) {
          return;
        }
        allMarkers.push({
          type: 'photo',
          latitude,
          longitude,
          data: photo
        });
      });
    }
    
    // Lade Weine
    if (showWines.value) {
      const wines = await db.getWines();
      wines.forEach(wine => {
        const latitude = toFiniteNumber(wine.latitude);
        const longitude = toFiniteNumber(wine.longitude);
        if (!hasUsableCoordinates(latitude, longitude) || latitude === null || longitude === null) {
          return;
        }
        allMarkers.push({
          type: 'wine',
          latitude,
          longitude,
          data: wine
        });
      });
    }
    
    markers.value = allMarkers;
    console.log('Loaded markers:', {
      total: markers.value.length,
      photos: markers.value.filter(m => m.type === 'photo').length,
      wines: markers.value.filter(m => m.type === 'wine').length
    });
  } catch (error) {
    console.error('Error loading markers:', error);
  } finally {
    isLoading.value = false;
  }
};

const initMap = async (centerLat?: number, centerLng?: number, zoomLevel = 6) => {
  if (!mapContainer.value || markers.value.length === 0) {
    return;
  }

  await nextTick();

  try {
    // Erstelle Karte
    map = L.map(mapContainer.value, {
      center: centerLat && centerLng ? [centerLat, centerLng] : [51.1657, 10.4515],
      zoom: zoomLevel,
      scrollWheelZoom: true
    });

    // OpenStreetMap Tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    // Marker hinzufügen
    const bounds: L.LatLngTuple[] = [];
    
    markers.value.forEach((marker) => {
      if (marker.type === 'photo') {
        addPhotoMarker(marker.data as Photo, bounds);
      } else if (marker.type === 'wine') {
        addWineMarker(marker.data as Wine, bounds);
      }
    });

    // Zoom auf alle Marker (wenn keine spezifische Position angegeben)
    if (!centerLat && !centerLng && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }

    // Fix für Tile-Loading
    setTimeout(() => {
      map?.invalidateSize();
    }, 100);
  } catch (error) {
    console.error('Error initializing map:', error);
  }
};

const addPhotoMarker = (photo: Photo, bounds: L.LatLngTuple[]) => {
  if (!map || photo.latitude == null || photo.longitude == null) return;
  // Use gallery color when available
  const galleryInfo = galleryMeta.value.get(photo.galleryId);
  const galleryColor = galleryInfo?.color || '#3880ff';
  const photoIcon = L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background-color: ${galleryColor};
      width: 24px;
      height: 24px;
      border-radius: 50% 50% 50% 0;
      border: 3px solid white;
      transform: rotate(-45deg);
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    ">
      <div style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(45deg);
        color: white;
        font-size: 12px;
      ">📷</div>
    </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24]
  });

  let dateStr = '';
  if (photo.dateTaken) {
    const date = new Date(photo.dateTaken);
    dateStr = !isNaN(date.getTime()) ? date.toLocaleDateString('de-DE') : '';
  }
  
  const popupContent = `
    <div style="min-width: 200px;">
      <img src="${getImageSrc(photo.filepath)}" alt="${photo.filename}" style="width: 100%; max-height: 150px; object-fit: cover; border-radius: 4px; margin-bottom: 8px;">
      <p style="margin: 0; font-size: 12px; font-weight: 500;">${galleryInfo?.name || photo.filename}</p>
      ${dateStr ? `<p style="margin: 4px 0 0; font-size: 11px; color: #666;">${dateStr}</p>` : ''}
      <button onclick="window.openPhoto(${photo.galleryId})" style="
        margin-top: 8px;
        padding: 6px 12px;
        background: ${galleryColor};
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        width: 100%;
      ">Zur Galerie</button>
    </div>
  `;

  const marker = L.marker([photo.latitude, photo.longitude], { icon: photoIcon })
    .addTo(map)
    .bindPopup(popupContent);

  bounds.push([photo.latitude, photo.longitude]);
};

const addWineMarker = (wine: Wine, bounds: L.LatLngTuple[]) => {
  if (!map || wine.latitude == null || wine.longitude == null) return;

  // Weinreben-Icon
  const wineIcon = L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background-color: #8b4789;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 3px solid white;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      font-size: 16px;
    ">🍇</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28]
  });

  const popupContent = `
    <div style="min-width: 200px;">
      ${wine.photoPath ? `<img src="${getImageSrc(wine.photoPath)}" alt="${wine.name}" style="width: 100%; max-height: 150px; object-fit: cover; border-radius: 4px; margin-bottom: 8px;">` : ''}
      <p style="margin: 0; font-size: 14px; font-weight: 600;">${wine.name}</p>
      ${wine.winery ? `<p style="margin: 4px 0 0; font-size: 12px; color: #666;">${wine.winery}</p>` : ''}
      ${wine.region || wine.country ? `<p style="margin: 4px 0 0; font-size: 11px; color: #888;">${[wine.region, wine.country].filter(Boolean).join(', ')}</p>` : ''}
      ${wine.year ? `<p style="margin: 4px 0 0; font-size: 11px; color: #888;">Jahrgang: ${wine.year}</p>` : ''}
      <button onclick="window.openWine(${wine.id})" style="
        margin-top: 8px;
        padding: 6px 12px;
        background: #8b4789;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        width: 100%;
      ">Details anzeigen</button>
    </div>
  `;

  const marker = L.marker([wine.latitude, wine.longitude], { icon: wineIcon })
    .addTo(map)
    .bindPopup(popupContent);

  bounds.push([wine.latitude, wine.longitude]);
};

const destroyMap = () => {
  if (map) {
    map.remove();
    map = null;
  }
};

const runGpsBackfill = async () => {
  if (backfillInProgress.value) return;
  backfillInProgress.value = true;
  const loading = await loadingController.create({
    message: 'GPS-Daten werden aus EXIF nachgetragen...',
    spinner: 'crescent',
    backdropDismiss: false
  });
  await loading.present();

  try {
    const result = await backfillPhotoCoordinatesAndSync();
    destroyMap();
    await loadMarkers();
    await initMap();

    const toast = await toastController.create({
      message: `GPS nachgetragen: ${result.updated}/${result.scanned} (ohne GPS: ${result.withoutGps}, Fehler: ${result.failed})`,
      duration: 2400,
      color: result.updated > 0 ? 'success' : 'medium',
      position: 'bottom'
    });
    await toast.present();
  } catch (error) {
    console.error('GPS backfill failed:', error);
    const toast = await toastController.create({
      message: 'GPS-Nachtrag fehlgeschlagen',
      duration: 2400,
      color: 'danger',
      position: 'bottom'
    });
    await toast.present();
  } finally {
    await loading.dismiss();
    backfillInProgress.value = false;
  }
};

const showFilterOptions = async () => {
  const actionSheet = await actionSheetController.create({
    header: t('auto.anzeigen'),
    buttons: [
      {
        text: `${t('auto.fotos')} ${showPhotos.value ? '✓' : ''}`,
        handler: async () => {
          showPhotos.value = !showPhotos.value;
          destroyMap();
          await loadMarkers();
          await initMap();
        }
      },
      {
        text: `${t('auto.weine')} ${showWines.value ? '✓' : ''}`,
        handler: async () => {
          showWines.value = !showWines.value;
          destroyMap();
          await loadMarkers();
          await initMap();
        }
      },
      {
        text: backfillInProgress.value ? 'GPS-Nachtrag läuft…' : 'GPS aus EXIF nachtragen',
        handler: async () => {
          await runGpsBackfill();
        }
      },
      {
        text: t('auto.abbrechen'),
        role: 'cancel'
      }
    ]
  });

  await actionSheet.present();
};

// Global functions für Popup-Buttons
(window as any).openPhoto = (galleryId: number) => {
  router.push(`/gallery/${galleryId}`);
};

(window as any).openWine = (wineId: number) => {
  router.push(`/wine/${wineId}`);
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
  justify-content: center;
  align-items: center;
  height: 100%;
  text-align: center;
  padding: 2rem;
}

.empty-state ion-icon {
  font-size: 6rem;
  opacity: 0.3;
  margin-bottom: 1rem;
}

.empty-state h2 {
  margin: 0;
  font-size: 1.5rem;
}

.empty-state p {
  opacity: 0.6;
  margin-top: 0.5rem;
}

ion-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* Make ion-content a flex container so the map can size to the available client area */
ion-content.page-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  --padding-top: 0;
  --padding-bottom: 0;
}

/* Ensure loading/empty states fill the content area for centering */
.loading-container,
.empty-state {
  flex: 1 1 auto;
  min-height: 0;
}

.map-container {
  width: 100%;
  /* Fill the available content area and respect the system safe-area inset */
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  padding-bottom: env(safe-area-inset-bottom);
  box-sizing: border-box;
  position: relative;
}

.map-container > .leaflet-container {
  height: 100%;
}
</style>
