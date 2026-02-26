<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="router.back()">
            <ion-icon :icon="arrowBackOutline" />
          </ion-button>
        </ion-buttons>
        <ion-buttons slot="end">
          <ion-button fill="clear" @click="openSpeechPlanModal" :aria-label="t('auto.route_speech_title')">
            <ion-icon :icon="micOutline" />
          </ion-button>
          <ion-button @click="startNewRoute()">
            <ion-icon :icon="addOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ $t('auto.routen') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="routes-content safe-area">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">{{ $t('auto.routen') }}</ion-title>
        </ion-toolbar>
      </ion-header>

      <ion-searchbar
        class="routes-search"
        v-model="routeSearchQuery"
        :placeholder="t('auto.routen_durchsuchen')"
        :debounce="300"
        show-cancel-button="never"
      />
      <ion-segment class="routes-filter" v-model="routeFilterMode">
        <ion-segment-button value="all">
          {{ t('auto.alle') }}
        </ion-segment-button>
        <ion-segment-button value="mine">
          {{ t('auto.meine_routen') }}
        </ion-segment-button>
      </ion-segment>

      <!-- Loading -->
      <div v-if="isLoading" class="ion-text-center ion-padding">
        <ion-spinner name="crescent" />
      </div>

      <!-- Empty State -->
      <div v-else-if="routes.length === 0" class="empty-state">
        <ion-icon :icon="mapOutline" class="empty-icon" />
        <h2>{{ $t('auto.keine_routen') }}</h2>
        <p>{{ $t('auto.starte_deine_erste_routenaufzeichnung') }}</p>
        <ion-button @click="startNewRoute" expand="block">
          <ion-icon slot="start" :icon="addOutline" />
          {{ $t('auto.route_aufzeichnen') }}
        </ion-button>
      </div>

      <div v-else-if="filteredRoutes.length === 0" class="empty-state">
        <ion-icon :icon="mapOutline" class="empty-icon" />
        <h2>{{ $t('auto.keine_passenden_routen') }}</h2>
        <p>{{ $t('auto.probiere_andere_stichworte') }}</p>
      </div>

      <!-- Routes List -->
      <div v-else class="routes-list-wrapper">
        <ion-list class="routes-list" lines="none">
          <ion-card v-for="route in filteredRoutes" :key="route.id" class="route-card" role="button" tabindex="0"
            @click="openRoute(route.id!)">
            <div v-if="route && route.id && routePreviewPaths[route.id]" class="route-card-background">
              <svg viewBox="0 0 200 110" preserveAspectRatio="none">
                <path :d="routePreviewPaths[route.id]" />
              </svg>
            </div>
            <ion-card-header class="route-card-header">
              <ion-icon :icon="route.isRecording ? radioButtonOnOutline : mapOutline"
                :color="route.isRecording ? 'danger' : 'primary'" class="route-status-icon" />
              <div class="route-card-titles">
                <ion-card-title class="route-card-title">{{ route.name }}</ion-card-title>
                <p v-if="route.description" class="route-description">
                  {{ route.description }}
                </p>
                <div class="route-mode-chip">
                  <ion-icon :icon="getRouteModeIcon(route.travelMode)" :color="getRouteModeColor(route.travelMode)" />
                  <span>{{ getRouteModeLabel(route.travelMode) }}</span>
                </div>
              </div>
              <ion-badge v-if="route.isRecording" color="danger" class="route-badge">
                {{ $t('auto.aufzeichnung_läuft') }}
              </ion-badge>
            </ion-card-header>
            <ion-card-content class="route-meta" @click.stop>
              <span v-if="route.distance">{{ formatDistance(route.distance) }}</span>
              <span v-if="route.duration">{{ formatDuration(route.duration) }}</span>
              <span>{{ formatDate(route.startTime) }}</span>
            </ion-card-content>
            <ion-card-content class="route-actions" @click.stop>
              <ion-button size="small" fill="outline" @click.stop="openEditRouteModal(route)">
                <ion-icon slot="start" :icon="pencilOutline" />
                {{ $t('auto.route_bearbeiten') }}
              </ion-button>
              <ion-button size="small" fill="outline" color="danger" @click.stop="confirmDeleteRoute(route)">
                <ion-icon slot="start" :icon="trashOutline" />
                {{ $t('auto.route_löschen') }}
                <ion-modal css-class="route-edit-modal" :is-open="editRouteModalOpen" :backdropDismiss="false"
                  @didDismiss="closeEditRouteModal">
                  <ion-header translucent>
                    <ion-toolbar>
                      <ion-buttons slot="start">
                        <ion-button fill="clear" color="medium" @click="closeEditRouteModal"
                          aria-label="{{ t('auto.abbrechen') }}">
                          <ion-icon :icon="closeOutline" />
                        </ion-button>
                      </ion-buttons>
                      <ion-title>{{ t('auto.route_bearbeiten') }}</ion-title>
                      <ion-buttons slot="end">
                        <ion-button :disabled="!isRouteEditValid" @click="saveRouteEdits">
                          {{ t('auto.speichern') }}
                        </ion-button>
                      </ion-buttons>
                    </ion-toolbar>
                  </ion-header>
                  <ion-content>
                    <ion-list lines="full">
                      <ion-item>
                        <ion-label position="stacked">{{ t('auto.route') }}</ion-label>
                        <ion-input v-model="routeEditForm.name" placeholder="{{ t('auto.route') }}"
                          clear-input></ion-input>
                      </ion-item>
                      <ion-item>
                        <ion-label position="stacked">{{ t('auto.beschreibung') }}</ion-label>
                        <ion-textarea v-model="routeEditForm.description" :rows="3" auto-grow
                          :placeholder="t('auto.beschreibung')"></ion-textarea>
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
                      <ion-item>
                        <ion-label position="stacked">{{ t('auto.kartenstil') }}</ion-label>
                        <ion-segment scrollable v-model="routeEditForm.mapStyle">
                          <ion-segment-button v-for="option in mapStyleOptions" :key="option.value" :value="option.value">
                            {{ option.label }}
                          </ion-segment-button>
                        </ion-segment>
                      </ion-item>
                    </ion-list>
                  </ion-content>
                </ion-modal>
              </ion-button>
            </ion-card-content>
          </ion-card>
        </ion-list>
      </div>
    </ion-content>
    <ion-modal class="start-route-modal" :is-open="startRouteModalOpen" @didDismiss="cancelStartRoute"
      :backdropDismiss="true">
      <ion-header translucent>
        <ion-toolbar>
          <ion-title>{{ $t('auto.aufzeichnung_starten') }}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <p class="modal-description">
          {{ $t('auto.möchtest_du_eine_neue_routenaufzeichnung_starten') }}
        </p>
        <ion-item>
          <ion-label position="stacked">{{ $t('auto.name') }}</ion-label>
          <ion-input v-model="newRouteName" autofocus />
        </ion-item>
        <p class="modal-label">Fahrmodus</p>
        <ion-radio-group v-model="newRouteMode">
          <ion-item button :detail="false" lines="none">
            <ion-icon slot="start" :icon="carOutline" />
            <ion-label>Auto</ion-label>
            <ion-radio slot="end" value="car" />
          </ion-item>
          <ion-item button :detail="false" lines="none">
            <ion-icon slot="start" :icon="walkOutline" />
            <ion-label>Fußgänger</ion-label>
            <ion-radio slot="end" value="pedestrian" />
          </ion-item>
          <ion-item button :detail="false" lines="none">
            <ion-icon slot="start" :icon="bicycleOutline" />
            <ion-label>Fahrrad</ion-label>
            <ion-radio slot="end" value="bicycle" />
          </ion-item>
          <ion-item button :detail="false" lines="none">
            <ion-icon slot="start" :icon="scooterIcon" />
            <ion-label>Vespa</ion-label>
            <ion-radio slot="end" value="motor_scooter" />
          </ion-item>
        </ion-radio-group>
        <div class="modal-actions">
          <ion-button expand="block" fill="outline" color="medium" @click="cancelStartRoute">
            {{ $t('buttons.cancel') }}
          </ion-button>
          <ion-button expand="block" color="primary" :disabled="!newRouteName.trim()" @click="confirmStartRoute">
            {{ $t('auto.route_aufzeichnen') }}
          </ion-button>
        </div>
      </ion-content>
    </ion-modal>
    <ion-modal class="speech-plan-modal" :is-open="speechModalOpen" @didDismiss="closeSpeechPlanModal" :backdropDismiss="true">
      <ion-header translucent>
        <ion-toolbar>
          <ion-title>{{ t('auto.route_speech_title') }}</ion-title>
          <ion-buttons slot="end">
            <ion-button fill="clear" @click="closeSpeechPlanModal">
              <ion-icon :icon="closeOutline" />
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <p class="speech-plan-instruction">{{ t('auto.route_speech_instruction') }}</p>
        <p v-if="recognizedText" class="speech-plan-recognized">
          {{ recognizedText }}
        </p>
        <p v-if="geocodedDestinationLabel" class="speech-plan-destination">
          {{ t('auto.route_speech_destination') }}: {{ geocodedDestinationLabel }}
        </p>
        <div v-if="planInProgress" class="speech-plan-status">
          <ion-spinner name="crescent" />
          <span>{{ t('auto.route_speech_plan_pending') }}</span>
        </div>
        <div v-if="speechPlanPreviewPath" class="speech-plan-preview">
          <svg viewBox="0 0 280 140" preserveAspectRatio="none">
            <path :d="speechPlanPreviewPath" />
          </svg>
        </div>
        <div v-if="plannedRoute" class="speech-plan-summary">
          <h3>{{ t('auto.route_speech_plan_ready') }}</h3>
          <p v-if="planSummaryDistance">{{ t('auto.route_speech_plan_distance') }}: {{ planSummaryDistance }}</p>
          <p v-if="planSummaryDuration">{{ t('auto.route_speech_plan_duration') }}: {{ planSummaryDuration }}</p>
        </div>
        <ion-button
          expand="block"
          color="primary"
          :disabled="speechListening || planInProgress"
          @click="startSpeechRecognition"
        >
          <ion-icon slot="start" :icon="micOutline" />
          <span v-if="speechListening">
            {{ t('auto.route_speech_listening') }}
          </span>
          <span v-else>
            {{ t('auto.route_speech_listen') }}
          </span>
          <ion-spinner v-if="speechListening" slot="end" name="crescent" />
        </ion-button>
        <ion-button
          v-if="plannedRoute"
          expand="block"
          color="success"
          :disabled="planInProgress"
          @click="useSpeechPlanTemplate"
        >
          <ion-icon slot="start" :icon="navigateOutline" />
          {{ t('auto.route_speech_use_template') }}
        </ion-button>
        <p v-if="speechError" class="speech-plan-error">{{ speechError }}</p>
      </ion-content>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive, computed, watch, nextTick } from 'vue';
