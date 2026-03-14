<template>
  <ion-modal :is-open="isOpen" @didDismiss="emit('cancel')">
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ $t('auto.standort_wählen') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="emit('cancel')">{{ $t('auto.abbrechen') }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    
    <ion-content>
      <div class="location-picker-container">
        <div class="map-container" ref="mapContainer"></div>
        
        <div class="coordinates-info">
          <ion-chip color="primary">
            <ion-icon :icon="locationOutline"></ion-icon>
            <ion-label>
              {{ selectedLat.toFixed(6) }}, {{ selectedLng.toFixed(6) }}
            </ion-label>
          </ion-chip>
        </div>
        
        <div class="action-buttons">
          <ion-button expand="block" @click="confirmLocation" color="primary" :disabled="!canConfirm">
            <ion-icon slot="start" :icon="checkmarkOutline"></ion-icon>
            {{ $t('auto.standort_übernehmen') }}
          </ion-button>
          
          <ion-button 
            expand="block" 
            fill="outline" 
            @click="useCurrentLocation"
            :disabled="isLoadingLocation"
          >
            <ion-icon slot="start" :icon="navigateOutline"></ion-icon>
            {{ isLoadingLocation ? 'Lädt...' : 'Aktuellen Standort verwenden' }}
          </ion-button>
        </div>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonChip,
  IonIcon,
  IonLabel
} from '@ionic/vue';
import { locationOutline, checkmarkOutline, navigateOutline } from 'ionicons/icons';
import L from 'leaflet';
import { Geolocation } from '@capacitor/geolocation';

const props = defineProps<{
  isOpen: boolean;
  initialLat?: number;
  initialLng?: number;
}>();

const emit = defineEmits<{
  confirm: [lat: number, lng: number];
  cancel: [];
}>();

const mapContainer = ref<HTMLElement>();
let map: L.Map | null = null;
let marker: L.Marker | null = null;

const FALLBACK_LAT = 48.1372;
const FALLBACK_LNG = 11.5755;

const hasValidCoordinates = (lat?: number, lng?: number): lat is number => {
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
};

const selectedLat = ref(FALLBACK_LAT);
const selectedLng = ref(FALLBACK_LNG);
const isLoadingLocation = ref(false);
const locationResolved = ref(false);
const userAdjustedLocation = ref(false);
const canConfirm = computed(() => locationResolved.value || userAdjustedLocation.value);

const syncMapToSelectedLocation = () => {
  if (!map || !marker) return;
  const target: L.LatLngExpression = [selectedLat.value, selectedLng.value];
  map.setView(target, 13);
  marker.setLatLng(target);
};

const resolveInitialLocation = async () => {
  userAdjustedLocation.value = false;

  if (hasValidCoordinates(props.initialLat, props.initialLng)) {
    selectedLat.value = props.initialLat!;
    selectedLng.value = props.initialLng!;
    locationResolved.value = true;
    return;
  }

  try {
    const position = await Geolocation.getCurrentPosition();
    selectedLat.value = position.coords.latitude;
    selectedLng.value = position.coords.longitude;
    locationResolved.value = true;
  } catch (error) {
    console.warn('Could not resolve current location for picker, fallback to default center.', error);
    selectedLat.value = FALLBACK_LAT;
    selectedLng.value = FALLBACK_LNG;
    locationResolved.value = false;
  }
};

onMounted(() => {
  // Map wird erst initialisiert wenn Modal geöffnet wird
  watch(() => props.isOpen, async (isOpen) => {
    if (!isOpen) return;

    await resolveInitialLocation();

    if (mapContainer.value && !map) {
      initMap();
    } else {
      syncMapToSelectedLocation();
    }
  }, { immediate: true });
});

const initMap = () => {
  if (!mapContainer.value) return;

  // Map erstellen
  map = L.map(mapContainer.value).setView([selectedLat.value, selectedLng.value], 13);

  // Tiles hinzufügen
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  // Draggable Marker erstellen
  marker = L.marker([selectedLat.value, selectedLng.value], {
    draggable: true,
    icon: L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    })
  }).addTo(map);

  // Update Koordinaten beim Ziehen
  marker.on('dragend', () => {
    const pos = marker!.getLatLng();
    selectedLat.value = pos.lat;
    selectedLng.value = pos.lng;
    userAdjustedLocation.value = true;
    locationResolved.value = true;
  });

  // Map auf Klick: Marker bewegen
  map.on('click', (e: L.LeafletMouseEvent) => {
    selectedLat.value = e.latlng.lat;
    selectedLng.value = e.latlng.lng;
    marker?.setLatLng(e.latlng);
    userAdjustedLocation.value = true;
    locationResolved.value = true;
  });
};

const useCurrentLocation = async () => {
  isLoadingLocation.value = true;
  try {
    const position = await Geolocation.getCurrentPosition();
    selectedLat.value = position.coords.latitude;
    selectedLng.value = position.coords.longitude;
    userAdjustedLocation.value = true;
    locationResolved.value = true;
    
    if (map && marker) {
      map.setView([selectedLat.value, selectedLng.value], 13);
      marker.setLatLng([selectedLat.value, selectedLng.value]);
    }
  } catch (error) {
    console.error('Error getting current location:', error);
  } finally {
    isLoadingLocation.value = false;
  }
};

const confirmLocation = () => {
  if (!canConfirm.value) return;
  emit('confirm', selectedLat.value, selectedLng.value);
};
</script>

<style scoped>
.location-picker-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.map-container {
  flex: 1;
  width: 100%;
  /* Reduce modal map minimum height to fit smaller screens */
  min-height: clamp(220px, 40vh, 360px);
}

.coordinates-info {
  padding: 12px 16px;
  background: var(--ion-color-light);
  border-top: 1px solid var(--ion-color-light-shade);
  display: flex;
  justify-content: center;
}

.action-buttons {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
