<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons>
          <ion-button slot="start" @click="router.back()">
            <ion-icon :icon="arrowBackOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ routeData?.name || 'Route' }}</ion-title>
        <ion-buttons>
          <ion-button slot="end" @click="showOptionsMenu">
            <ion-icon :icon="ellipsisVerticalOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content :fullscreen="true">
      <div v-if="isLoading" class="loading-container">
        <ion-spinner name="crescent" />
      </div>
      <div v-else style="position:relative; height:100%; min-height:400px;">
        <!-- Karte -->
        <div id="detail-map" class="map-container" style="height: 50vh; min-height: 250px;"></div>

        <!-- Info-Card -->
        <div class="info-card">
          <div class="info-header">
            <h2>{{ routeData?.name || 'Route' }}</h2>
            <p class="description" v-if="routeData?.description">{{ routeData.description }}</p>
          </div>
          <div class="stats-grid">
            <div class="stat">
              <ion-icon :icon="timeOutline" />
              <div>
                <div class="stat-value">{{ displayDuration }}</div>
                <div class="stat-label">Dauer</div>
              </div>
            </div>
            <div class="stat">
              <ion-icon :icon="navigateOutline" />
              <div>
                <div class="stat-value">{{ routeData?.distance ? formatDistance(routeData.distance) : '-' }}</div>
                <div class="stat-label">Distanz</div>
              </div>
            </div>
            <div class="stat">
              <ion-icon :icon="flagOutline" />
              <div>
                <div class="stat-value">{{ waypoints.length }}</div>
                <div class="stat-label">Wegpunkte</div>
              </div>
            </div>
          </div>

          <!-- Meta-Infos -->
          <div class="info-meta">
            <p><strong>Start:</strong> {{ routeData?.startTime ? formatDateTime(routeData.startTime) : '-' }}</p>
            <p v-if="routeData?.endTime"><strong>Ende:</strong> {{ formatDateTime(routeData.endTime) }}</p>
            <p><strong>Status:</strong> <span :style="{color: routeData?.isRecording ? '#3880ff' : '#eb445a'}">{{ routeData?.isRecording ? 'Aufzeichnung läuft' : 'Beendet' }}</span></p>
          </div>

          <!-- Aufzeichnungs-Controls -->
          <div style="display:flex; gap:6px; margin-bottom:16px;">
            <ion-button v-if="routeData?.isRecording" color="warning" @click="pauseRecording">Pause</ion-button>
            <ion-button v-if="!routeData?.isRecording && !routeData?.endTime" color="success" @click="resumeRecording">Fortsetzen</ion-button>
            <ion-button v-if="routeData?.isRecording" color="danger" @click="stopRecording">Stop</ion-button>
            <ion-button v-if="routeData && !routeData.endTime" color="primary" @click="addManualWaypoint">
              <ion-icon :icon="flagOutline" slot="start" /> Wegpunkt
            </ion-button>
            <ion-button v-if="routeData && !routeData.endTime" color="tertiary" @click="addPhotoWaypoint">
              <ion-icon :icon="cameraOutline" slot="start" /> Foto
            </ion-button>
          </div>

          <!-- Wegpunkt-Liste -->
          <div class="waypoints-section">
            <h3>Wegpunkte</h3>
            <ion-list v-if="manualWaypoints.length > 0">
              <ion-item v-for="wp in manualWaypoints" :key="wp.id" @click="centerOnWaypoint(wp)">
                <ion-icon :icon="getWaypointIcon(wp.type)" :color="getWaypointColor(wp.type)" slot="start" />
                <ion-label>
                  <div style="font-weight:600;">{{ wp.name || 'Wegpunkt' }}</div>
                  <div v-if="wp.description" style="font-size:13px; color:var(--ion-color-medium);">{{ wp.description }}</div>
                  <div class="waypoint-time">{{ formatTime(wp.timestamp) }}</div>
                </ion-label>
                <ion-button fill="clear" color="medium" slot="end" @click.stop="openEditModal(wp)">
                  <ion-icon :icon="createOutline" />
                </ion-button>
                <ion-button fill="clear" color="danger" slot="end" @click.stop="deleteWaypoint">
                  <ion-icon :icon="trashOutline" />
                </ion-button>
              </ion-item>
            </ion-list>
            <div v-else style="color:var(--ion-color-medium); font-size:14px;">Keine manuellen oder Foto-Wegpunkte vorhanden.</div>
          </div>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">

import { ref, watch, watchEffect, computed, onMounted, onUnmounted } from 'vue';