import { StatusBar, Style } from '@capacitor/status-bar';
import { useRouter } from 'vue-router';
import { Preferences } from '@capacitor/preferences';
import { useI18n } from 'vue-i18n';
import { Geolocation } from '@capacitor/geolocation';
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
  IonSearchbar,
  IonSpinner,
  IonBadge,
  IonCard,
  IonCardHeader,
  IonCardContent,
  IonCardTitle,
  IonModal,
  IonInput,
  IonTextarea,
  IonItem,
  IonLabel,
  IonRadioGroup,
  IonRadio,
  IonSegment,
  IonSegmentButton,
  alertController,
  toastController,
  onIonViewWillEnter
} from '@ionic/vue';
import {
  addOutline,
  mapOutline,
  radioButtonOnOutline,
  arrowBackOutline,
  bicycleOutline,
  carOutline,
  walkOutline,
  pencilOutline,
  trashOutline,
  closeOutline,
  micOutline,
  navigateOutline
} from 'ionicons/icons';
import { scooterIcon } from '@/icons/scooter';
import { db, type Route } from '@/services/database';
import { getPocketbaseAuthorId } from '@/services/pocketbase';
import { DEFAULT_MAP_STYLE, MAP_STYLE_CONFIGS, type MapStyle } from '@/utils/mapStyles';
import { planRouteWithValhalla, traceRouteSummary, type ValhallaTraceSummary } from '@/services/valhalla';

