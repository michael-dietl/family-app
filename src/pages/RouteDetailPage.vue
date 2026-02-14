<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <template #start>
          <ion-buttons>
            <ion-back-button default-href="router.back()" />
          </ion-buttons>
        </template>
        <ion-title>{{ routeData?.name || $t('auto.route') }}</ion-title>
        <template #end>
          <ion-buttons>
            <ion-button @click="showOptionsMenu">
              <ion-icon :icon="ellipsisVerticalOutline" />
            </ion-button>
          </ion-buttons>
        </template>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div v-if="isLoading" class="loading-container">
        <ion-spinner name="crescent" />
      </div>
      <div v-else style="position:relative; height:100%; min-height:400px;">
        <!-- Karte bleibt immer sichtbar -->
        <div id="detail-map" class="map-container" style="height: 50vh; min-height: 250px;"></div>

        <!-- Tabs immer sichtbar -->
        <div class="tabs-bar">
          <button
            :class="['tab-btn', {active: activeTab==='info'}]"
            @click="activeTab='info'"
          >{{$t('auto.info')}}</button>
          <button
            v-if="hasWaypointTab"
            :class="['tab-btn', {active: activeTab==='waypoints'}]"
            @click="activeTab='waypoints'"
          >{{$t('auto.wegpunkte')}}</button>
        </div>

        <!-- Info-Tab -->
        <div v-show="activeTab==='info'">
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
                  <div class="stat-label">{{$t('auto.dauer')}}</div>
                </div>
              </div>
              <div class="stat">
                <ion-icon :icon="navigateOutline" />
                <div>
                  <div class="stat-value">{{ liveDistance != null ? formatDistance(liveDistance) : '-' }}</div>
                  <div class="stat-label">{{$t('auto.distanz')}}</div>
                </div>
              </div>
              <div class="stat">
                <ion-icon :icon="flagOutline" />
                <div>
                  <div class="stat-value">{{ waypoints.length }}</div>
                  <div class="stat-label">{{$t('auto.wegpunkte')}}</div>
                </div>
              </div>
            </div>

            <!-- Meta-Infos -->
            <div class="info-meta">
              <p class="meta-row"><strong>{{$t('auto.start')}}</strong> {{ routeData?.startTime ? formatDateTime(routeData.startTime) : '-' }}</p>
              <p v-if="routeData?.endTime" class="meta-row"><strong>{{$t('auto.ende')}}</strong> {{ formatDateTime(routeData.endTime) }}</p>
              <div class="status-row">
                <p class="status-text"><strong>{{$t('auto.status')}}</strong>
                  <span :style="{color: routeData?.isRecording ? '#3880ff' : '#eb445a'}">{{ routeData?.isRecording ? $t('auto.aufzeichnung_läuft') : $t('auto.beendet_status') }}</span>
                </p>
                <div class="status-mode-chip">
                  <ion-icon :icon="routeModeIcon" :color="routeModeColor" />
                  <span>{{ routeModeLabel }}</span>
                </div>
              </div>
            </div>

            <!-- Aufzeichnungs-Controls -->
            <div class="route-controls">
              <div class="recording-status">
                <span class="recording-pulse" :class="{ active: routeData?.isRecording }"></span>
                <div class="status-text">
                  <p class="status-label">{{ recordingStatusLabel }}</p>
                  <p class="status-subtext">{{ displayDuration }}</p>
                </div>
              </div>
              <div class="control-buttons">
                <ion-button
                  v-if="routeData?.isRecording"
                  shape="round"
                  fill="outline"
                  class="route-action"
                  :aria-label="$t('auto.pausieren')"
                  @click="pauseRecording"
                  expand="block"
                >
                  <ion-icon slot="icon-only" :icon="pauseOutline" />
                </ion-button>
                <ion-button
                  v-else-if="routeData && !routeData.endTime"
                  shape="round"
                  fill="outline"
                  class="route-action"
                  :aria-label="$t('auto.fortsetzen')"
                  @click="resumeRecording"
                  expand="block"
                >
                  <ion-icon slot="icon-only" :icon="playOutline" />
                </ion-button>
                <ion-button
                  v-if="routeData?.isRecording"
                  shape="round"
                  fill="outline"
                  color="danger"
                  class="route-action"
                  :aria-label="$t('auto.aufzeichnung_beenden')"
                  @click="stopRecording"
                  expand="block"
                >
                  <ion-icon slot="icon-only" :icon="stopCircleOutline" />
                </ion-button>
                <ion-button
                  v-if="routeData && !routeData.endTime"
                  shape="round"
                  fill="outline"
                  class="route-action"
                  :aria-label="$t('auto.pin')"
                  @click="addManualWaypoint"
                  expand="block"
                >
                  <ion-icon slot="icon-only" :icon="flagOutline" />
                </ion-button>
                <ion-button
                  v-if="routeData && !routeData.endTime"
                  shape="round"
                  fill="outline"
                  class="route-action"
                  :aria-label="$t('auto.foto')"
                  @click="addPhotoWaypoint"
                  expand="block"
                >
                  <ion-icon slot="icon-only" :icon="cameraOutline" expand="block"/>
                </ion-button>
                <ion-button
                  shape="round"
                  fill="outline"
                  color="secondary"
                  class="route-action"
                  :disabled="valhallaMatching || !hasTrackPoints"
                  @click="sendRouteToValhalla"
                  expand="block"
                >
                  <ion-spinner v-if="valhallaMatching" slot="start" name="crescent" />
                  <ion-icon v-else slot="start" :icon="mapOutline" />
                  Valhalla abgleichen
                </ion-button>
              </div>
            </div>
          </div>
        </div>

        <!-- Wegpunkte-Tab -->
        <div v-if="hasWaypointTab" v-show="activeTab==='waypoints'">
          <div class="info-card">
            <div class="waypoints-section">
              <h3>{{$t('auto.wegpunkte')}}</h3>
              <ion-list lines="none">
                <ion-item
                  v-for="wp in waypointEntries"
                  :key="wp.id"
                  button
                  detail
                  @click="centerOnWaypoint(wp)"
                >
                  <template v-slot:start>
                    <div
                      v-if="wp.type === 'photo'"
                      class="waypoint-preview"
                      @click.stop="previewPhoto(wp)"
                    >
                      <img v-if="getWaypointPhotoSrc(wp)" :src="getWaypointPhotoSrc(wp)" alt="" />
                      <div v-else class="preview-placeholder">
                        <ion-icon :icon="cameraOutline" />
                      </div>
                    </div>
                    <ion-icon
                      v-else
                      :icon="getWaypointIcon(wp.type)"
                      :color="getWaypointColor(wp.type)"
                    />
                  </template>
                  <ion-label>
                    <div class="waypoint-title">{{ wp.name || getDefaultWaypointLabel(wp.type) }}</div>
                    <p v-if="wp.description" class="waypoint-description">{{ wp.description }}</p>
                    <p class="waypoint-time">{{ formatTime(wp.timestamp) }}</p>
                  </ion-label>
                  <ion-buttons slot="end" class="waypoint-action-group">
                    <ion-button
                      v-if="wp.type === 'manual'"
                      fill="clear"
                      color="medium"
                      size="small"
                      @click.stop="editWaypointInfo(wp)"
                    >
                      <ion-icon slot="icon-only" :icon="createOutline" />
                    </ion-button>
                    <ion-button
                      fill="clear"
                      color="danger"
                      size="small"
                      @click.stop="confirmDeleteWaypoint(wp)"
                    >
                      <ion-icon slot="icon-only" :icon="trashOutline" />
                    </ion-button>
                  </ion-buttons>
                </ion-item>
              </ion-list>
            </div>
          </div>
        </div>
      </div>
    </ion-content>
    <ion-modal :is-open="previewModalOpen" @didDismiss="closePhotoPreview" :backdrop-dismiss="true">
      <div class="photo-preview-modal">
        <div class="photo-preview-header">
          <div>
            <p class="modal-title">{{ previewWaypoint?.name || $t('auto.foto') }}</p>
            <p v-if="previewWaypoint?.timestamp" class="modal-subtitle">{{ formatDateTime(previewWaypoint.timestamp) }}</p>
          </div>
          <ion-button fill="clear" color="medium" @click="closePhotoPreview">
            <ion-icon :icon="closeOutline" />
          </ion-button>
        </div>
        <ion-img v-if="previewPhotoData?.filepath" :src="previewPhotoData.filepath" />
        <p v-else class="photo-preview-placeholder">{{ $t('auto.foto') }}</p>
      </div>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">

