<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="router.back()">
            <ion-icon :icon="arrowBackOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ routeData?.name || 'Route' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="showOptionsMenu">
            <ion-icon :icon="ellipsisVerticalOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div v-if="isLoading" class="loading-container">
        <ion-spinner name="crescent" />
      </div>

      <template v-else-if="routeData">
        <!-- Map Container -->
        <div id="detail-map" class="map-container"></div>

        <!-- Route Info Card -->
        <div class="info-card">
          <div class="info-header">
            <h2>{{ routeData.name }}</h2>
            <p v-if="routeData.description" class="description">{{ routeData.description }}</p>
          </div>

          <div class="info-stats">
            <div class="stat">
              <ion-icon :icon="navigateOutline" color="primary" />
              <div>
                <div class="stat-value">{{ formatDistance(routeData.distance || 0) }}</div>
                <div class="stat-label">Distanz</div>
              </div>
            </div>

            <div class="stat">
              <ion-icon :icon="timeOutline" color="success" />
              <div>
                <div class="stat-value">{{ formatDuration(routeData.duration || 0) }}</div>
                <div class="stat-label">Dauer</div>
              </div>
            </div>

            <div class="stat">
              <ion-icon :icon="flagOutline" color="warning" />
              <div>
                <div class="stat-value">{{ waypoints.length }}</div>
                <div class="stat-label">Wegpunkte</div>
              </div>
            </div>
          </div>

          <div class="info-meta">
            <p>
              <strong>Gestartet:</strong> {{ formatDateTime(routeData.startTime) }}
            </p>
            <p v-if="routeData.endTime">
              <strong>Beendet:</strong> {{ formatDateTime(routeData.endTime) }}
            </p>
          </div>
        </div>

        <!-- Waypoints List -->
        <div v-if="waypoints.length > 0" class="waypoints-section">
          <h3>Wegpunkte</h3>
          <ion-list>
            <ion-item
              v-for="(waypoint, index) in manualWaypoints"
              :key="waypoint.id"
              @click="centerOnWaypoint(waypoint)"
              button
            >
              <ion-icon
                slot="start"
                :icon="getWaypointIcon(waypoint.type)"
                :color="getWaypointColor(waypoint.type)"
              />
              <ion-label>
                <h3>{{ waypoint.name || `Wegpunkt ${index + 1}` }}</h3>
                <p v-if="waypoint.description">{{ waypoint.description }}</p>
                <p class="waypoint-time">{{ formatTime(waypoint.timestamp) }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </div>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
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
  IonList,
  IonItem,
  IonLabel,
  IonSpinner,
  actionSheetController,
  alertController,
  toastController
} from '@ionic/vue';
import {
  arrowBackOutline,
  ellipsisVerticalOutline,
  navigateOutline,
  timeOutline,
  flagOutline,
  cameraOutline,
  locationOutline,
  trashOutline,
  createOutline
} from 'ionicons/icons';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { db, type Route as RouteData, type Waypoint } from '@/services/database';

const vueRoute = useRoute();
const router = useRouter();
const routeId = Number(vueRoute.params.id);
const routeData = ref<RouteData | null>(null);
const waypoints = ref<Waypoint[]>([]);
const isLoading = ref(true);

let map: L.Map | null = null;
let routeLine: L.Polyline | null = null;
const waypointMarkers: Map<number, L.Marker> = new Map();

// Filter only manual and photo waypoints for list
const manualWaypoints = computed(() =>
  waypoints.value.filter(wp => wp.type === 'manual' || wp.type === 'photo' || wp.type === 'video')
);

onMounted(async () => {
  await loadData();
  initMap();
});

onUnmounted(() => {
  if (map) {
    map.remove();
    map = null;
  }
});

const loadData = async () => {
  try {
    isLoading.value = true;
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

    waypoints.value = await db.getWaypointsByRoute(routeId);
  } catch (error) {
    console.error('Error loading route:', error);
  } finally {
    isLoading.value = false;
  }
};

