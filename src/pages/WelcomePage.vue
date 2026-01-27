<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>dietl.mobi</ion-title>
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
          <ion-icon :icon="imagesOutline" size="large" color="primary" />
          <h1>Willkommen bei dietl.mobi</h1>
          <p>Verwalte deine Fotos, Videos und Weinkeller</p>
        </div>

        <ion-list class="feature-list">
          <ion-item button @click="navigateTo('/gallery')" lines="full">
            <ion-icon :icon="imagesOutline" slot="start" color="primary" />
            <ion-label>
              <h2>Galerien</h2>
              <p>Fotos und Videos verwalten</p>
            </ion-label>
            <ion-icon :icon="chevronForward" slot="end" />
          </ion-item>

          <ion-item button @click="navigateTo('/library')" lines="full">
            <ion-icon :icon="bookOutline" slot="start" color="secondary" />
            <ion-label>
              <h2>Bibliothek</h2>
              <p>Bücher per ISBN scannen und verwalten</p>
            </ion-label>
            <ion-icon :icon="chevronForward" slot="end" />
          </ion-item>

          <ion-item button @click="navigateTo('/map')" lines="full">
            <ion-icon :icon="mapOutline" slot="start" color="success" />
            <ion-label>
              <h2>Karte</h2>
              <p>Fotos auf der Karte anzeigen</p>
            </ion-label>
            <ion-icon :icon="chevronForward" slot="end" />
          </ion-item>

          <ion-item button @click="navigateTo('/routes')" lines="full">
            <ion-icon :icon="navigateOutline" slot="start" color="warning" />
            <ion-label>
              <h2>Routen</h2>
              <p>GPS-Routen aufzeichnen mit Wegpunkten</p>
            </ion-label>
            <ion-icon :icon="chevronForward" slot="end" />
          </ion-item>

          <ion-item button @click="navigateTo('/wine')" lines="full">
            <ion-icon :icon="wineOutline" slot="start" color="tertiary" />
            <ion-label>
              <h2>Weinkeller</h2>
              <p>Wein-Sammlung verwalten</p>
            </ion-label>
            <ion-icon :icon="chevronForward" slot="end" />
          </ion-item>
        </ion-list>

        <div class="sync-status ion-margin-top">
          <ion-card v-if="pocketbaseUrl">
            <ion-card-content>
              <div class="status-row">
                <ion-icon 
                  :icon="isConnected ? cloudDone : cloudOffline" 
                  :color="isConnected ? 'success' : 'danger'"
                />
                <div>
                  <p class="status-text">
                    <strong>{{ isConnected ? 'Verbunden' : 'Offline' }}</strong>
                  </p>
                  <p class="status-url">{{ pocketbaseUrl }}</p>
                </div>
              </div>
            </ion-card-content>
          </ion-card>
          
          <ion-button v-else expand="block" fill="outline" @click="goToSettings">
            <ion-icon :icon="cloudOffline" slot="start" />
            Backend konfigurieren
          </ion-button>
        </div>
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
  syncOutline
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
  justify-content: center;
}

.welcome-header {
  text-align: center;
  margin-bottom: 2rem;
}

.welcome-header ion-icon {
  font-size: 80px;
  margin-bottom: 1rem;
}

.welcome-header h1 {
  font-size: 2rem;
  font-weight: 700;
  margin: 0 0 0.5rem 0;
  color: var(--ion-color-dark);
}

.welcome-header p {
  color: var(--ion-color-medium);
  font-size: 1.1rem;
  margin: 0;
}

.feature-list {
  margin: 2rem 0;
  border-radius: 12px;
  overflow: hidden;
}

.feature-list ion-item {
  --padding-start: 1rem;
  --padding-end: 1rem;
  --min-height: 70px;
}

.feature-list ion-icon[slot="start"] {
  font-size: 32px;
  margin-right: 1rem;
}

.feature-list h2 {
  font-weight: 600;
  margin: 0 0 0.25rem 0;
}

.feature-list p {
  color: var(--ion-color-medium);
  font-size: 0.9rem;
  margin: 0;
}

.sync-status {
  margin-top: auto;
  padding-bottom: 2rem;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.status-row ion-icon {
  font-size: 32px;
  flex-shrink: 0;
}

.status-text {
  margin: 0 0 0.25rem 0;
  font-size: 1rem;
}

.status-url {
  margin: 0;
  font-size: 0.85rem;
  color: var(--ion-color-medium);
  word-break: break-all;
}
</style>
