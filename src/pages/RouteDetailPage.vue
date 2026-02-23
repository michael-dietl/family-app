<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
          <ion-buttons slot="start">
            <ion-back-button default-href="/routes"  router-direction="back"/>
          </ion-buttons>
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
            </div>
            <div v-if="manualPlacementActive" class="manual-placement-banner">
              <p>{{ manualPlacementInstruction }}</p>
              <ion-button size="small" fill="clear" color="medium" @click="cancelManualPlacement">
                {{ $t('buttons.cancel') }}
              </ion-button>
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
              <div class="status-row">
                <p class="status-text"><strong>{{$t('auto.status')}}</strong>
                  <span :style="{color: routeData?.isRecording ? '#3880ff' : '#eb445a'}">{{ routeData?.isRecording ? $t('auto.aufzeichnung_läuft') : $t('auto.beendet_status') }}</span>
                </p>
                <div class="status-right">
                  <div class="status-mode-chip">
                    <ion-icon :icon="routeModeIcon" :color="routeModeColor" />
                    <span>{{ routeModeLabel }}</span>
                  </div>
                  <div class="status-valhalla-group">
                    <ion-button
                      shape="round"
                      fill="clear"
                      color="medium"
                      class="route-action status-valhalla-progress"
                      disabled
                    >
                      <ion-spinner v-if="valhallaMatching" slot="start" name="crescent" />
                      <ion-icon v-else slot="start" :icon="valhallaIcon" />
                      <span>{{ valhallaMatching ? $t('auto.valhalla_processing') : $t('auto.valhalla_ready') }}</span>
                    </ion-button>
                    <ion-button
                      shape="round"
                      fill="outline"
                      color="secondary"
                      class="route-action status-valhalla-button"
                      :disabled="valhallaMatching || !hasTrackPoints"
                      @click="sendRouteToValhalla"
                    >
                      <ion-icon slot="start" :icon="valhallaIcon" />
                      {{ $t('auto.valhalla_abgleichen') }}
                    </ion-button>
                  </div>
                  <ion-button
                    v-if="routeData && !routeData.isRecording"
                    shape="round"
                    fill="outline"
                    color="warning"
                    class="route-action status-add-waypoint-button"
                    :aria-label="$t('auto.wegpunkt_hinzufügen')"
                    @click="addManualWaypoint"
                  >
                    <ion-icon slot="icon-only" :icon="addOutline" />
                  </ion-button>
                </div>
              </div>
              <p class="meta-row"><strong>{{$t('auto.start')}}</strong> {{ routeData?.startTime ? formatDateTime(routeData.startTime) : '-' }}</p>
              <p v-if="routeData?.endTime" class="meta-row"><strong>{{$t('auto.ende')}}</strong> {{ formatDateTime(routeData.endTime) }}</p>
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
                      v-if="wp.type === 'manual' || wp.type === 'photo'"
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

    <ion-modal :is-open="editRouteModalOpen" :backdrop-dismiss="false" css-class="route-edit-modal">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button fill="clear" color="medium" @click="closeEditRouteModal" aria-label="{{ $t('auto.abbrechen') }}">
              <ion-icon :icon="closeOutline" />
            </ion-button>
          </ion-buttons>
          <ion-title>{{ $t('auto.route_bearbeiten') }}</ion-title>
          <ion-buttons slot="end">
            <ion-button :disabled="!isRouteEditValid" @click="saveRouteEdits">
              {{ $t('auto.speichern') }}
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        <ion-list lines="full">
          <ion-item>
            <ion-label position="stacked">{{ $t('auto.route') }}</ion-label>
            <ion-input v-model="routeEditForm.name" placeholder="{{ $t('auto.route') }}" clear-input></ion-input>
          </ion-item>
          <ion-item>
            <ion-label position="stacked">{{ $t('auto.beschreibung') }}</ion-label>
            <ion-textarea
              v-model="routeEditForm.description"
              :rows="3"
              auto-grow
              :placeholder="t('auto.beschreibung')"
            ></ion-textarea>
          </ion-item>
          <ion-radio-group v-model="routeEditForm.travelMode">
            <ion-item v-for="option in travelModeOptions" :key="option.value">
              <ion-icon slot="start" :icon="option.icon" :color="option.color" />
              <ion-label>
                <strong>{{ option.label }}</strong>
              </ion-label>
              <ion-radio slot="end" :value="option.value" />
            </ion-item>
          </ion-radio-group>
        </ion-list>
      </ion-content>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">

