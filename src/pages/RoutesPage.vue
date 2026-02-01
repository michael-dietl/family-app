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

    <ion-content :fullscreen="true" class="routes-content">
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
              <ion-button size="small" fill="outline" @click.stop="editRoute(route)">
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
              </ion-button>
            </ion-card-content>
          </ion-card>
        </ion-list>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
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
  alertController,
  toastController,
  onIonViewWillEnter
} from '@ionic/vue';
import {
  addOutline,
  mapOutline,
  radioButtonOnOutline,
  arrowBackOutline,
  pencilOutline,
  trashOutline
} from 'ionicons/icons';
import { db, type Route } from '@/services/database';

const router = useRouter();
const { t } = useI18n();
const routes = ref<Route[]>([]);
const isLoading = ref(true);

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

const startNewRoute = async () => {
  const alert = await alertController.create({
    header: 'Neue Route',
    message: 'Möchtest du eine neue Routenaufzeichnung starten?',
    inputs: [
      {
        name: 'name',
        type: 'text',
        placeholder: 'Routenname',
        value: `Route ${new Date().toLocaleDateString()}`
      }
    ],
    buttons: [
      {
        text: 'Abbrechen',
        role: 'cancel'
      },
      {
        text: 'Starten',
        handler: async (data) => {
          if (data.name) {
            const routeId = await db.createRoute({
              name: data.name,
              startTime: new Date().toISOString(),
              isRecording: true
            });
            router.push(`/routes/${routeId}/record`);
          }
        }
      }
    ]
  });
  await alert.present();
};

const openRoute = (routeId: number) => {
  router.push(`/routes/${routeId}`);
};

const editRoute = async (route: Route) => {
  const alert = await alertController.create({
    header: t('auto.route_bearbeiten'),
    inputs: [
      {
        name: 'name',
        type: 'text',
        placeholder: t('auto.route'),
        value: route.name
      },
      {
        name: 'description',
        type: 'textarea',
        placeholder: t('auto.beschreibung'),
        value: route.description || ''
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
          if (!data.name?.trim()) {
            return false;
          }

          const updates: Partial<Route> = {
            name: data.name.trim(),
            description: data.description?.trim() ? data.description.trim() : null
          };

          await db.updateRoute(route.id!, updates);
          await loadRoutes();

          const toast = await toastController.create({
            message: t('auto.route_aktualisiert'),
            duration: 2000,
            color: 'success'
          });
          await toast.present();
        }
      }
    ]
  });

  await alert.present();
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
</style>