import { ref, watch, watchEffect, computed, onMounted, onUnmounted } from 'vue';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
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
  IonModal,
  IonImg,
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
  closeOutline,
  pauseOutline,
  playOutline,
  stopCircleOutline,
  mapOutline,
  carOutline,
  walkOutline
} from 'ionicons/icons';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { db } from '@/services/database';
import { useRouteTracking } from '@/composables/useRouteTracking';
import { matchPositionsWithValhalla } from '@/services/valhalla';
import { useI18n } from 'vue-i18n';
import type { LatLonPoint } from '@/services/positionSmoothing';

type RouteData = import('@/services/database').Route;
type Waypoint = import('@/services/database').Waypoint;
type Photo = import('@/services/database').Photo;

const vueRoute = useRoute();
const router = useRouter();
const routeId = Number(vueRoute.params.id);

const routeData = ref<RouteData | null>(null);
const isLoading = ref(true);
const waypoints = ref<Waypoint[]>([]);
const { t } = useI18n();
const hasLoadedOnce = ref(false);

const routeMode = computed(() =>
  routeData.value?.travelMode === 'pedestrian' ? 'pedestrian' : 'car'
);
const routeModeIcon = computed(() =>
  routeMode.value === 'pedestrian' ? walkOutline : carOutline
);
const routeModeColor = computed(() =>
  routeMode.value === 'pedestrian' ? 'medium' : 'primary'
);
const routeModeLabel = computed(() =>
  routeMode.value === 'pedestrian' ? 'Fußgänger' : 'Auto'
);