type LatLonPoint = import('@/services/positionSmoothing').LatLonPoint;

declare global {
  interface Window {
    plugins?: {
      speechRecognition?: {
        isRecognitionAvailable: (success: (value: boolean) => void, error: () => void) => void;
        startListening: (
          success: (matches: string[]) => void,
          error: (reason: unknown) => void,
          options: { language?: string; matches?: number; prompt?: string; showPartial?: boolean; showPopup?: boolean }
        ) => void;
        hasPermission: (success: (value: boolean) => void, error: () => void) => void;
        requestPermission: (success: () => void, error: (reason: unknown) => void) => void;
      };
    };
  }
}
type Waypoint = import('@/services/database').Waypoint;

const router = useRouter();
const { t, locale } = useI18n();
const routes = ref<Route[]>([]);
const routeSearchQuery = ref('');
const isLoading = ref(true);
const ROUTE_FILTER_KEY = 'route_filter_mode';
type RouteFilterMode = 'all' | 'mine';
const routeFilterMode = ref<RouteFilterMode>('all');
const currentRouteAuthorId = ref<string | null>(null);
watch(routeFilterMode, (mode) => {
  void Preferences.set({ key: ROUTE_FILTER_KEY, value: mode });
});
const startRouteModalOpen = ref(false);
const newRouteName = ref('');
const newRouteMode = ref<Route['travelMode']>('car');
const editRouteModalOpen = ref(false);
const routeToEdit = ref<Route | null>(null);
const routeEditForm = reactive({
  name: '',
  description: '',
  travelMode: 'car' as Route['travelMode'],
  mapStyle: DEFAULT_MAP_STYLE as MapStyle
});
const isRouteEditValid = computed(() => routeEditForm.name.trim().length > 0);
const speechModalOpen = ref(false);
const speechListening = ref(false);
const planInProgress = ref(false);
const speechError = ref('');
const recognizedText = ref('');
const geocodedDestinationLabel = ref('');
const plannedRoute = ref<LatLonPoint[] | null>(null);
const plannedDestination = ref<LatLonPoint | null>(null);
const plannedSummary = ref<ValhallaTraceSummary | null>(null);
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
type NominatimResult = { lat: string; lon: string; display_name?: string };
const TRAVEL_MODE_CONFIGS: Array<{
  value: Route['travelMode'];
  icon: string;
  color: string;
}> = [
    { value: 'car', icon: carOutline, color: 'primary' },
    { value: 'pedestrian', icon: walkOutline, color: 'medium' },
    { value: 'bicycle', icon: bicycleOutline, color: 'success' },
    { value: 'motor_scooter', icon: scooterIcon, color: 'warning' }
  ];
