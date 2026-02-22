<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="handleBack">
            <ion-icon :icon="arrowBackOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ route?.name || 'Route aufzeichnen' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="addWaypointDialog" :disabled="!isTracking">
            <ion-icon :icon="addOutline" />
          </ion-button>
          <ion-button @click="addPhotoWaypointHandler" :disabled="!isTracking">
            <ion-icon name="camera" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <!-- Map Container -->
      <div id="route-map" class="map-container"></div>

      <!-- Stats Overlay -->
      <div class="stats-overlay">
        <div class="stat-card">
          <ion-icon :icon="navigateOutline" color="primary" />
          <div>
            <div class="stat-value">{{ formatDistance(distance) }}</div>
            <div class="stat-label">{{ $t('auto.distanz') }}</div>
          </div>
        </div>
        <div class="stat-card">
          <ion-icon :icon="timeOutline" color="success" />
          <div>
            <div class="stat-value">{{ formatDuration(duration) }}</div>
            <div class="stat-label">{{ $t('auto.dauer') }}</div>
          </div>
        </div>
        <div class="stat-card" v-if="currentPosition">
          <ion-icon :icon="speedometerOutline" color="warning" />
          <div>
            <div class="stat-value">{{ formatSpeed(currentPosition.coords.speed || 0) }}</div>
            <div class="stat-label">{{ $t('auto.geschwindigkeit') }}</div>
          </div>
        </div>
      </div>

      <!-- Control Buttons -->
      <div class="control-buttons">
        <ion-button
          v-if="!isTracking"
          @click="startRecording"
          expand="block"
          color="success"
          size="large"
        >
          <ion-icon slot="start" :icon="playOutline" />
          {{ $t('auto.aufzeichnung_starten') }}
        </ion-button>

        <template v-else>
          <ion-button
            v-if="!isPaused"
            @click="pauseRecording"
            expand="block"
            color="warning"
            size="large"
          >
            <ion-icon slot="start" :icon="pauseOutline" />
            {{ $t('auto.pausieren') }}
          </ion-button>

          <ion-button
            v-else
            @click="resumeRecording"
            expand="block"
            color="success"
            size="large"
          >
            <ion-icon slot="start" :icon="playOutline" />
            {{ $t('auto.fortsetzen') }}
          </ion-button>

          <ion-button
            @click="stopRecording"
            expand="block"
            color="danger"
            size="large"
          >
            <ion-icon slot="start" :icon="stopOutline" />
            {{ $t('auto.aufzeichnung_beenden') }}
          </ion-button>
        </template>
      </div>
    </ion-content>
  </ion-page>
</template>

<!-- Diese Datei wurde durch RouteDetailPage.vue ersetzt. Siehe Routing und Komponenten-Importe. -->
<script setup lang="ts">
// Leere Weiterleitungsdatei, um alte Importe/Verweise abzufangen.
// Bitte RouteDetailPage.vue verwenden!
</script>
<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="danger">
        <ion-title>RouteRecordPage entfernt</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <p>Diese Seite wurde durch <b>RouteDetailPage.vue</b> ersetzt.<br>
      Bitte alle Verweise anpassen.</p>
    </ion-content>
  </ion-page>
</template>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useRoute, useRouter } from 'vue-router';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonIcon,
  alertController,
  toastController
} from '@ionic/vue';
import {
  arrowBackOutline,
  addOutline,
  navigateOutline,
  timeOutline,
  speedometerOutline,
  playOutline,
  pauseOutline,
  stopOutline
} from 'ionicons/icons';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { db, type Route, type Waypoint } from '@/services/database';
import { useRouteTracking } from '@/composables/useRouteTracking';
import { usePhoto } from '@/composables/usePhoto';

const route = useRoute();
const router = useRouter();
const routeId = Number(route.params.id);
const routeData = ref<Route | null>(null);

const {
  isTracking,
  isPaused,
  currentPosition,
  distance,
  duration,
  waypoints,
  startTracking,
  pauseTracking,
  resumeTracking,
  stopTracking,
  addManualWaypoint,
  addPhotoWaypoint
} = useRouteTracking();

const { takePhoto, savePhoto } = usePhoto();
// Handler für Foto-Wegpunkt
const addPhotoWaypointHandler = async () => {
  try {
    const image = await takePhoto();
    if (!image || !image.webPath) return;

    // Foto speichern (in Galerie 0, da Route-Fotos nicht in Galerie gelistet werden müssen)
    const photoId = await savePhoto(image.webPath, 0);
    if (!photoId) return;

    await addPhotoWaypoint(photoId);

    const toast = await toastController.create({
      message: 'Foto-Wegpunkt hinzugefügt',
      duration: 2000,
      color: 'success'
    });
    await toast.present();
  } catch (e) {
    const toast = await toastController.create({
      message: 'Fehler beim Foto-Wegpunkt',
      duration: 2000,
      color: 'danger'
    });
    await toast.present();
  }
};