let map: L.Map | null = null;
let routeLine: L.Polyline | null = null;
let matchedLine: L.Polyline | null = null;
const waypointMarkers: Map<number, L.Marker> = new Map();
let currentPositionMarker: L.Marker | null = null;
let positionWatchInterval: number | null = null;

const startLiveTracking = async () => {
  if (!routeData.value?.isRecording || isTracking.value) return;
  try {
    await startTracking(routeId);
    await loadWaypoints(routeId);
  } catch (error) {
    console.error('Error starting live tracking:', error);
    const toast = await toastController.create({
      message: t('auto.fehler_beim_starten_der_aufzeichnung'),
      duration: 2000,
      color: 'danger'
    });
    await toast.present();
  }
};

const {
  isTracking,
  distance: trackingDistance,
  duration: trackingDuration,
  waypoints: trackingWaypoints,
  matchedPath,
  startTracking,
  pauseTracking,
  resumeTracking,
  stopTracking,
  loadWaypoints
} = useRouteTracking();

const activeTab = ref('info');
const previewModalOpen = ref(false);
const previewWaypoint = ref<Waypoint | null>(null);
const previewPhotoData = ref<Photo | null>(null);
const waypointPhotoCache = ref<Record<number, Photo>>({});

const waypointEntries = computed(() => {
  return [...waypoints.value]
    .filter(wp => wp.type === 'manual' || wp.type === 'photo')
    .sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime() || 0;
      const bTime = new Date(b.timestamp).getTime() || 0;
      return bTime - aTime;
    });
});

const hasWaypointTab = computed(() => waypointEntries.value.length > 0);

const valhallaTrace = ref<LatLonPoint[]>([]);
const valhallaMatching = ref(false);
const hasTrackPoints = computed(() =>
  waypoints.value.filter((wp) => wp.type === 'position').length >= 3
);

watch(hasWaypointTab, (visible) => {
  if (!visible && activeTab.value === 'waypoints') {
    activeTab.value = 'info';
  }
});

const displayDuration = ref('');
const liveDistance = computed(() => {
  if (routeData.value?.isRecording) {
    return trackingDistance.value;
  }
  return routeData.value?.distance ?? null;
});