const displayDuration = ref('');
watchEffect(() => {
  if (!routeData.value) {
    displayDuration.value = '';
    return;
  }
  // 1. Wenn Route beendet (endTime): Differenz startTime - endTime
  if (routeData.value.endTime) {
    const start = new Date(routeData.value.startTime).getTime();
    const end = new Date(routeData.value.endTime).getTime();
    if (!isNaN(start) && !isNaN(end) && end > start) {
      const seconds = Math.floor((end - start) / 1000);
      displayDuration.value = formatDuration(seconds);
      return;
    }
  }
  // 2. Wenn explizite Dauer vorhanden (z.B. nach Sync)
  if (routeData.value.duration && routeData.value.duration > 0) {
    displayDuration.value = formatDuration(routeData.value.duration);
    return;
  }
  // 3. Laufende Aufzeichnung: Zeit seit Start
  if (routeData.value.startTime) {
    const start = new Date(routeData.value.startTime).getTime();
    const now = Date.now();
    if (!isNaN(start) && now > start) {
      const seconds = Math.floor((now - start) / 1000);
      displayDuration.value = formatDuration(seconds);
      return;
    }
  }
  displayDuration.value = formatDuration(0);
});
import * as WaypointEditModal from '@/components/WaypointEditModal.vue';

const editModalOpen = ref(false);
const editWaypoint = ref<Waypoint|null>(null);

function openEditModal(waypoint: Waypoint) {
  editWaypoint.value = waypoint;
  editModalOpen.value = true;
}
function closeEditModal() {
  editModalOpen.value = false;
  editWaypoint.value = null;
}
async function saveWaypointEdit({ name, description }: { name: string; description: string }) {
  if (!editWaypoint.value || typeof editWaypoint.value.id !== 'number') return;
  await db.updateWaypoint(editWaypoint.value.id, { name, description });
  await loadData();
  closeEditModal();
}
async function deleteWaypoint() {
  if (!editWaypoint.value || typeof editWaypoint.value.id !== 'number') return;
  await db.deleteWaypoint(editWaypoint.value.id);
  await loadData();
  closeEditModal();
}
// --- Manuellen Wegpunkt hinzufügen ---
function addManualWaypoint() {
  return addManualWaypointImpl();
}
const addManualWaypointImpl = async () => {
  try {
    const position = await Geolocation.getCurrentPosition();
    await db.createWaypoint({
      routeId,
      type: 'manual',
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      name: 'Manueller Wegpunkt',
      description: '',
      timestamp: new Date().toISOString()
    });
    await loadData();
    drawRoute();
    const toast = await toastController.create({
      message: 'Manueller Wegpunkt hinzugefügt',
      duration: 1500,
      color: 'success'
    });
    await toast.present();
  } catch (err) {
    const toast = await toastController.create({
      message: 'Manueller Wegpunkt fehlgeschlagen',
      duration: 1500,
      color: 'danger'
    });
    await toast.present();
  }
};
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';

// --- Aufzeichnung pausieren ---
const pauseRecording = async () => {
  await db.updateRoute(routeId, { isRecording: false });
  await loadData();
  const toast = await toastController.create({
    message: 'Aufzeichnung pausiert',
    duration: 1500,
    color: 'warning'
  });
  await toast.present();
};

// --- Aufzeichnungssteuerung ---
const resumeRecording = async () => {
  await db.updateRoute(routeId, { isRecording: true });
  await loadData();
  const toast = await toastController.create({
    message: 'Aufzeichnung fortgesetzt',
    duration: 1500,
    color: 'success'
  });
  await toast.present();
};

function stopRecording() {
  return stopRecordingImpl();
}
const stopRecordingImpl = async () => {
  // Hole aktuelle Route für startTime
  const route = await db.getRoute(routeId);
  const endTime = new Date().toISOString();
  let duration = undefined;
  if (route && route.startTime) {
    const start = new Date(route.startTime).getTime();
    const end = new Date(endTime).getTime();
    if (!isNaN(start) && !isNaN(end) && end > start) {
      duration = Math.floor((end - start) / 1000);
    }
  }
  await db.updateRoute(routeId, { isRecording: false, endTime, duration });
  await loadData();
  const toast = await toastController.create({
    message: 'Aufzeichnung beendet',
    duration: 1500,
    color: 'danger'
  });
  await toast.present();
};