let map: L.Map | null = null;
let routeLine: L.Polyline | null = null;
let currentMarker: L.Marker | null = null;
const waypointMarkers: L.Marker[] = [];

onMounted(async () => {
  // Load route data
  routeData.value = await db.getRoute(routeId);
  
  if (!routeData.value) {
    const toast = await toastController.create({
      message: 'Route nicht gefunden',
      duration: 2000,
      color: 'danger'
    });
    await toast.present();
    router.back();
    return;
  }

  // Initialize map
  initMap();

  // Auto-start if route is recording
  if (routeData.value.isRecording) {
    await startRecording();
  }
});

onUnmounted(() => {
  if (map) {
    map.remove();
    map = null;
  }
});

// Watch for position updates to update map
watch(currentPosition, (newPos) => {
  if (!newPos || !map) return;

  const latlng = L.latLng(newPos.coords.latitude, newPos.coords.longitude);

  // Update current position marker
  if (!currentMarker) {
    currentMarker = L.marker(latlng, {
      icon: L.divIcon({
        className: 'current-position-marker',
        html: '<div class="pulse"></div>',
        iconSize: [20, 20]
      })
    }).addTo(map);
  } else {
    currentMarker.setLatLng(latlng);
  }

  // Center map on current position
  map.setView(latlng, map.getZoom());
});

// Watch for new waypoints to draw route line
watch(waypoints, (newWaypoints) => {
  if (!map || newWaypoints.length === 0) return;

  const latlngs = newWaypoints
    .filter((wp: Waypoint) => wp.type === 'position')
    .map((wp: Waypoint) => L.latLng(wp.latitude, wp.longitude));

  if (!routeLine) {
    routeLine = L.polyline(latlngs, {
      color: '#3880ff',
      weight: 4,
      opacity: 0.7
    });
    if (map) {
      routeLine.addTo(map);
    }
  } else {
    routeLine.setLatLngs(latlngs);
  }

  // Add markers for manual/photo waypoints
  newWaypoints
    .filter((wp: Waypoint) => wp.type === 'manual' || wp.type === 'photo')
    .forEach((wp: Waypoint) => {
      if (waypointMarkers.some(m => m.getLatLng().lat === wp.latitude && m.getLatLng().lng === wp.longitude)) {
        return; // Already added
      }

      let html = '';
      if (wp.type === 'manual') {
        html = '<ion-icon name="location-sharp" style="color:#3880ff;font-size:32px;"></ion-icon>';
      } else if (wp.type === 'photo') {
        html = '<ion-icon name="camera" style="color:#222;font-size:32px;"></ion-icon>';
      }

      const marker = L.marker([wp.latitude, wp.longitude], {
        icon: L.divIcon({
          className: `waypoint-marker waypoint-${wp.type}`,
          html,
          iconSize: [32, 32]
        })
      });

      if (map) {
        marker.addTo(map);
      }

      // Popup: Name oder Foto-Thumbnail
      if (wp.type === 'photo' && wp.photoId) {
        // Lade Foto aus DB (async, aber hier reicht ein einfaches fetch)
        db.getPhoto(wp.photoId).then(photo => {
          if (photo && (photo.thumbnail || photo.filepath)) {
            const imgSrc = photo.thumbnail || photo.filepath;
            marker.bindPopup(`<img src="${imgSrc}" style="max-width:120px;max-height:120px;border-radius:8px;box-shadow:0 2px 8px #0002;" />`);
          } else {
            marker.bindPopup('Foto');
          }
        });
      } else if (wp.name) {
        marker.bindPopup(wp.name);
      }

      waypointMarkers.push(marker);
    });
}, { deep: true });

const initMap = () => {
  map = L.map('route-map', {
    zoomControl: true,
    attributionControl: false
  }).setView([48.137154, 11.576124], 13); // Default: Munich

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(map);

  // Try to get current location for initial view
  navigator.geolocation.getCurrentPosition((position) => {
    if (map) {
      map.setView([position.coords.latitude, position.coords.longitude], 15);
    }
  });
};

