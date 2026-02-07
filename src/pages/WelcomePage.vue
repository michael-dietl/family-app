<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ $t('auto.dietl_mobi') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button v-if="pocketbaseUrl" @click="manualSync" :disabled="isSyncing">
            <ion-spinner v-if="isSyncing" />
            <ion-icon v-else :icon="syncOutline" />
          </ion-button>
          <ion-button @click="goToSettings">
            <ion-icon :icon="settingsOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" class="ion-padding">
      <div class="welcome-container">
        <div class="welcome-header">
          <img src="/logo.svg" alt="dietl.mobi Logo" class="logo" />
          <h1>{{ $t('auto.dietl_mobi') }}</h1>
          <p>{{ $t('auto.deine_mobile_verwaltung') }}</p>
        </div>

        <ion-list class="feature-list">
          <ion-item button @click="navigateTo('/gallery')" lines="full">
            <ion-icon :icon="imagesOutline" slot="start" color="primary" />
            <ion-label>
              <h2>{{ $t('auto.galerien') }}</h2>
              <p>{{ $t('auto.fotos_und_videos_verwalten') }}</p>
            </ion-label>
            <ion-icon :icon="chevronForward" slot="end" />
          </ion-item>

          <ion-item button @click="navigateTo('/timeline')" lines="full">
            <ion-icon :icon="calendarOutline" slot="start" color="tertiary" />
            <ion-label>
              <h2>{{ $t('auto.timeline_title') }}</h2>
              <p>{{ $t('auto.timeline_gallery_hint') }}</p>
            </ion-label>
            <ion-icon :icon="chevronForward" slot="end" />
          </ion-item>

          <ion-item button @click="navigateTo('/library')" lines="full">
            <ion-icon :icon="bookOutline" slot="start" color="secondary" />
            <ion-label>
              <h2>{{ $t('auto.bibliothek') }}</h2>
              <p>{{ $t('auto.bücher_per_isbn_scannen_und_verwalten') }}</p>
            </ion-label>
            <ion-icon :icon="chevronForward" slot="end" />
          </ion-item>

          <ion-item button @click="navigateTo('/map')" lines="full">
            <ion-icon :icon="mapOutline" slot="start" color="success" />
            <ion-label>
              <h2>{{ $t('auto.karte') }}</h2>
              <p>{{ $t('auto.fotos_auf_der_karte_anzeigen') }}</p>
            </ion-label>
            <ion-icon :icon="chevronForward" slot="end" />
          </ion-item>

          <ion-item button @click="navigateTo('/routes')" lines="full">
            <ion-icon :icon="navigateOutline" slot="start" color="warning" />
            <ion-label>
              <h2>{{ $t('auto.routen') }}</h2>
              <p>{{ $t('auto.gps_routen_aufzeichnen_mit_wegpunkten') }}</p>
            </ion-label>
            <ion-icon :icon="chevronForward" slot="end" />
          </ion-item>

          <ion-item button @click="navigateTo('/wine')" lines="full">
            <ion-icon :icon="wineOutline" slot="start" color="tertiary" />
            <ion-label>
              <h2>{{ $t('auto.weinkeller') }}</h2>
              <p>{{ $t('auto.wein_sammlung_verwalten') }}</p>
            </ion-label>
            <ion-icon :icon="chevronForward" slot="end" />
          </ion-item>

          <ion-item button @click="navigateTo('/shopping')" lines="full">
            <ion-icon :icon="cartOutline" slot="start" color="primary" />
            <ion-label>
              <h2>{{ $t('auto.einkaufslisten') }}</h2>
              <p>{{ $t('auto.einkäufe_organisieren') }}</p>
            </ion-label>
            <ion-icon :icon="chevronForward" slot="end" />
          </ion-item>

          <ion-item button @click="navigateTo('/todo')" lines="full">
            <ion-icon :icon="checkboxOutline" slot="start" color="secondary" />
            <ion-label>
              <h2>{{ $t('auto.todo') }}</h2>
              <p>{{ $t('auto.aufgaben_verwalten') }}</p>
            </ion-label>
            <ion-icon :icon="chevronForward" slot="end" />
          </ion-item>
        </ion-list>
      </div>
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
  IonCard,
  IonCardContent,
  IonSpinner,
  toastController
} from '@ionic/vue';
import {
  settingsOutline,
  imagesOutline,
  mapOutline,
  wineOutline,
  bookOutline,
  navigateOutline,
  chevronForward,
  cloudDone,
  cloudOffline,
  syncOutline,
  cartOutline,
  checkboxOutline,
  calendarOutline
} from 'ionicons/icons';
import { Preferences } from '@capacitor/preferences';
import { usePocketbaseSync } from '@/composables/usePocketbaseSync';

const router = useRouter();
const pocketbaseUrl = ref('');
const isConnected = ref(false);
const { isSyncing, syncAll } = usePocketbaseSync();

onMounted(async () => {
  await loadSettings();
  await checkConnection();
});

const loadSettings = async () => {
  const { value } = await Preferences.get({ key: 'pocketbase_url' });
  if (value) {
    pocketbaseUrl.value = value;
  }
};

const checkConnection = async () => {
  if (!pocketbaseUrl.value) {
    isConnected.value = false;
    return;
  }

  try {
    const response = await fetch(`${pocketbaseUrl.value}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });
    isConnected.value = response.ok;
  } catch (error) {
    console.warn('PocketBase connection check failed:', error);
    isConnected.value = false;
  }
};

const navigateTo = (path: string) => {
  router.push(path);
};

const goToSettings = () => {
  router.push('/settings');
};

const manualSync = async () => {
  try {
    await syncAll();
    const toast = await toastController.create({
      message: 'Synchronisation abgeschlossen',
      duration: 2000,
      color: 'success',
      position: 'bottom'
    });
    await toast.present();
    await checkConnection();
  } catch (error) {
    console.error('Sync error:', error);
    const toast = await toastController.create({
      message: 'Synchronisation fehlgeschlagen',
      duration: 2000,
      color: 'danger',
      position: 'bottom'
    });
    await toast.present();
  }
};
</script>

<style scoped>
.welcome-container {
  max-width: 600px;
  margin: 0 auto;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding-top: 1rem;
}

.welcome-header {
  text-align: center;
  margin-bottom: 1.5rem;
}

.welcome-header .logo {
  width: 80px;
  height: 80px;
  margin-bottom: 0.5rem;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
}

.welcome-header h1 {
  font-size: 1.8rem;
  font-weight: 700;
  margin: 0 0 0.25rem 0;
  color: var(--ion-color-dark);
}

.welcome-header p {
  color: var(--ion-color-medium);
  font-size: 0.95rem;
  margin: 0;
}

.feature-list {
  margin: 0;
  border-radius: 12px;
  overflow: hidden;
  flex: 1;
}

.feature-list ion-item {
  --padding-start: 1rem;
  --padding-end: 1rem;
  --min-height: 60px;
}

.feature-list ion-icon[slot="start"] {
  font-size: 30px;
  margin-right: 0.75rem;
}

.feature-list h2 {
  font-weight: 600;
  margin: 0 0 0.2rem 0;
  font-size: 1.05rem;
}

.feature-list p {
  color: var(--ion-color-medium);
  font-size: 0.9rem;
  margin: 0;
}
</style>