const travelModeOptions = computed(() =>
  TRAVEL_MODE_CONFIGS.map((config) => ({
    ...config,
    label: getRouteModeLabel(config.value)
  }))
);
const mapStyleOptions = computed(() =>
  MAP_STYLE_CONFIGS.map((config) => ({
    value: config.value,
    label: t(config.labelKey)
  }))
);

const routePreviewPaths = ref<Record<number, string>>({});
const PREVIEW_WIDTH = 200;
const PREVIEW_HEIGHT = 110;
const SPEECH_PLAN_PREVIEW_WIDTH = 280;
const SPEECH_PLAN_PREVIEW_HEIGHT = 140;

onMounted(async () => {
  await loadRoutes();
  await refreshRouteFilterState();
});

// Reload routes when returning to this page
onIonViewWillEnter(async () => {
  await loadRoutes();
  await refreshRouteFilterState();
});

const loadRoutes = async () => {
  try {
    isLoading.value = true;
    routes.value = await db.getRoutes();
    await loadRoutePreviews(routes.value);
  } catch (error) {
    console.error('Error loading routes:', error);
  } finally {
    isLoading.value = false;
  }
};

const loadRoutePreviews = async (routeList: Route[]) => {
  const previews: Record<number, string> = {};
  await Promise.all(routeList.map(async (route) => {
    if (!route.id) return;
    try {
      const waypoints = await db.getWaypointsByRoute(route.id);
      const path = buildRoutePreviewPath(waypoints);
      if (path) {
        previews[route.id] = path;
      }
    } catch (error) {
      console.error('Error building route preview for', route.id, error);
    }
  }));
  routePreviewPaths.value = previews;
};