import { ref, watch, watchEffect, computed, onMounted, onUnmounted, reactive } from 'vue';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { StatusBar, Style } from '@capacitor/status-bar';
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
  IonBackButton,
  IonIcon,
  IonModal,
  IonImg,
  IonList,
  IonItem,
  IonLabel,
  IonSpinner,
  IonInput,
  IonTextarea,
  IonRadioGroup,
  IonRadio,
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
  addOutline,
  locationOutline,
  trashOutline,
  createOutline,
  closeOutline,
  pauseOutline,
  playOutline,
  stopCircleOutline,
  carOutline,
  bicycleOutline,
  walkOutline
} from 'ionicons/icons';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { db } from '@/services/database';
import { useRouteTracking, resolveTrackingProfile } from '@/composables/useRouteTracking';
import { matchPositionsWithValhalla, traceRouteSummary, type ValhallaTraceSummary } from '@/services/valhalla';
import { extractGPSFromCameraExif } from '@/services/exif';
import { useI18n } from 'vue-i18n';
import { scooterIcon } from '@/icons/scooter';
import { valhallaIcon } from '@/icons/valhalla';
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

const routeMode = computed<RouteData['travelMode']>(() =>
  routeData.value?.travelMode ?? 'car'
);
const routeModeIcon = computed(() => getRouteModeIcon(routeMode.value));
const routeModeColor = computed(() => getRouteModeColor(routeMode.value));
const routeModeLabel = computed(() => getRouteModeLabel(routeMode.value));

const editRouteModalOpen = ref(false);
const routeEditForm = reactive({
  name: '',
  description: '',
  travelMode: 'car' as RouteData['travelMode']
});
const travelModeOptions = computed(() =>
  TRAVEL_MODE_CONFIGS.map((config) => ({
    ...config,
    label: getRouteModeLabel(config.value)
  }))
);

function getRouteModeIcon(mode: RouteData['travelMode'] | undefined) {
  switch (mode) {
    case 'pedestrian':
      return walkOutline;
    case 'bicycle':
      return bicycleOutline;
    case 'motor_scooter':
      return scooterIcon;
    default:
      return carOutline;
  }
}

function getRouteModeColor(mode: RouteData['travelMode'] | undefined) {
  switch (mode) {
    case 'pedestrian':
      return 'medium';
    case 'bicycle':
      return 'success';
    case 'motor_scooter':
      return 'warning';
    default:
      return 'primary';
  }
}

function getRouteModeLabel(mode: RouteData['travelMode'] | undefined) {
  switch (mode) {
    case 'pedestrian':
      return 'Fußgänger';
    case 'bicycle':
      return 'Fahrrad';
    case 'motor_scooter':
      return 'Vespa';
    default:
      return 'Auto';
  }
}

const TRAVEL_MODE_CONFIGS: Array<{
  value: RouteData['travelMode'];
  icon: string;
  color: string;
}> = [
  { value: 'car', icon: carOutline, color: 'primary' },
  { value: 'pedestrian', icon: walkOutline, color: 'medium' },
  { value: 'bicycle', icon: bicycleOutline, color: 'success' },
  { value: 'motor_scooter', icon: scooterIcon, color: 'warning' }
];

let map: L.Map | null = null;
let routeLine: L.Polyline | null = null;
let matchedLine: L.Polyline | null = null;
const waypointMarkers: Map<number, L.Marker> = new Map();
let currentPositionMarker: L.Marker | null = null;
let positionWatchInterval: number | null = null;

