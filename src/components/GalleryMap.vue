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
const galleryColors = ref<Map<number, string>>(new Map());

// Filtere Fotos mit GPS-Daten
const photosWithLocation = ref<Photo[]>([]);

const updatePhotosWithLocation = async () => {
  console.log('🗺️ updatePhotosWithLocation called');
  console.log('🗺️ Total photos:', props.photos.length);
  console.log('🗺️ All photos with GPS info:', props.photos.map(p => ({ 
    id: p.id, 
    filename: p.filename, 
    isVideo: p.isVideo,
    lat: p.latitude, 
    lng: p.longitude,
    hasGPS: p.latitude != null && p.longitude != null
  })));
  
  photosWithLocation.value = props.photos.filter(
    photo => !photo.isVideo && photo.latitude != null && photo.longitude != null
  );
  console.log('📍 Photos with location:', photosWithLocation.value.length);
  console.log('Photos with GPS:', photosWithLocation.value.map(p => ({ 
    id: p.id,
    filename: p.filename,
    lat: p.latitude, 
    lng: p.longitude 
  })));

  // Lade Galerie-Farben für alle Fotos
  const uniqueGalleryIds = [...new Set(props.photos.map(p => p.galleryId))];
  for (const galleryId of uniqueGalleryIds) {
    if (!galleryColors.value.has(galleryId)) {
      const gallery = await db.getGallery(galleryId);
      if (gallery?.color) {
        galleryColors.value.set(galleryId, gallery.color);
      }
    }
  }
};

const createPopupContent = (photo: Photo): string => {
  let dateStr = '';
  if (photo.dateTaken) {
    const date = new Date(photo.dateTaken);
    dateStr = !isNaN(date.getTime()) ? date.toLocaleDateString('de-DE') : '';
  }
  const dateLine = dateStr ? `<p style="margin: 4px 0 0; font-size: 11px; color: #666;">${dateStr}</p>` : '';
  
  return `
    <div class="photo-popup">
      <img src="${photo.filepath}" alt="${photo.filename}" style="max-width: 200px; max-height: 150px; object-fit: cover; border-radius: 4px;">
      <p style="margin: 8px 0 0; font-size: 12px; font-weight: 500;">${photo.filename}</p>
      ${dateLine}
    </div>
  `;
};

const createTooltipContent = (photo: Photo): string => {
  return `
    <div class="photo-tooltip">
      <img src="${photo.filepath}" alt="${photo.filename}" style="max-width: 150px; max-height: 120px; object-fit: cover; border-radius: 4px;">
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
      if (photo.latitude && photo.longitude) {
        console.log('📍 Adding marker:', photo.latitude, photo.longitude);
        
        const popupContent = createPopupContent(photo);
        const tooltipContent = createTooltipContent(photo);
        
        // Erstelle farbigen Marker basierend auf Galerie-Farbe
        const galleryColor = galleryColors.value.get(photo.galleryId) || '#3880ff';
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
        
        const marker = L.marker([photo.latitude, photo.longitude], { icon: customIcon })
          .addTo(map!)
          .bindPopup(popupContent)
          .bindTooltip(tooltipContent, {
            direction: 'top',
            offset: [0, -25],
            opacity: 0.95
          });

        // Klick auf Marker → Photo öffnen
        marker.on('click', () => {
          const originalIndex = props.photos.findIndex(p => p.id === photo.id);
          if (originalIndex !== -1) {
            emit('photoClick', originalIndex);
          }
        });

        markers.push(marker);
        bounds.push([photo.latitude, photo.longitude]);
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
  /* Responsive height: min/max to fit mobile screens without overflow */
  height: clamp(220px, 35vh, 420px);
  position: relative;
  background: var(--ion-color-light);
  border-radius: 8px;
  overflow: hidden;
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
.leaflet-tooltip {
  padding: 4px;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  border: 2px solid white;
}

.photo-tooltip img {
  display: block;
  border-radius: 4px;
}
</style>