const startRecording = async () => {
  try {
    const mode = routeData.value?.travelMode ?? 'car';
    await startTracking(routeId, mode);
    const toast = await toastController.create({
      message: 'Aufzeichnung gestartet',
      duration: 2000,
      color: 'success'
    });
    await toast.present();
  } catch (error) {
    console.error('Error starting recording:', error);
    const toast = await toastController.create({
      message: 'Fehler beim Starten der Aufzeichnung',
      duration: 2000,
      color: 'danger'
    });
    await toast.present();
  }
};

const pauseRecording = () => {
  pauseTracking();
};

const resumeRecording = () => {
  resumeTracking();
};

const stopRecording = async () => {
  const alert = await alertController.create({
    header: 'Aufzeichnung beenden',
    message: 'Möchtest du die Aufzeichnung wirklich beenden?',
    buttons: [
      {
        text: 'Abbrechen',
        role: 'cancel'
      },
      {
        text: 'Beenden',
        role: 'confirm',
        handler: async () => {
          await stopTracking();
          const toast = await toastController.create({
            message: 'Aufzeichnung beendet',
            duration: 2000,
            color: 'success'
          });
          await toast.present();
          router.push(`/routes/${routeId}`);
        }
      }
    ]
  });
  await alert.present();
};

const addWaypointDialog = async () => {
  const alert = await alertController.create({
    header: 'Wegpunkt hinzufügen',
    inputs: [
      {
        name: 'name',
        type: 'text',
        placeholder: 'Name',
      },
      {
        name: 'description',
        type: 'textarea',
        placeholder: 'Beschreibung (optional)'
      }
    ],
    buttons: [
      {
        text: 'Abbrechen',
        role: 'cancel'
      },
      {
        text: 'Hinzufügen',
        handler: async (data) => {
          if (data.name) {
            await addManualWaypoint(data.name, data.description);
            const toast = await toastController.create({
              message: 'Wegpunkt hinzugefügt',
              duration: 2000,
              color: 'success'
            });
            await toast.present();
          }
        }
      }
    ]
  });
  await alert.present();
};

const handleBack = async () => {
  if (isTracking.value && !isPaused.value) {
    const alert = await alertController.create({
      header: 'Aufzeichnung läuft',
      message: 'Die Aufzeichnung läuft noch. Möchtest du sie wirklich verlassen?',
      buttons: [
        {
          text: 'Abbrechen',
          role: 'cancel'
        },
        {
          text: 'Verlassen',
          handler: () => {
            router.back();
          }
        }
      ]
    });
    await alert.present();
  } else {
    router.back();
  }
};

const formatDistance = (meters: number): string => {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
};

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
};

const formatSpeed = (metersPerSecond: number): string => {
  const kmh = metersPerSecond * 3.6;
  return `${kmh.toFixed(1)} km/h`;
};


onMounted(async () => {
  await StatusBar.setOverlaysWebView({ overlay: false });
  await StatusBar.setStyle({ style: Style.Dark });
});
</script>

<style scoped>
ion-content {
  display: flex;
  flex-direction: column;
}

.map-container {
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
  padding-bottom: calc(env(safe-area-inset-bottom) + 8px);
  box-sizing: border-box;
  position: relative;
  z-index: 1;
}

.stats-overlay {
  position: absolute;
  top: 20px;
  left: 16px;
  right: 16px;
  display: flex;
  gap: 8px;
  z-index: 1000;
}

.stat-card {
  flex: 1;
  background: var(--ion-background-color);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.stat-card ion-icon {
  font-size: 24px;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--ion-text-color);
  line-height: 1.2;
}

.stat-label {
  font-size: 11px;
  color: var(--ion-color-medium);
  text-transform: uppercase;
}

.control-buttons {
  position: absolute;
  bottom: 20px;
  left: 16px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 1000;
}

.control-buttons ion-button {
  --border-radius: 12px;
  --box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  font-weight: 600;
}
</style>

<style>
/* Global styles for Leaflet markers */
.current-position-marker {
  background: transparent;
  border: none;
}

.pulse {
  width: 20px;
  height: 20px;
  background: #3880ff;
  border: 3px solid white;
  border-radius: 50%;
  box-shadow: 0 0 0 0 rgba(56, 128, 255, 1);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(56, 128, 255, 0.7);
  }
  70% {
    box-shadow: 0 0 0 20px rgba(56, 128, 255, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(56, 128, 255, 0);
  }
}

.waypoint-marker {
  background: white;
  border: 2px solid #3880ff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.waypoint-marker ion-icon {
  font-size: 18px;
  color: #3880ff;
}

.waypoint-photo {
  border-color: #eb445a;
}

.waypoint-photo ion-icon {
  color: #eb445a;
}
</style>