const startLiveTracking = async () => {
  if (!routeData.value?.isRecording || isTracking.value) return;
  try {
    await startTracking(routeId, routeData.value?.travelMode ?? 'car');
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

const manualPlacementActive = ref(false);
const waypointPlacementMode = ref<'manual' | 'photo' | null>(null);
const manualPlacementInstruction = computed(() =>
  waypointPlacementMode.value === 'photo'
    ? t('auto.foto_wegpunkt_karte_tippen')
    : t('auto.wegpunkt_karte_tippen')
);

const valhallaTrace = ref<LatLonPoint[]>([]);
const valhallaMatching = ref(false);
const hasTrackPoints = computed(() =>
  waypoints.value.filter((wp) => wp.type === 'position').length >= 3
);

const SHAPABLE_WAYPOINT_TYPES: Waypoint['type'][] = ['position', 'manual', 'photo'];

type ShapableWaypointEntry = { point: LatLonPoint; timestamp: number | undefined; index: number };

const compareWaypointTimestamps = (a?: number, b?: number): number => {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a - b;
};

const buildPositionShape = (sourceWaypoints: Waypoint[]): LatLonPoint[] => {
  const entries: ShapableWaypointEntry[] = sourceWaypoints
    .map<ShapableWaypointEntry | null>((waypoint, index) => {
      if (!SHAPABLE_WAYPOINT_TYPES.includes(waypoint.type)) {
        return null;
      }
      const point: LatLonPoint = { latitude: waypoint.latitude, longitude: waypoint.longitude };
      const parsed = Date.parse(waypoint.timestamp);
      const timestamp = Number.isNaN(parsed) ? undefined : parsed;
      if (timestamp !== undefined) {
        point.timestamp = timestamp;
      }
      return { point, timestamp, index };
    })
    .filter((entry): entry is ShapableWaypointEntry => entry !== null);

  return entries
    .sort((a, b) => {
      const timestampDiff = compareWaypointTimestamps(a.timestamp, b.timestamp);
      if (timestampDiff !== 0) return timestampDiff;
      return a.index - b.index;
    })
    .map(({ point }) => point);
};

const determineTraceShape = (): LatLonPoint[] => {
  if (valhallaTrace.value.length >= 3) return valhallaTrace.value;
  if (matchedPath.value.length >= 3) return matchedPath.value;
  return buildPositionShape(waypoints.value);
};

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

  const routePoints = buildPositionShape(waypoints.value);

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
      const profile = resolveTrackingProfile(routeData.value?.travelMode);
      const { shape: matchedShape } = await matchPositionsWithValhalla(routePoints, {
        id: routeId ? routeId.toString() : undefined,
        costing,
        gpsAccuracy: profile.valhallaGpsAccuracy,
        searchRadius: profile.valhallaSearchRadius
      });
      if (matchedShape.length < 3) {
        const toast = await toastController.create({
          message: t('auto.valhalla_no_shape'),
          duration: 2000,
          color: 'warning'
        });
        await toast.present();
        valhallaTrace.value = [];
        return;
      }
      valhallaTrace.value = matchedShape;
      const routeMessage = hasSignificantDifference(routePoints, matchedShape)
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
  const resolveCurrentWaypointLocation = async (): Promise<LatLonPoint | null> => {
    if (matchedPath.value.length > 0) {
      return matchedPath.value[matchedPath.value.length - 1];
    }

    const livePositions = trackingWaypoints.value.filter((wp) => wp.type === 'position');
    if (livePositions.length > 0) {
      const lastLive = livePositions[livePositions.length - 1];
      return { latitude: lastLive.latitude, longitude: lastLive.longitude };
    }

    const storedPositions = waypoints.value.filter((wp) => wp.type === 'position');
    if (storedPositions.length > 0) {
      const lastStored = storedPositions[storedPositions.length - 1];
      return { latitude: lastStored.latitude, longitude: lastStored.longitude };
    }

    try {
      const position = await Geolocation.getCurrentPosition();
      return { latitude: position.coords.latitude, longitude: position.coords.longitude };
    } catch (error) {
      console.warn('Unable to resolve waypoint location', error);
      return null;
    }
  };

  const promptWaypointInfo = async (
    defaultName: string,
    defaultDescription = ''
  ): Promise<{ name: string; description: string } | null> => {
    return new Promise(async (resolve) => {
      const alert = await alertController.create({
        header: t('auto.wegpunkt_details'),
        inputs: [
          {
            name: 'name',
            type: 'text',
            placeholder: t('auto.wegpunkt_titel'),
            value: defaultName
          },
          {
            name: 'description',
            type: 'textarea',
            placeholder: t('auto.beschreibung_optional'),
            value: defaultDescription
          }
        ],
        buttons: [
          {
            text: t('auto.abbrechen'),
            role: 'cancel',
            handler: () => {
              resolve(null);
            }
          },
          {
            text: t('auto.speichern'),
            handler: (data) => {
              resolve({
                name: (data?.name?.trim() || defaultName).trim(),
                description: data?.description?.trim() || ''
              });
              return true;
            }
          }
        ]
      });
      await alert.present();
    });
  };

  const persistManualWaypoint = async (location: LatLonPoint, details: { name: string; description: string }) => {
    await db.createWaypoint({
      routeId,
      type: 'manual',
      latitude: location.latitude,
      longitude: location.longitude,
      name: details.name || t('auto.wegpunkt'),
      description: details.description || '',
      timestamp: new Date().toISOString(),
      updated: new Date().toISOString()
    });
    await loadData();
    setTimeout(() => drawRoute(), 100);
  };

  const tryCreateManualWaypoint = async (location: LatLonPoint) => {
    const details = await promptWaypointInfo(t('auto.wegpunkt'), '');
    if (!details) return null;
    await persistManualWaypoint(location, details);
    return true;
  };

  // --- Manuellen Wegpunkt hinzufügen ---
  function addManualWaypoint() {
    return addManualWaypointImpl();
  }

  const presentManualWaypointOutcome = async (success: boolean) => {
    const toast = await toastController.create({
      message: success ? t('auto.manueller_wegpunkt_hinzugefuegt') : t('auto.manueller_wegpunkt_fehlgeschlagen'),
      duration: 1500,
      color: success ? 'success' : 'danger'
    });
    await toast.present();
  };

  const finalizeManualWaypointPlacement = async (location: LatLonPoint) => {
    manualPlacementActive.value = false;
    waypointPlacementMode.value = null;
    try {
      const result = await tryCreateManualWaypoint(location);
      if (!result) return;
      await presentManualWaypointOutcome(true);
    } catch (error) {
      console.error('Manual waypoint placement failed', error);
      await presentManualWaypointOutcome(false);
    }
  };

  const persistPhotoWaypoint = async (
    location: LatLonPoint,
    details: { name: string; description: string },
    payload: { base64: string; mimeType: string }
  ) => {
    const photoId = await db.createPhoto({
      galleryId: 1,
      filename: `route-photo-${Date.now()}.jpg`,
      filepath: `data:${payload.mimeType};base64,${payload.base64}`,
      thumbnail: payload.base64,
      mimeType: payload.mimeType,
      latitude: location.latitude,
      longitude: location.longitude
    });
    await db.createWaypoint({
      routeId,
      type: 'photo',
      latitude: location.latitude,
      longitude: location.longitude,
      name: details.name || t('auto.foto'),
      description: details.description || '',
      photoId,
      timestamp: new Date().toISOString(),
      updated: new Date().toISOString()
    });
    await loadData();
    drawRoute();
  };

  const finalizePhotoWaypointPlacement = async (location: LatLonPoint) => {
    manualPlacementActive.value = false;
    waypointPlacementMode.value = null;
    try {
      const details = await promptWaypointInfo(t('auto.foto'), '');
      if (!details) return;
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        quality: 70
      });
      if (!photo.base64String) {
        throw new Error('Photo capture was cancelled');
      }
      const mimeType = photo.format ? `image/${photo.format}` : 'image/jpeg';
      await persistPhotoWaypoint(location, details, {
        base64: photo.base64String,
        mimeType
      });
      const toast = await toastController.create({
        message: t('auto.foto_wegpunkt_hinzugefuegt'),
        duration: 1500,
        color: 'success'
      });
      await toast.present();
    } catch (error) {
      console.error('Photo waypoint placement failed', error);
      if (error instanceof Error && error.message === 'Photo capture was cancelled') return;
      const toast = await toastController.create({
        message: t('auto.foto_wegpunkt_fehlgeschlagen'),
        duration: 1500,
        color: 'danger'
      });
      await toast.present();
    }
  };

  const addManualWaypointImpl = async () => {
    const location = await resolveCurrentWaypointLocation();
    if (!location) {
      await presentManualWaypointOutcome(false);
      return;
    }
    try {
      const result = await tryCreateManualWaypoint(location);
      if (!result) return;
      await presentManualWaypointOutcome(true);
    } catch (error) {
      console.error('Manual waypoint creation failed', error);
      await presentManualWaypointOutcome(false);
    }
  };

  const startWaypointPlacement = (mode: 'manual' | 'photo') => {
    manualPlacementActive.value = true;
    waypointPlacementMode.value = mode;
  };

  const cancelManualPlacement = () => {
    manualPlacementActive.value = false;
    waypointPlacementMode.value = null;
  };

  const handleManualWaypointMapClick = async (event: L.LeafletMouseEvent) => {
    if (!manualPlacementActive.value || !waypointPlacementMode.value) return;
    const location = {
      latitude: event.latlng.lat,
      longitude: event.latlng.lng
    });
    if (waypointPlacementMode.value === 'manual') {
      await finalizeManualWaypointPlacement(location);
    } else {
      await finalizePhotoWaypointPlacement(location);
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
  const summaryShape = determineTraceShape();
  const routeProfile = resolveTrackingProfile(routeData.value?.travelMode);
  const costing =
    routeData.value?.travelMode === 'pedestrian'
      ? 'pedestrian'
      : routeData.value?.travelMode ?? 'auto';
  await stopTracking();
  let traceSummary: ValhallaTraceSummary | null = null;
  if (summaryShape.length >= 3) {
    try {
      traceSummary = await traceRouteSummary(summaryShape, {
        id: routeId ? routeId.toString() : undefined,
        costing,
        gpsAccuracy: routeProfile.valhallaGpsAccuracy,
        searchRadius: routeProfile.valhallaSearchRadius,
        shapeMatch: routeProfile.valhallaShapeMatch
      });
    } catch (error) {
      console.warn('Valhalla trace_route summary failed', error);
    }
  }

  let finalDuration = trackedDuration;
  if (finalDuration == null && route && route.startTime) {
    const start = new Date(route.startTime).getTime();
    const end = new Date(endTime).getTime();
    if (!isNaN(start) && !isNaN(end) && end > start) {
      finalDuration = Math.floor((end - start) / 1000);
    }
  }

  let finalDistance = trackedDistance;
  if (traceSummary?.length && traceSummary.length > 0) {
    finalDistance = Math.round(traceSummary.length * 1000);
  }
  if (traceSummary?.time && traceSummary.time > 0) {
    finalDuration = Math.round(traceSummary.time);
  }

  await db.updateRoute(routeId, {
    isRecording: false,
    endTime,
    duration: finalDuration,
    distance: finalDistance
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
    const details = await promptWaypointInfo(t('auto.foto'), '');
    if (!details) return;
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        quality: 70
      });
      if (!photo.base64String) {
        throw new Error('Photo capture was cancelled');
      }
      let location: LatLonPoint | null = null;
      if (photo.exif) {
        const coords = extractGPSFromCameraExif(photo.exif);
        if (coords?.latitude != null && coords.longitude != null) {
          location = {
            latitude: coords.latitude,
            longitude: coords.longitude
          };
        }
      }
      if (!location) {
        location = await resolveCurrentWaypointLocation();
      }
      if (!location) {
        throw new Error('Unable to resolve photo waypoint location');
      }
      const mimeType = photo.format ? `image/${photo.format}` : 'image/jpeg';
      await persistPhotoWaypoint(location, details, {
        base64: photo.base64String,
        mimeType
      });
      const toast = await toastController.create({
        message: t('auto.foto_wegpunkt_hinzugefuegt'),
        duration: 1500,
        color: 'success'
      });
      await toast.present();
    } catch (err) {
      console.error('Photo waypoint creation failed', err);
      if (err instanceof Error && err.message === 'Photo capture was cancelled') return;
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
  void preloadWaypointPhotos(waypoints.value).then(() => drawRoute());
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
    map.off('click', handleManualWaypointMapClick);
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
    manualPlacementActive.value = false;
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
    map.on('click', handleManualWaypointMapClick);

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

const escapeHtml = (value = ''): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const createWaypointPopupContent = (waypoint: Waypoint): string => {
  const title = escapeHtml(waypoint.name || t('auto.wegpunkt'));
  let content = `<strong>${title}</strong>`;
  if (waypoint.description) {
    content += `<br>${escapeHtml(waypoint.description)}`;
  }
  if (waypoint.timestamp) {
    content += `<br><span style='font-size:11px;color:#888;'>${escapeHtml(formatTime(waypoint.timestamp))}</span>`;
  }
  if (waypoint.type === 'photo') {
    const photoSrc = getWaypointPhotoSrc(waypoint);
    if (photoSrc) {
      const altText = escapeHtml(waypoint.name || t('auto.foto'));
      content += `<br><img class="waypoint-popup-photo" src="${escapeHtml(photoSrc)}" alt="${altText}" />`;
    }
  }
  return content;
};

function drawRoute() {
  if (!map) return;

  if (routeLine) {
    map.removeLayer(routeLine);
    routeLine = null;
  }
  if (matchedLine) {
    map.removeLayer(matchedLine);
    matchedLine = null;
  }
  waypointMarkers.forEach(marker => {
    if (map) map.removeLayer(marker);
  });
  waypointMarkers.clear();

  const positionWaypoints = waypoints.value.filter(wp => wp.type === 'position');
  const matchShape = valhallaTrace.value.length > 1 ? valhallaTrace.value : matchedPath.value;
  const matchedLatLngs = matchShape.map(p => L.latLng(p.latitude, p.longitude));

  if (positionWaypoints.length > 0) {
    const latlngs = positionWaypoints.map(wp => L.latLng(wp.latitude, wp.longitude));
    routeLine = L.polyline(latlngs, {
      color: '#3880ff',
      weight: 4,
      opacity: 0.7
    }).addTo(map);
  }

  if (matchShape.length > 1) {
    matchedLine = L.polyline(matchedLatLngs, {
      color: '#22c55e',
      weight: 3,
      opacity: 0.9,
      dashArray: '6 6'
    }).addTo(map);
  }

  let viewBounds: L.LatLngBounds | null = null;
  const extendBoundsFromLayer = (layer: L.Polyline | null) => {
    if (!layer) return;
    const layerBounds = layer.getBounds();
    viewBounds = viewBounds ? viewBounds.extend(layerBounds) : layerBounds;
  };
  extendBoundsFromLayer(routeLine);
  extendBoundsFromLayer(matchedLine);

  if (viewBounds) {
    map.fitBounds(viewBounds, { padding: [50, 50] });
  } else {
    const manual = waypoints.value.find(wp => wp.type === 'manual');
    if (manual) {
      map.setView([manual.latitude, manual.longitude], 15);
    }
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
    const popupContent = createWaypointPopupContent(waypoint);
    marker.bindPopup(popupContent);
    if (map) marker.addTo(map);
    if (waypoint.type === 'photo') {
      marker.on('click', () => previewPhoto(waypoint));
      marker.on('popupopen', () => {
        const popupElement = marker.getPopup()?.getElement();
        const image = popupElement?.querySelector<HTMLImageElement>('.waypoint-popup-photo');
        if (!image) return;
        image.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          previewPhoto(waypoint);
        };
      });
    }
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
        text: t('auto.foto_wegpunkt_eintragen'),
        icon: cameraOutline,
        handler: () => {
          startWaypointPlacement('photo');
        }
      },
      {
        text: t('auto.manueller_wegpunkt_eintragen'),
        icon: flagOutline,
        handler: () => {
          startWaypointPlacement('manual');
        }
      },
      {
        text: t('auto.foto_hinzufügen'),
        icon: cameraOutline,
        handler: () => {
          addPhotoWaypoint();
        }
      },
      {
        text: t('auto.bearbeiten'),
        icon: createOutline,
        handler: () => {
          openEditRouteModal();
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

const isRouteEditValid = computed(() => routeEditForm.name.trim().length > 0);

const openEditRouteModal = () => {
  if (!routeData.value) return;
  routeEditForm.name = routeData.value.name;
  routeEditForm.description = routeData.value.description ?? '';
  routeEditForm.travelMode = routeData.value.travelMode ?? 'car';
  editRouteModalOpen.value = true;
};

const closeEditRouteModal = () => {
  editRouteModalOpen.value = false;
};

const saveRouteEdits = async () => {
  if (!routeData.value) return;
  const name = routeEditForm.name.trim();
  if (!name) return;
  const updates: Partial<RouteData> = {
    name,
    description: routeEditForm.description.trim() || undefined,
    travelMode: routeEditForm.travelMode
  };
  await db.updateRoute(routeId, updates);
  await loadData();
  editRouteModalOpen.value = false;
  const toast = await toastController.create({
    message: t('auto.route_aktualisiert'),
    duration: 2000,
    color: 'success'
  });
  await toast.present();
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


onMounted(async () => {
  await StatusBar.setOverlaysWebView({ overlay: false });
  await StatusBar.setStyle({ style: Style.Dark });
});
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
  margin-bottom: 8px;
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
  top: calc(50% + 8px);
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--ion-background-color);
  border-top-left-radius: 20px;
  border-top-right-radius: 20px;
  padding: 24px 20px 20px;
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

.manual-placement-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 10px 12px;
  border: 1px dashed var(--ion-color-medium);
  border-radius: 14px;
  margin-bottom: 12px;
  background: var(--ion-background-color);
}

.manual-placement-banner p {
  margin: 0;
  font-size: 13px;
  color: var(--ion-color-medium);
}

.status-row {
  display: flex;
  align-items: flex-start;
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

.status-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.status-valhalla-group {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.status-valhalla-button {
  font-size: 0.85rem;
  padding-inline: 1rem;
  min-width: 160px;
  min-height: 48px;
  --border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
}
.status-valhalla-button ion-icon {
  font-size: 18px;
}

.status-valhalla-progress {
  font-size: 0.75rem;
  padding-inline: 0.85rem;
  min-height: 46px;
  --border-radius: 16px;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.status-valhalla-progress span {
  font-size: 0.75rem;
}
.status-valhalla-progress ion-spinner {
  width: 18px;
  height: 18px;
}

.status-add-waypoint-button {
  min-width: 44px;
  min-height: 44px;
  --border-radius: 14px;
  border: 1px dashed var(--ion-color-medium);
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
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  width: 100%;
  margin: 12px 0;
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
  margin: 4px 0 10px;
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

.waypoint-photo {
  border: 2px solid #eb445a;
}

.waypoint-popup-photo {
  width: 140px;
  max-width: 160px;
  border-radius: 12px;
  margin-top: 6px;
  display: block;
  cursor: pointer;
  object-fit: cover;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
}
.waypoint-photo ion-icon {
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
.route-edit-modal {
  --ion-background-color: #ffffff;
}
.route-edit-modal ion-header,
.route-edit-modal ion-content {
  --background: var(--ion-background-color);
}
.route-edit-modal ion-item {
  --background: transparent;
}
.route-edit-modal ion-input::part(native),
.route-edit-modal ion-textarea::part(native) {
  background: transparent;
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

.waypoint-popup-photo {
  width: 140px;
  max-width: 160px;
  border-radius: 12px;
  margin-top: 6px;
  display: block;
  cursor: pointer;
  object-fit: cover;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
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