watchEffect(() => {
  if (!routeData.value) {
    displayDuration.value = '';
    return;
  }
  if (routeData.value.isRecording) {
    displayDuration.value = formatDuration(trackingDuration.value || 0);
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
const recordingStatusLabel = computed(() => {
  if (routeData.value?.isRecording) {
    return t('auto.aufzeichnung_läuft');
  }
  if (routeData.value?.endTime) {
    return t('auto.beendet_status');
  }
  return t('auto.aufzeichnung_pausiert');
});

const sendRouteToValhalla = async () => {
  if (valhallaMatching.value) return;
  if (!hasTrackPoints.value) {
    const toast = await toastController.create({
      message: t('auto.valhalla_minimum_points'),
      duration: 2000,
      color: 'warning'
    });
    await toast.present();
    return;
  }

  const positionWaypoints = waypoints.value.filter((wp) => wp.type === 'position');
  const routePoints: LatLonPoint[] = positionWaypoints.map((wp) => {
    const point: LatLonPoint = { latitude: wp.latitude, longitude: wp.longitude };
    const parsed = Date.parse(wp.timestamp);
    if (!isNaN(parsed)) {
      point.timestamp = parsed;
    }
    return point;
  });

    if (routePoints.length < 3) {
      const toast = await toastController.create({
        message: t('auto.valhalla_not_enough_points'),
        duration: 2000,
        color: 'warning'
      });
    await toast.present();
    return;
  }

  valhallaMatching.value = true;
  try {
    const costing = routeData.value?.travelMode === 'pedestrian' ? 'pedestrian' : 'auto';
    const matched = await matchPositionsWithValhalla(routePoints, {
      id: routeId ? routeId.toString() : undefined,
      costing
    });
      if (matched.length < 3) {
        const toast = await toastController.create({
          message: t('auto.valhalla_no_shape'),
          duration: 2000,
          color: 'warning'
        });
        await toast.present();
        valhallaTrace.value = [];
        return;
      }
      valhallaTrace.value = matched;
      const routeMessage = hasSignificantDifference(routePoints, matched)
        ? t('auto.valhalla_route_loaded')
        : t('auto.valhalla_route_confirmed');
      const toast = await toastController.create({
        message: routeMessage,
        duration: 2000,
        color: 'success'
      });
      await toast.present();
  } catch (error) {
    console.error('Valhalla request failed', error);
    valhallaTrace.value = [];
    const toast = await toastController.create({
      message: 'Fehler beim Übertragen an Valhalla',
      duration: 2000,
      color: 'danger'
    });
    await toast.present();
  } finally {
    valhallaMatching.value = false;
  }
};

function hasSignificantDifference(original: LatLonPoint[], matched: LatLonPoint[]): boolean {
  if (matched.length < 3) return false;
  if (matched.length !== original.length) return true;
  const threshold = 1e-5;
  for (let i = 0; i < matched.length; i++) {
    const dx = Math.abs(matched[i].latitude - original[i].latitude);
    const dy = Math.abs(matched[i].longitude - original[i].longitude);
    if (dx > threshold || dy > threshold) {
      return true;
    }
  }
  return false;
}
// entfernt, da nicht genutzt

const getDefaultWaypointLabel = (type: Waypoint['type']) => {
  switch (type) {
    case 'photo':
      return t('auto.foto');
    case 'manual':
      return t('auto.wegpunkt');
    default:
      return t('auto.wegpunkt');
  }
};

const getWaypointPhotoSrc = (waypoint: Waypoint): string | undefined => {
  if (!waypoint.photoId) return undefined;
  const photo = waypointPhotoCache.value[waypoint.photoId];
  return photo?.thumbnail || photo?.filepath || undefined;
};

const editWaypointInfo = async (waypoint: Waypoint) => {
  if (!waypoint.id) return;
  const alert = await alertController.create({
    header: `${t('auto.wegpunkt')} ${t('auto.bearbeiten')}`,
    inputs: [
      {
        name: 'name',
        type: 'text',
        placeholder: t('auto.name'),
        value: waypoint.name || ''
      },
      {
        name: 'description',
        type: 'textarea',
        placeholder: t('auto.beschreibung'),
        value: waypoint.description || ''
      }
    ],
    buttons: [
      {
        text: t('auto.abbrechen'),
        role: 'cancel'
      },
      {
        text: t('auto.speichern'),
        handler: async (data) => {
          try {
            await db.updateWaypoint(waypoint.id!, {
              name: data.name,
              description: data.description
            });
            await loadData();
            const toast = await toastController.create({
              message: t('auto.wegpunkt_aktualisiert'),
              duration: 1500,
              color: 'success'
            });
            await toast.present();
          } catch (error) {
            const toast = await toastController.create({
              message: t('auto.wegpunkt_aktualisierung_fehlgeschlagen'),
              duration: 2000,
              color: 'danger'
            });
            await toast.present();
          }
        }
      }
    ]
  });
  await alert.present();
};

const confirmDeleteWaypoint = async (waypoint: Waypoint) => {
  if (!waypoint.id) return;
  const alert = await alertController.create({
    header: `${t('auto.wegpunkt')} ${t('auto.löschen')}`,
    message: t('auto.möchtest_du_diesen_wegpunkt_wirklich_löschen'),
    buttons: [
      {
        text: t('auto.abbrechen'),
        role: 'cancel'
      },
      {
        text: t('auto.löschen'),
        role: 'destructive',
        handler: async () => {
          try {
            await db.deleteWaypoint(waypoint.id!);
            await loadData();
            const toast = await toastController.create({
              message: t('auto.wegpunkt_geloescht'),
              duration: 1500,
              color: 'success'
            });
            await toast.present();
          } catch (error) {
            const toast = await toastController.create({
              message: t('auto.wegpunkt_konnte_nicht_geloescht_werden'),
              duration: 2000,
              color: 'danger'
            });
            await toast.present();
          }
        }
      }
    ]
  });
  await alert.present();
};

const previewPhoto = async (waypoint: Waypoint) => {
  if (!waypoint.photoId) return;
  previewWaypoint.value = waypoint;
  previewModalOpen.value = true;
  previewPhotoData.value = waypointPhotoCache.value[waypoint.photoId] || null;
  if (!previewPhotoData.value) {
    const photo = await db.getPhoto(waypoint.photoId);
    if (photo) {
      const cacheKey = photo.id ?? waypoint.photoId!;
      waypointPhotoCache.value = {
        ...waypointPhotoCache.value,
        [cacheKey]: photo
      };
      previewPhotoData.value = photo;
    }
  }
};

const closePhotoPreview = () => {
  previewModalOpen.value = false;
  previewWaypoint.value = null;
  previewPhotoData.value = null;
};

const preloadWaypointPhotos = async (list: Waypoint[]) => {
  const ids = Array.from(
    new Set(list.filter(wp => wp.photoId).map(wp => wp.photoId as number))
  ).filter(id => id && !waypointPhotoCache.value[id]);
  if (ids.length === 0) return;
  await Promise.all(ids.map(async (id) => {
    const photo = await db.getPhoto(id);
    if (photo) {
      const cacheKey = photo.id ?? id;
      waypointPhotoCache.value = {
        ...waypointPhotoCache.value,
        [cacheKey]: photo
      };
    }
  }));
};
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
      timestamp: new Date().toISOString(),
      updated: new Date().toISOString()
    });
    await loadData();
    setTimeout(() => drawRoute(), 100); // Fix: Karte bleibt sichtbar
    const toast = await toastController.create({
      message: t('auto.manueller_wegpunkt_hinzugefuegt'),
      duration: 1500,
      color: 'success'
    });
    await toast.present();
  } catch (err) {
    const toast = await toastController.create({
      message: t('auto.manueller_wegpunkt_fehlgeschlagen'),
      duration: 1500,
      color: 'danger'
    });
    await toast.present();
  }
};

