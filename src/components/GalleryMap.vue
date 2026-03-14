<template>
  <div class="gallery-map-container">
    <div v-if="photosWithLocation.length === 0" class="no-location-state">
      <ion-icon :icon="locationOutline" />
      <p>{{ $t('auto.keine_fotos_mit_gps_daten_vorhanden') }}</p>
      <p class="hint">{{ $t('auto.videos_werden_nicht_auf_der_karte_angezeigt') }}</p>
    </div>
    <div v-else>
      <div ref="mapContainer" class="map"></div>
      <p class="debug-info">{{ photosWithLocation.length }} Foto(s) mit GPS-Daten</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick, onBeforeUnmount } from 'vue';
import { IonIcon } from '@ionic/vue';
import { locationOutline } from 'ionicons/icons';
import L from 'leaflet';
import type { Photo } from '@/services/database';
import { db } from '@/services/database';
import { Capacitor } from '@capacitor/core';

// Fix Leaflet Default Marker Icons
import 'leaflet/dist/leaflet.css';
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface Props {
  photos: Photo[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'photoClick', photoIndex: number): void;
}>();

const mapContainer = ref<HTMLElement | null>(null);
let map: L.Map | null = null;
const markers: L.Marker[] = [];
const galleryInfos = ref<Map<number, { color?: string; name?: string }>>(new Map());

// Filtere Fotos mit GPS-Daten
const photosWithLocation = ref<Photo[]>([]);

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

const updatePhotosWithLocation = async () => {
  console.log('🗺️ updatePhotosWithLocation called');
  console.log('🗺️ Total photos:', props.photos.length);
  console.log('🗺️ All photos with GPS info:', props.photos.map(p => ({ 
    id: p.id, 
    filename: p.filename, 
    isVideo: p.isVideo,
    lat: p.latitude, 
    lng: p.longitude,
    hasGPS: hasUsableCoordinates(p.latitude ?? null, p.longitude ?? null)
  })));
  
  photosWithLocation.value = props.photos.filter(
    photo => !photo.isVideo && hasUsableCoordinates(photo.latitude ?? null, photo.longitude ?? null)
  );
  console.log('📍 Photos with location:', photosWithLocation.value.length);
  console.log('Photos with GPS:', photosWithLocation.value.map(p => ({ 
    id: p.id,
    filename: p.filename,
    lat: p.latitude, 
    lng: p.longitude 
  })));

  // Lade Galerie-Metadaten für alle Fotos
  const uniqueGalleryIds = [...new Set(props.photos.map(p => p.galleryId))];
  for (const galleryId of uniqueGalleryIds) {
    const gallery = await db.getGallery(galleryId);
    galleryInfos.value.set(galleryId, {
      color: gallery?.color,
      name: gallery?.name
    });
  }
};

const getImageSrc = (path: string | undefined) => {
  if (!path) return '';
  return Capacitor.convertFileSrc(path);
};

const createPopupContent = (photo: Photo, galleryName?: string): string => {
  let dateStr = '';
  if (photo.dateTaken) {
    const date = new Date(photo.dateTaken);
    dateStr = !isNaN(date.getTime()) ? date.toLocaleDateString('de-DE') : '';
  }
  const dateLine = dateStr ? `<p style="margin: 4px 0 0; font-size: 11px; color: #666;">${dateStr}</p>` : '';
  
  return `
    <div class="photo-popup">
      <img class="gallery-popup-image" src="${getImageSrc(photo.filepath)}" alt="${photo.filename}" style="max-width: 200px; max-height: 150px; object-fit: cover; border-radius: 4px;">
      <p style="margin: 8px 0 0; font-size: 12px; font-weight: 500;">${galleryName || photo.filename}</p>
      ${dateLine}
    </div>
  `;
};