const initMap = () => {
  setTimeout(() => {
    map = L.map('detail-map', {
      zoomControl: true,
      attributionControl: false
    }).setView([48.137154, 11.576124], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    // Draw route and waypoints
    drawRoute();
  }, 100);
};

const drawRoute = () => {
  if (!map || waypoints.value.length === 0) return;

  // Draw route line from position waypoints
  const positionWaypoints = waypoints.value.filter(wp => wp.type === 'position');
  if (positionWaypoints.length > 0) {
    const latlngs = positionWaypoints.map(wp => L.latLng(wp.latitude, wp.longitude));
    
    routeLine = L.polyline(latlngs, {
      color: '#3880ff',
      weight: 4,
      opacity: 0.7
    }).addTo(map);

    // Fit map to route bounds
    map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
  }

  // Add markers for all waypoints
  waypoints.value.forEach(waypoint => {
    let iconHtml = '';
    let className = '';

    switch (waypoint.type) {
      case 'photo':
        iconHtml = '<ion-icon name="camera"></ion-icon>';
        className = 'waypoint-marker waypoint-photo';
        break;
      case 'video':
        iconHtml = '<ion-icon name="videocam"></ion-icon>';
        className = 'waypoint-marker waypoint-video';
        break;
      case 'manual':
        iconHtml = '<ion-icon name="flag"></ion-icon>';
        className = 'waypoint-marker waypoint-manual';
        break;
      default:
        return; // Don't show position waypoints as individual markers
    }

    const marker = L.marker([waypoint.latitude, waypoint.longitude], {
      icon: L.divIcon({
        className,
        html: iconHtml,
        iconSize: [30, 30]
      })
    });
    
    if (map) {
      marker.addTo(map);
    }

    if (waypoint.name) {
      marker.bindPopup(waypoint.name);
    }

    if (waypoint.id) {
      waypointMarkers.set(waypoint.id, marker);
    }
  });
};

const centerOnWaypoint = (waypoint: Waypoint) => {
  if (!map) return;
  
  map.setView([waypoint.latitude, waypoint.longitude], 16);
  
  if (waypoint.id && waypointMarkers.has(waypoint.id)) {
    waypointMarkers.get(waypoint.id)?.openPopup();
  }
};

const showOptionsMenu = async () => {
  const actionSheet = await actionSheetController.create({
    header: 'Route Optionen',
    buttons: [
      {
        text: 'Bearbeiten',
        icon: createOutline,
        handler: () => {
          editRoute();
        }
      },
      {
        text: 'Löschen',
        icon: trashOutline,
        role: 'destructive',
        handler: () => {
          deleteRoute();
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

const editRoute = async () => {
  if (!routeData.value) return;

  const alert = await alertController.create({
    header: 'Route bearbeiten',
    inputs: [
      {
        name: 'name',
        type: 'text',
        placeholder: 'Name',
        value: routeData.value.name
      },
      {
        name: 'description',
        type: 'textarea',
        placeholder: 'Beschreibung',
        value: routeData.value.description || ''
      }
    ],
    buttons: [
      {
        text: 'Abbrechen',
        role: 'cancel'
      },
      {
        text: 'Speichern',
        handler: async (data) => {
          if (data.name) {
            await db.updateRoute(routeId, {
              name: data.name,
              description: data.description
            });
            await loadData();
            const toast = await toastController.create({
              message: 'Route aktualisiert',
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

const deleteRoute = async () => {
  const alert = await alertController.create({
    header: 'Route löschen',
    message: 'Möchtest du diese Route wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.',
    buttons: [
      {
        text: 'Abbrechen',
        role: 'cancel'
      },
      {
        text: 'Löschen',
        role: 'destructive',
        handler: async () => {
          await db.deleteRoute(routeId);
          const toast = await toastController.create({
            message: 'Route gelöscht',
            duration: 2000,
            color: 'success'
          });
          await toast.present();
          router.push('/routes');
        }
      }
    ]
  });
  await alert.present();
};

const getWaypointIcon = (type: string) => {
  switch (type) {
    case 'photo':
    case 'video':
      return cameraOutline;
    case 'manual':
      return flagOutline;
    default:
      return locationOutline;
  }
};

const getWaypointColor = (type: string) => {
  switch (type) {
    case 'photo':
    case 'video':
      return 'danger';
    case 'manual':
      return 'warning';
    default:
      return 'primary';
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
  
  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  return `${minutes} min`;
};

const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit'
  });
};
</script>

<style scoped>
.loading-container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.map-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 50%;
  z-index: 1;
}

.info-card {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--ion-background-color);
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  padding: 20px;
  overflow-y: auto;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
}

.info-header {
  margin-bottom: 20px;
}

.info-header h2 {
  margin: 0 0 8px 0;
  color: var(--ion-text-color);
  font-size: 24px;
  font-weight: 600;
}

.description {
  margin: 0;
  color: var(--ion-color-medium);
  font-size: 14px;
}

.info-stats {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.stat {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--ion-color-light);
  border-radius: 12px;
}

.stat ion-icon {
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

.info-meta {
  padding: 16px;
  background: var(--ion-color-light);
  border-radius: 12px;
  margin-bottom: 20px;
}

.info-meta p {
  margin: 4px 0;
  font-size: 14px;
  color: var(--ion-text-color);
}

.waypoints-section {
  margin-top: 20px;
}

.waypoints-section h3 {
  margin: 0 0 12px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--ion-text-color);
}

.waypoint-time {
  font-size: 12px;
  color: var(--ion-color-medium);
  margin-top: 4px;
}
</style>

<style>
/* Global styles for waypoint markers */
.waypoint-marker {
  background: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.waypoint-marker ion-icon {
  font-size: 18px;
}

.waypoint-photo {
  border: 2px solid #eb445a;
}

.waypoint-photo ion-icon {
  color: #eb445a;
}

.waypoint-video {
  border: 2px solid #c084fc;
}

.waypoint-video ion-icon {
  color: #c084fc;
}

.waypoint-manual {
  border: 2px solid #ffc409;
}

.waypoint-manual ion-icon {
  color: #ffc409;
}
</style>