// --- Aufzeichnung pausieren ---
const pauseRecording = async () => {
  pauseTracking();
  await db.updateRoute(routeId, { isRecording: false });
  await loadData();
  const toast = await toastController.create({
    message: t('auto.aufzeichnung_pausiert'),
    duration: 1500,
    color: 'warning'
  });
  await toast.present();
};

// --- Aufzeichnungssteuerung ---
const resumeRecording = async () => {
  resumeTracking();
  await db.updateRoute(routeId, { isRecording: true });
  await loadData();
  const toast = await toastController.create({
    message: t('auto.aufzeichnung_fortgesetzt'),
    duration: 1500,
    color: 'success'
  });
  await toast.present();
};

function stopRecording() {
  return stopRecordingImpl();
}
const stopRecordingImpl = async () => {
  const route = await db.getRoute(routeId);
  const endTime = new Date().toISOString();
  const trackedDistance = trackingDistance.value;
  const trackedDuration = trackingDuration.value;
  await stopTracking();

  let finalDuration = trackedDuration;
  if (finalDuration == null && route && route.startTime) {
    const start = new Date(route.startTime).getTime();
    const end = new Date(endTime).getTime();
    if (!isNaN(start) && !isNaN(end) && end > start) {
      finalDuration = Math.floor((end - start) / 1000);
    }
  }

  await db.updateRoute(routeId, {
    isRecording: false,
    endTime,
    duration: finalDuration,
    distance: trackedDistance
  });
  await loadData();
  const toast = await toastController.create({
    message: t('auto.aufzeichnung_beendet'),
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
      timestamp: new Date().toISOString(),
      updated: new Date().toISOString()
    });
    await loadData();
    drawRoute();
    const toast = await toastController.create({
      message: t('auto.foto_wegpunkt_hinzugefuegt'),
      duration: 1500,
      color: 'success'
    });
    await toast.present();
  } catch (err) {
    const toast = await toastController.create({
      message: t('auto.foto_wegpunkt_fehlgeschlagen'),
      duration: 1500,
      color: 'danger'
    });
    await toast.present();
  }
};