const refreshRouteFilterState = async () => {
  const stored = await Preferences.get({ key: ROUTE_FILTER_KEY });
  if (stored.value === 'mine' || stored.value === 'all') {
    routeFilterMode.value = stored.value;
  }
  currentRouteAuthorId.value = await getPocketbaseAuthorId();
};

const resolveRouteAuthorId = async () => {
  if (currentRouteAuthorId.value) {
    return currentRouteAuthorId.value;
  }
  currentRouteAuthorId.value = await getPocketbaseAuthorId();
  return currentRouteAuthorId.value;
};

const buildRoutePreviewPath = (waypoints: Waypoint[]): string => {
  const positionPoints = waypoints
    .filter((wp) => wp.type === 'position')
    .map(({ latitude, longitude }) => ({ latitude, longitude }));
  if (positionPoints.length === 0) return '';

  return buildSvgPathFromPoints(positionPoints, PREVIEW_WIDTH, PREVIEW_HEIGHT);
};

const buildSvgPathFromPoints = (points: LatLonPoint[], width: number, height: number): string => {
  if (!points.length) return '';

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  points.forEach(({ latitude, longitude }) => {
    if (latitude < minLat) minLat = latitude;
    if (latitude > maxLat) maxLat = latitude;
    if (longitude < minLon) minLon = longitude;
    if (longitude > maxLon) maxLon = longitude;
  });

  const latSpan = Math.max(maxLat - minLat, 0.0001);
  const lonSpan = Math.max(maxLon - minLon, 0.0001);

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const formattedSegments = points.map((point, index) => {
    const normalizedX = ((point.longitude - minLon) / lonSpan) * width;
    const normalizedY = height - ((point.latitude - minLat) / latSpan) * height;
    const x = clamp(normalizedX, 0, width);
    const y = clamp(normalizedY, 0, height);
    const prefix = index === 0 ? 'M' : 'L';
    return `${prefix} ${x.toFixed(1)} ${y.toFixed(1)}`;
  });

  return formattedSegments.join(' ');
};

const prepareStartRouteForm = () => {
  newRouteName.value = `Route ${new Date().toLocaleDateString()}`;
  newRouteMode.value = 'car';
};

const startNewRoute = () => {
  prepareStartRouteForm();
  startRouteModalOpen.value = true;
};

const cancelStartRoute = () => {
  startRouteModalOpen.value = false;
};

const confirmStartRoute = async () => {
  const name = newRouteName.value?.trim();
  if (!name) return;
  try {
    const authorId = await resolveRouteAuthorId();
    const routeId = await db.createRoute({
      name,
      startTime: new Date().toISOString(),
      isRecording: true,
      travelMode: newRouteMode.value,
      mapStyle: DEFAULT_MAP_STYLE,
      pb_author: authorId ?? null
    });
    startRouteModalOpen.value = false;
    router.push(`/routes/${routeId}/record`);
  } catch (error) {
    console.error('Error starting route:', error);
    const toast = await toastController.create({
      message: t('auto.fehler_beim_starten_der_aufzeichnung'),
      duration: 2000,
      color: 'danger'
    });
    await toast.present();
  }
};

const openSpeechPlanModal = async () => {
  resetSpeechPlanState();
  speechModalOpen.value = true;
  await nextTick();
  void startSpeechRecognition();
};