// --- Foto-Wegpunkt hinzufügen ---
function addPhotoWaypoint() {
  return addPhotoWaypointImpl();
}
const addPhotoWaypointImpl = async () => {
  try {
    const position = await Geolocation.getCurrentPosition();
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.Base64,
      source: CameraSource.Camera,
      quality: 70
    });
    // Foto als Gallery-Photo speichern (Dummy-GalleryId 1, oder eigene Logik)
    const photoId = await db.createPhoto({
      galleryId: 1, // ggf. eigene Logik für GalleryId
      filename: `route-photo-${Date.now()}.jpg`,
      filepath: `data:image/jpeg;base64,${photo.base64String}`,
      thumbnail: photo.base64String,
      mimeType: photo.format ? `image/${photo.format}` : 'image/jpeg',
      latitude: position.coords.latitude,
      longitude: position.coords.longitude
    });
    // Wegpunkt anlegen
    await db.createWaypoint({
      routeId,
      type: 'photo',
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      name: 'Foto-Wegpunkt',
      description: '',
      photoId,
      timestamp: new Date().toISOString()
    });
    await loadData();
    drawRoute();
    const toast = await toastController.create({
      message: 'Foto-Wegpunkt hinzugefügt',
      duration: 1500,
      color: 'success'
    });
    await toast.present();
  } catch (err) {
    const toast = await toastController.create({
      message: 'Foto-Wegpunkt fehlgeschlagen',
      duration: 1500,
      color: 'danger'
    });
    await toast.present();
  }
};
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
  createOutline,
  playOutline
} from 'ionicons/icons';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { db } from '@/services/database';
type RouteData = import('@/services/database').Route;
type Waypoint = import('@/services/database').Waypoint;

const vueRoute = useRoute();
const router = useRouter();
const routeId = Number(vueRoute.params.id);
const routeData = ref<RouteData | null>(null);
const waypoints = ref<Waypoint[]>([]);
const isLoading = ref(true);

let map: L.Map | null = null;
let routeLine: L.Polyline | null = null;
const waypointMarkers: Map<number, L.Marker> = new Map();
// ...existing code...
// Filter only manual and photo waypoints for list
const manualWaypoints = computed(() =>
  waypoints.value.filter(wp => wp.type === 'manual' || wp.type === 'photo' || wp.type === 'video')
);

onMounted(async () => {
  await loadData();
  initMap();
});

// Map-Redraw bei Datenänderung
watch(waypoints, () => {
  drawRoute();
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
    const route = await db.getRoute(routeId);
    if (!route) {
      const toast = await toastController.create({
        message: 'Route nicht gefunden',
        duration: 2000,
        color: 'danger'
      });
      await toast.present();
      router.back();
      return;
    }
    // Robust: isRecording immer Boolean
    route.isRecording = !!route.isRecording;
    routeData.value = route;
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
  if (!map) return;

  // Entferne alte Polyline
  if (routeLine) {
    map.removeLayer(routeLine);
    routeLine = null;
  }
  // Entferne alte Marker
  waypointMarkers.forEach(marker => {
    if (map) map.removeLayer(marker);
  });
  waypointMarkers.clear();

  if (waypoints.value.length === 0) return;

  // Route-Polyline aus Positions-Wegpunkten
  const positionWaypoints = waypoints.value.filter(wp => wp.type === 'position');
  if (positionWaypoints.length > 0) {
    const latlngs = positionWaypoints.map(wp => L.latLng(wp.latitude, wp.longitude));
    routeLine = L.polyline(latlngs, {
      color: '#3880ff',
      weight: 4,
      opacity: 0.7
    }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
  } else {
    // Kein Track: Karte auf ersten manuellen Wegpunkt zentrieren
    const manual = waypoints.value.find(wp => wp.type === 'manual');
    if (manual) map.setView([manual.latitude, manual.longitude], 15);
  }

  // Marker für manuelle, Foto- und Video-Wegpunkte
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
        // Pin-Icon als SVG (statt Kreis/Flagge)
        iconHtml = `<svg width="24" height="32" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C6.477 0 2 4.477 2 10c0 7.732 8.06 20.03 8.406 20.53a1 1 0 0 0 1.188 0C13.94 30.03 22 17.732 22 10c0-5.523-4.477-10-10-10zm0 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" fill="#ffc409" stroke="#222" stroke-width="1.5"/></svg>`;
        className = 'waypoint-marker waypoint-manual';
        break;
      default:
        return; // Positions-Wegpunkte nur als Linie
    }
    const marker = L.marker([waypoint.latitude, waypoint.longitude], {
      icon: L.divIcon({
        className,
        html: iconHtml,
        iconSize: [30, 30]
      })
    });
    // Popup mit Name, Beschreibung, Zeit
    let popup = `<strong>${waypoint.name || 'Wegpunkt'}</strong>`;
    if (waypoint.description) popup += `<br>${waypoint.description}`;
    if (waypoint.timestamp) popup += `<br><span style='font-size:11px;color:#888;'>${formatTime(waypoint.timestamp)}</span>`;
    marker.bindPopup(popup);
    if (map) marker.addTo(map);
    if (waypoint.id) waypointMarkers.set(waypoint.id, marker);
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
  z-index: 10;
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
          .stats-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 12px;
            width: 100%;
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
  /* nur CSS, kein Script! */
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