const initMap = async () => {
  if (!mapContainer.value || photosWithLocation.value.length === 0) {
    console.warn('⚠️ Cannot init map:', { 
      hasContainer: !!mapContainer.value, 
      photosCount: photosWithLocation.value.length 
    });
    return;
  }

  await nextTick();
  
  console.log('🗺️ Initializing map...');

  try {
    // Erstelle Karte
    map = L.map(mapContainer.value, {
      center: [51.1657, 10.4515],
      zoom: 6,
      scrollWheelZoom: true
    });

    console.log('✅ Map created');

    // OpenStreetMap Tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    console.log('✅ Tiles added');

    // Marker für jedes Foto hinzufügen
    const bounds: L.LatLngBoundsExpression = [];
    
    photosWithLocation.value.forEach((photo) => {
      const latitude = toFiniteNumber(photo.latitude);
      const longitude = toFiniteNumber(photo.longitude);
      if (latitude != null && longitude != null) {
        console.log('📍 Adding marker:', latitude, longitude);
        
        const galleryInfo = galleryInfos.value.get(photo.galleryId);
        const popupContent = createPopupContent(photo, galleryInfo?.name);
        
        // Erstelle farbigen Marker basierend auf Galerie-Farbe
        const galleryColor = galleryInfo?.color || '#3880ff';
        const customIcon = L.divIcon({
          className: 'custom-marker',
          html: `<div style="
            background-color: ${galleryColor};
            width: 24px;
            height: 24px;
            border-radius: 50% 50% 50% 0;
            border: 3px solid white;
            transform: rotate(-45deg);
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          "></div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 24],
          popupAnchor: [0, -24]
        });
        
        const marker = L.marker([latitude, longitude], { icon: customIcon })
          .addTo(map!)
          .bindPopup(popupContent);

        const originalIndex = props.photos.findIndex(p => p.id === photo.id);
        marker.on('popupopen', () => {
          const popupElement = marker.getPopup()?.getElement();
          const image = popupElement?.querySelector<HTMLImageElement>('.gallery-popup-image');
          if (!image) return;
          image.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (originalIndex !== -1) {
              emit('photoClick', originalIndex);
            }
          };
        });

        markers.push(marker);
        bounds.push([latitude, longitude]);
      }
    });

    console.log(`✅ Added ${markers.length} markers`);

    // Zoom auf alle Marker
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }

    // Fix für Tile-Loading
    setTimeout(() => {
      map?.invalidateSize();
      console.log('🔄 Map size invalidated');
    }, 100);
  } catch (error) {
    console.error('❌ Error initializing map:', error);
  }
};

const destroyMap = () => {
  console.log('🗑️ Destroying map');
  if (map) {
    map.remove();
    map = null;
    markers.length = 0;
  }
};

onMounted(async () => {
  console.log('🎯 GalleryMap mounted with', props.photos.length, 'photos');
  await updatePhotosWithLocation();
  if (photosWithLocation.value.length > 0) {
    setTimeout(() => initMap(), 200);
  }
});

onBeforeUnmount(() => {
  destroyMap();
});

// Reagiere auf Photo-Änderungen
watch(() => props.photos, async () => {
  console.log('🔄 Photos changed');
  await updatePhotosWithLocation();
  destroyMap();
  if (photosWithLocation.value.length > 0) {
    nextTick(() => setTimeout(() => initMap(), 200));
  }
}, { deep: true });
</script>

<style scoped>
.gallery-map-container {
  width: 100%;
  /* Use parent-controlled height by default; fallback to a sensible clamp when not provided */
  height: var(--gallery-map-height, clamp(220px, 35vh, 420px));
  position: relative;
  background: var(--ion-color-light);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.map {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 8px;
  z-index: 1;
}

.debug-info {
  margin-top: 0.5rem;
  font-size: 12px;
  color: var(--ion-color-medium);
  text-align: center;
}

.no-location-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--ion-color-medium);
  padding: 2rem;
  text-align: center;
}

.no-location-state ion-icon {
  font-size: 60px;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.no-location-state p {
  margin: 0;
  font-size: 14px;
}

.no-location-state .hint {
  margin-top: 0.5rem;
  font-size: 12px;
  opacity: 0.7;
}
</style>

<style>
/* Global Leaflet Styles - NICHT scoped! */
.leaflet-container {
  width: 100%;
  height: 100%;
  z-index: 1;
  background: #f0f0f0;
}

.leaflet-popup-content {
  margin: 8px;
  min-width: 200px;
}

.photo-popup img {
  display: block;
  width: 100%;
  cursor: pointer;
}

.leaflet-popup-content-wrapper {
  border-radius: 8px;
}

/* Tooltip Styles */
</style>