const closeSpeechPlanModal = () => {
  speechModalOpen.value = false;
  resetSpeechPlanState();
};

const resetSpeechPlanState = () => {
  speechListening.value = false;
  planInProgress.value = false;
  speechError.value = '';
  recognizedText.value = '';
  geocodedDestinationLabel.value = '';
  plannedRoute.value = null;
  plannedDestination.value = null;
  plannedSummary.value = null;
};

const startSpeechRecognition = async () => {
  if (speechListening.value || planInProgress.value) {
    return;
  }
  speechError.value = '';
  speechListening.value = true;
  try {
    const transcript = await transcribeSpeech();
    if (!transcript?.trim()) {
      throw new Error(t('auto.route_speech_plan_failed'));
    }
    recognizedText.value = transcript.trim();
    await planRouteFromText(transcript);
  } catch (error) {
    speechError.value = (error as Error)?.message ?? t('auto.route_speech_plan_failed');
  } finally {
    speechListening.value = false;
  }
};

const planRouteFromText = async (text: string) => {
  planInProgress.value = true;
  try {
    const geocode = await geocodeDestination(text);
    geocodedDestinationLabel.value = geocode.display_name ?? text;
    const startPoint = await requestCurrentPosition();
    const destinationPoint: LatLonPoint = {
      latitude: Number(geocode.lat),
      longitude: Number(geocode.lon)
    };
    plannedDestination.value = destinationPoint;
    const route = await planRouteWithValhalla(startPoint, destinationPoint);
    if (route && route.length > 0) {
      plannedRoute.value = route;
      plannedSummary.value = await traceRouteSummary(route);
    } else {
      plannedRoute.value = [startPoint, destinationPoint];
      plannedSummary.value = null;
    }
  } finally {
    planInProgress.value = false;
  }
};

const geocodeDestination = async (query: string): Promise<NominatimResult> => {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('q', query);
  const headers: Record<string, string> = {
    'Accept-Language': (locale.value ?? 'de-DE').replace('_', '-'),
    Referer: 'https://dietl.mobi'
  };
  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    throw new Error(t('auto.route_speech_plan_failed'));
  }
  const data = (await response.json()) as NominatimResult[];
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(t('auto.route_speech_plan_failed'));
  }
  return data[0];
};

const requestCurrentPosition = async (): Promise<LatLonPoint> => {
  const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude
  };
};

const useSpeechPlanTemplate = () => {
  newRouteName.value = recognizedText.value?.trim() || t('auto.route');
  startRouteModalOpen.value = true;
  closeSpeechPlanModal();
};

const transcribeSpeech = async (): Promise<string> => {
  const plugin = window.plugins?.speechRecognition;
  if (plugin && typeof plugin.startListening === 'function') {
    const hasPermission = await new Promise<boolean>((resolve) =>
      plugin.hasPermission((result: boolean) => resolve(result), () => resolve(false))
    );
    if (!hasPermission) {
      await new Promise<void>((resolve, reject) => plugin.requestPermission(resolve, reject));
    }
    const matches: string[] = await new Promise((resolve, reject) => {
      plugin.startListening(
        (results: string[]) => resolve(results),
        (error: unknown) => reject(error),
        {
          language: (locale.value ?? 'de-DE').replace('_', '-'),
          matches: 1,
          showPopup: true,
          showPartial: false
        }
      );
    });
    return (matches[0] ?? '').trim();
  }

  const WebSpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
  if (!WebSpeechRecognition) {
    throw new Error(t('auto.route_speech_not_supported'));
  }

  return new Promise<string>((resolve, reject) => {
    const recognition = new WebSpeechRecognition();
    recognition.lang = (locale.value ?? 'de-DE').replace('_', '-');
    recognition.maxAlternatives = 1;
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event: any) => {
      recognition.stop();
      const transcript = event.results?.[0]?.[0]?.transcript?.trim() ?? '';
      resolve(transcript);
    };
    recognition.onerror = (event: any) => {
      recognition.stop();
      reject(new Error(event.error || t('auto.route_speech_plan_failed')));
    };
    recognition.start();
  });
};

