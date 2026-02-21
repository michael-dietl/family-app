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

      <!-- Routes List -->
      <div v-else class="routes-list-wrapper">
        <ion-list class="routes-list" lines="none">
          <ion-card
            v-for="route in routes"
            :key="route.id"
            class="route-card"
            role="button"
            tabindex="0"
            @click="openRoute(route.id!)"
          >
            <ion-card-header class="route-card-header">
              <ion-icon
                :icon="route.isRecording ? radioButtonOnOutline : mapOutline"
                :color="route.isRecording ? 'danger' : 'primary'"
                class="route-status-icon"
              />
              <div class="route-card-titles">
                <ion-card-title class="route-card-title">{{ route.name }}</ion-card-title>
                <p v-if="route.description" class="route-description">
                  {{ route.description }}
                </p>
                <div class="route-mode-chip">
                  <ion-icon
                    :icon="getRouteModeIcon(route.travelMode)"
                    :color="getRouteModeColor(route.travelMode)"
                  />
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
              <ion-button
                size="small"
                fill="outline"
                color="danger"
                @click.stop="confirmDeleteRoute(route)"
              >
                <ion-icon slot="start" :icon="trashOutline" />
                {{ $t('auto.route_löschen') }}
      <ion-modal
        css-class="route-edit-modal"
        :is-open="editRouteModalOpen"
        :backdropDismiss="false"
        @didDismiss="closeEditRouteModal"
      >
        <ion-header translucent>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button fill="clear" color="medium" @click="closeEditRouteModal" aria-label="{{ t('auto.abbrechen') }}">
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
              <ion-input
                v-model="routeEditForm.name"
                placeholder="{{ t('auto.route') }}"
                clear-input
              ></ion-input>
            </ion-item>
            <ion-item>
              <ion-label position="stacked">{{ t('auto.beschreibung') }}</ion-label>
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
              </ion-button>
            </ion-card-content>
          </ion-card>
        </ion-list>
      </div>
    </ion-content>
      <ion-modal
        class="start-route-modal"
        :is-open="startRouteModalOpen"
        @didDismiss="cancelStartRoute"
        :backdropDismiss="true"
      >
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
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
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
  closeOutline
} from 'ionicons/icons';
import { scooterIcon } from '@/icons/scooter';
import { db, type Route } from '@/services/database';

const router = useRouter();
const { t } = useI18n();
const routes = ref<Route[]>([]);
const isLoading = ref(true);
const startRouteModalOpen = ref(false);
const newRouteName = ref('');
const newRouteMode = ref<Route['travelMode']>('car');
const editRouteModalOpen = ref(false);
const routeToEdit = ref<Route | null>(null);
const routeEditForm = reactive({
  name: '',
  description: '',
  travelMode: 'car' as Route['travelMode']
});
const isRouteEditValid = computed(() => routeEditForm.name.trim().length > 0);
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

onMounted(async () => {
  await loadRoutes();
});

// Reload routes when returning to this page
onIonViewWillEnter(async () => {
  await loadRoutes();
});

const loadRoutes = async () => {
  try {
    isLoading.value = true;
    routes.value = await db.getRoutes();
  } catch (error) {
    console.error('Error loading routes:', error);
  } finally {
    isLoading.value = false;
  }
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
    const routeId = await db.createRoute({
      name,
      startTime: new Date().toISOString(),
      isRecording: true,
      travelMode: newRouteMode.value
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

const openRoute = (routeId: number) => {
  router.push(`/routes/${routeId}`);
};

const openEditRouteModal = (route: Route) => {
  routeToEdit.value = route;
  routeEditForm.name = route.name;
  routeEditForm.description = route.description ?? '';
  routeEditForm.travelMode = route.travelMode ?? 'car';
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
    travelMode: routeEditForm.travelMode
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

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  return `${minutes} min`;
};

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
  padding: 0 1rem 1.25rem;
}

.routes-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0;
}

.route-card {
  border-radius: 1.25rem;
  background: var(--ion-color-step-50);
  box-shadow: 0 16px 30px rgba(0, 0, 0, 0.08);
  border: 0;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.route-card:focus-visible,
.route-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 20px 34px rgba(0, 0, 0, 0.12);
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
</style>
