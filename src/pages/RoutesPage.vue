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

    <ion-content :fullscreen="true">
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
      <ion-list v-else>
        <ion-item
          v-for="route in routes"
          :key="route.id"
          @click="openRoute(route.id!)"
          button
          detail
        >
          <ion-icon
            slot="start"
            :icon="route.isRecording ? radioButtonOnOutline : mapOutline"
            :color="route.isRecording ? 'danger' : 'primary'"
          />
          <ion-label>
            <h2>{{ route.name }}</h2>
            <p v-if="route.description">{{ route.description }}</p>
            <p class="route-info">
              <span v-if="route.distance">{{ formatDistance(route.distance) }}</span>
              <span v-if="route.duration">{{ formatDuration(route.duration) }}</span>
              <span>{{ formatDate(route.startTime) }}</span>
            </p>
          </ion-label>
          <ion-badge v-if="route.isRecording" color="danger" slot="end">
            {{ $t('auto.aufzeichnung_läuft') }}
          </ion-badge>
        </ion-item>
      </ion-list>

      <!-- FAB removed: use empty-state button to start a new route -->
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
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
  IonFab,
  IonFabButton,
  IonBadge,
  alertController,
  onIonViewWillEnter
} from '@ionic/vue';
import {
  addOutline,
  mapOutline,
  radioButtonOnOutline
  ,
  arrowBackOutline
} from 'ionicons/icons';
import { db, type Route } from '@/services/database';

const router = useRouter();
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

.route-info {
  display: flex;
  gap: 1rem;
  font-size: 0.85rem;
  color: var(--ion-color-medium);
}

.route-info span::before {
  content: '• ';
  margin-right: 0.25rem;
}

.route-info span:first-child::before {
  display: none;
}

</style>