const openRoute = (routeId: number) => {
  router.push(`/routes/${routeId}`);
};

const openEditRouteModal = (route: Route) => {
  routeToEdit.value = route;
  routeEditForm.name = route.name;
  routeEditForm.description = route.description ?? '';
  routeEditForm.travelMode = route.travelMode ?? 'car';
  routeEditForm.mapStyle = route.mapStyle ?? DEFAULT_MAP_STYLE;
  editRouteModalOpen.value = true;
};

const closeEditRouteModal = () => {
  editRouteModalOpen.value = false;
  routeToEdit.value = null;
};

const saveRouteEdits = async () => {
  if (!routeToEdit.value) return;
  const name = routeEditForm.name.trim();
  if (!name) return;
  const updates: Partial<Route> = {
    name,
    description: routeEditForm.description.trim() || undefined,
    travelMode: routeEditForm.travelMode,
    mapStyle: routeEditForm.mapStyle
  };

  await db.updateRoute(routeToEdit.value.id!, updates);
  await loadRoutes();
  closeEditRouteModal();

  const toast = await toastController.create({
    message: t('auto.route_aktualisiert'),
    duration: 2000,
    color: 'success'
  });
  await toast.present();
};

const confirmDeleteRoute = async (route: Route) => {
  const alert = await alertController.create({
    header: t('auto.route_löschen'),
    message: t('auto.möchtest_du_diese_route_wirklich_löschen_diese_aktion_kann_n'),
    buttons: [
      {
        text: t('auto.abbrechen'),
        role: 'cancel'
      },
      {
        text: t('auto.route_löschen'),
        role: 'destructive',
        handler: async () => {
          await db.deleteRoute(route.id!);
          await loadRoutes();

          const toast = await toastController.create({
            message: t('auto.route_gelöscht'),
            duration: 2000,
            color: 'danger'
          });
          await toast.present();
        }
      }
    ]
  });

  await alert.present();
};

const formatDistance = (meters: number): string => {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
};

const getRouteModeIcon = (mode: Route['travelMode'] | undefined) => {
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
};

const getRouteModeLabel = (mode: Route['travelMode'] | undefined) => {
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
};

const getRouteModeColor = (mode: Route['travelMode'] | undefined) => {
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
};

const filteredRoutes = computed(() => {
  const baseList = routeFilterMode.value === 'mine' && currentRouteAuthorId.value
    ? routes.value.filter(route => route.pb_author === currentRouteAuthorId.value)
    : routeFilterMode.value === 'mine'
      ? []
      : routes.value;
  const query = routeSearchQuery.value.trim().toLowerCase();
  if (!query) {
    return baseList;
  }
  return baseList.filter((route) => {
    const haystack = [
      route.name ?? '',
      route.description ?? '',
      getRouteModeLabel(route.travelMode)
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
});

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  return `${minutes} min`;
};

const planSummaryDistance = computed(() => {
  if (!plannedSummary.value?.length) return '';
  return formatDistance(plannedSummary.value.length);
});

const planSummaryDuration = computed(() => {
  if (!plannedSummary.value?.time) return '';
  return formatDuration(plannedSummary.value.time);
});

const speechPlanPreviewPath = computed(() => {
  if (!plannedRoute.value || plannedRoute.value.length < 2) {
    return '';
  }
  return buildSvgPathFromPoints(plannedRoute.value, SPEECH_PLAN_PREVIEW_WIDTH, SPEECH_PLAN_PREVIEW_HEIGHT);
});

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
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
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2rem;
  text-align: center;
}

.routes-search {
  margin: 0 0 12px;
}

.empty-icon {
  font-size: 96px;
  margin-bottom: 1rem;
  color: var(--ion-color-medium);
}

.empty-state h2 {
  margin-bottom: 0.5rem;
  color: var(--ion-text-color);
}

.empty-state p {
  margin-bottom: 2rem;
  color: var(--ion-color-medium);
}

.routes-content {
  --padding-bottom: calc(var(--ion-safe-area-bottom) + 84px);
}

.routes-list-wrapper {
  padding: 0 1rem 1.25rem 0;
}

.routes-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0;
}