watch(trackingWaypoints, (newWaypoints) => {
  waypoints.value = [...newWaypoints];
}, { deep: true });

onMounted(async () => {
  await loadData();
  initMap();
  startPositionWatch();
});

// Map-Redraw bei Datenänderung
watch(waypoints, () => {
  drawRoute();
  void preloadWaypointPhotos(waypoints.value);
});

watch(matchedPath, () => {
  drawRoute();
}, { deep: true });

watch(valhallaTrace, () => {
  drawRoute();
}, { deep: true });

onUnmounted(() => {
  if (matchedLine && map) {
    map.removeLayer(matchedLine);
    matchedLine = null;
  }
  if (map) {
    map.remove();
    map = null;
  }
  stopPositionWatch();
});
function startPositionWatch() {
  stopPositionWatch();
  if (!routeData.value?.isRecording) return;
  updateCurrentPosition();
  positionWatchInterval = window.setInterval(updateCurrentPosition, 5000);
}

function stopPositionWatch() {
  if (positionWatchInterval) {
    clearInterval(positionWatchInterval);
    positionWatchInterval = null;
  }
  if (currentPositionMarker && map) {
    map.removeLayer(currentPositionMarker);
    currentPositionMarker = null;
  }
}

async function updateCurrentPosition() {
  if (!map || !routeData.value?.isRecording) return;
  try {
    const pos = await Geolocation.getCurrentPosition();
    const latlng = [pos.coords.latitude, pos.coords.longitude] as [number, number];
    if (!currentPositionMarker) {
      currentPositionMarker = L.marker(latlng, {
        icon: L.divIcon({
          className: 'current-position-marker',
          html: '<div style="width:18px;height:18px;background:#3880ff;border-radius:50%;border:3px solid #fff;box-shadow:0 0 8px #3880ff88;"></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9]
        })
      }).addTo(map);
    } else {
      currentPositionMarker.setLatLng(latlng);
    }
  } catch (e) {
    // Keine Positionsdaten verfügbar
  }
}
// Reagiere auf Wechsel des Aufzeichnungsstatus
watch(() => routeData.value?.isRecording, (isRec) => {
  if (isRec) {
    startPositionWatch();
    startLiveTracking();
  } else {
    stopPositionWatch();
  }
});


const loadData = async () => {
  try {
    if (!hasLoadedOnce.value) {
      isLoading.value = true;
    }
    const route = await db.getRoute(routeId);
    if (!route) {
      const toast = await toastController.create({
        message: t('auto.route_nicht_gefunden'),
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
    valhallaTrace.value = [];
    waypoints.value = await db.getWaypointsByRoute(routeId);
    waypointPhotoCache.value = {};
    await preloadWaypointPhotos(waypoints.value);
    await loadWaypoints(routeId);
  } catch (error) {
    console.error('Error loading route:', error);
  } finally {
    isLoading.value = false;
    hasLoadedOnce.value = true;
  }
};

const initMap = () => {
  setTimeout(async () => {
    map = L.map('detail-map', {
      zoomControl: true,
      attributionControl: false
    }).setView([48.137154, 11.576124], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    // Wenn Route läuft und keine Wegpunkte vorhanden sind, auf aktuellen Standort zentrieren
    if (routeData.value?.isRecording && waypoints.value.length === 0) {
      try {
        const pos = await Geolocation.getCurrentPosition();
        map.setView([pos.coords.latitude, pos.coords.longitude], 16);
      } catch (e) {
        // Fallback: Standard-View
      }
    }

    // Draw route and waypoints
    drawRoute();
  }, 100);
};

function drawRoute() {
  if (!map) return;

  // Entferne alte Polyline
  if (routeLine) {
    map.removeLayer(routeLine);
    routeLine = null;
  }
  if (matchedLine) {
    map.removeLayer(matchedLine);
    matchedLine = null;
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
      const matchShape = valhallaTrace.value.length > 1 ? valhallaTrace.value : matchedPath.value;
      if (matchShape.length > 1) {
        const matchedLatLngs = matchShape.map(p => L.latLng(p.latitude, p.longitude));
        matchedLine = L.polyline(matchedLatLngs, {
          color: '#22c55e',
          weight: 3,
          opacity: 0.9,
          dashArray: '6 6'
        }).addTo(map);
      }
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
    let popup = `<strong>${waypoint.name || t('auto.wegpunkt')}</strong>`;
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
    header: t('auto.route_optionen'),
    buttons: [
      {
        text: t('auto.bearbeiten'),
        icon: createOutline,
        handler: () => {
          editRoute();
        }
      },
      {
        text: t('auto.löschen'),
        icon: trashOutline,
        role: 'destructive',
        handler: () => {
          deleteRoute();
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

const editRoute = async () => {
  if (!routeData.value) return;

    const alert = await alertController.create({
      header: t('auto.route_bearbeiten'),
    inputs: [
      {
        name: 'name',
        type: 'text',
          placeholder: t('auto.name'),
        value: routeData.value.name
      },
      {
        name: 'description',
        type: 'textarea',
          placeholder: t('auto.beschreibung'),
        value: routeData.value.description || ''
      }
    ],
    buttons: [
      {
          text: t('auto.abbrechen'),
        role: 'cancel'
      },
      {
          text: t('auto.speichern'),
        handler: async (data) => {
          if (data.name) {
            await db.updateRoute(routeId, {
              name: data.name,
              description: data.description
            });
            await loadData();
            const toast = await toastController.create({
              message: t('auto.route_aktualisiert'),
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
      header: t('auto.route_löschen'),
      message: t('auto.möchtest_du_diese_route_wirklich_löschen_diese_aktion_kann_n'),
    buttons: [
      {
          text: t('auto.abbrechen'),
        role: 'cancel'
      },
      {
          text: t('auto.löschen'),
        role: 'destructive',
        handler: async () => {
          await db.deleteRoute(routeId);
          const toast = await toastController.create({
              message: t('auto.route_gelöscht'),
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

function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
};

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  return `${minutes} min`;
};

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit'
  });
};
</script>

<style scoped>
.current-position-marker {
  z-index: 9999;
}
.loading-container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.tabs-bar {
  display: flex;
  border-bottom: 1px solid #eee;
  margin-bottom: 8px;
  gap: 2px;
}
.tab-btn {
  flex: 1;
  padding: 8px 0;
  background: none;
  border: none;
  font-weight: 600;
  color: var(--ion-text-color);
  border-bottom: 2px solid transparent;
  font-size: 16px;
  transition: color 0.2s, border-bottom 0.2s;
}
.tab-btn.active {
  border-bottom: 2px solid #3880ff;
  color: #3880ff;
}
.route-controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}
.recording-status {
  display: flex;
  align-items: center;
  gap: 10px;
}
.recording-pulse {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #eb445a;
  opacity: 0.4;
  transition: opacity 0.3s ease;
}
.recording-pulse.active {
  opacity: 1;
  animation: recordingPulse 1.6s ease-in-out infinite;
}
.status-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.status-label {
  margin: 0;
  font-weight: 600;
  font-size: 16px;
}
.status-subtext {
  margin: 0;
  font-size: 12px;
  color: var(--ion-color-medium);
}
.control-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.route-action {
  min-width: 48px;
  min-height: 48px;
  --border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.route-action ion-icon {
  font-size: 22px;
}
@keyframes recordingPulse {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(235, 68, 90, 0.7);
  }
  70% {
    transform: scale(1.4);
    box-shadow: 0 0 0 10px rgba(235, 68, 90, 0);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(235, 68, 90, 0);
  }
}

.map-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 50%;
  z-index: 20;
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

.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 4px;
}

.status-text {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0;
  font-size: 14px;
}

.status-mode-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--ion-color-medium);
}

.status-mode-chip ion-icon {
  font-size: 1rem;
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
.waypoint-preview {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  overflow: hidden;
  background: var(--ion-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
}
.waypoint-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.preview-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ion-color-medium);
}
.waypoint-action-group {
  display: flex;
  gap: 4px;
}
.photo-preview-modal {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 40vh;
}
.photo-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.modal-title {
  margin: 0;
  font-weight: 700;
}
.modal-subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--ion-color-medium);
}
.photo-preview-modal ion-img {
  width: 100%;
  border-radius: 14px;
  max-height: 70vh;
  object-fit: contain;
}
.photo-preview-placeholder {
  text-align: center;
  color: var(--ion-color-medium);
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