.routes-filter {
  margin: 0 0 16px;
  border-radius: 12px;
  padding: 0;
  --padding-start: 0;
  --padding-end: 0;
}

.routes-filter ion-segment-button {
  font-size: 0.85rem;
  text-transform: none;
}

.route-card {
  border-radius: 1.25rem;
  background: var(--ion-color-step-50);
  box-shadow: 0 16px 30px rgba(0, 0, 0, 0.08);
  border: 0;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  position: relative;
  overflow: hidden;
}

.route-card:focus-visible,
.route-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 20px 34px rgba(0, 0, 0, 0.12);
}

.route-card-background {
  position: absolute;
  inset: 0;
  opacity: 0.2;
  pointer-events: none;
}

.route-card-background svg {
  width: 100%;
  height: 100%;
}

.route-card-background path {
  stroke: rgba(60, 60, 60, 0.5);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}

.route-card-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem 0.25rem;
}

.route-status-icon {
  font-size: 1.75rem;
}

.route-card-titles {
  flex: 1;
}

.route-card-title,
.route-description {
  margin: 0;
}

.route-description {
  font-size: 0.95rem;
  color: var(--ion-color-medium);
  margin-top: 0.15rem;
}

.route-mode-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  color: var(--ion-color-medium);
  margin-top: 0.25rem;
}

.route-mode-chip ion-icon {
  font-size: 1.1rem;
}

.route-badge {
  margin-left: auto;
}

.route-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding: 0 1.25rem 0.25rem;
  font-size: 0.85rem;
  color: var(--ion-color-medium);
}

.route-meta span::before {
  content: '• ';
  margin-right: 0.25rem;
}

.route-meta span:first-child::before {
  display: none;
}

.route-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 0 1.25rem 1rem;
}

.start-route-modal .modal-description {
  margin: 0 0 1rem;
  font-size: 0.9rem;
  color: var(--ion-color-medium);
}

.start-route-modal ion-item {
  border-radius: 14px;
  margin-bottom: 0.75rem;
}

.start-route-modal .modal-label {
  margin-top: 1rem;
  margin-bottom: 0.5rem;
  font-size: 0.85rem;
  color: var(--ion-color-medium);
}

.start-route-modal ion-radio-group ion-item {
  border-radius: 12px;
  margin-bottom: 0.5rem;
}

.modal-actions {
  margin-top: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.route-edit-modal {
  --ion-background-color: var(--ion-color-step-100);
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
.speech-plan-modal .speech-plan-instruction {
  margin-bottom: 1rem;
  font-size: 0.95rem;
  color: var(--ion-color-medium);
}

.speech-plan-modal .speech-plan-recognized {
  margin-bottom: 0.25rem;
  font-weight: 600;
}

.speech-plan-modal .speech-plan-destination {
  margin-bottom: 1rem;
  font-size: 0.9rem;
  color: var(--ion-color-medium);
}

.speech-plan-modal .speech-plan-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  color: var(--ion-color-medium);
}

.speech-plan-modal .speech-plan-preview {
  height: 140px;
  margin-bottom: 1rem;
  border-radius: 18px;
  background: var(--ion-color-step-80);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ion-color-step-90);
}

.speech-plan-modal .speech-plan-preview svg {
  width: 100%;
  height: 100%;
}

.speech-plan-modal .speech-plan-preview path {
  stroke: #ff7a18;
  stroke-width: 4;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.speech-plan-modal .speech-plan-summary {
  margin-bottom: 1.25rem;
  padding: 1rem;
  border-radius: 12px;
  background: var(--ion-color-step-50);
}

.speech-plan-modal .speech-plan-summary h3 {
  margin: 0 0 0.35rem;
  font-size: 1rem;
}

.speech-plan-modal .speech-plan-error {
  margin-top: 1rem;
  color: var(--ion-color-danger);
}
</style>
