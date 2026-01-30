<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/" />
        </ion-buttons>
        <ion-title>{{ $t('auto.einstellungen') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div class="settings-container ion-padding">

        <div class="settings-section">
          <h2>{{ $t('auto.sprache') }}</h2>
          <ion-list>
            <ion-item>
              <ion-label position="stacked">
                <strong>{{ t('settings.chooseLanguage') }}</strong>
              </ion-label>
              <ion-select v-model="selectedLocale" interface="popover" @ionChange="changeLocale">
                <ion-select-option value="de">{{ t('languageNames.de') }}</ion-select-option>
                <ion-select-option value="en">{{ t('languageNames.en') }}</ion-select-option>
                <ion-select-option value="it">{{ t('languageNames.it') }}</ion-select-option>
                <ion-select-option value="fr">{{ t('languageNames.fr') }}</ion-select-option>
                <ion-select-option value="bar">{{ t('languageNames.bar') }}</ion-select-option>
              </ion-select>
            </ion-item>
          </ion-list>

        </div>

        <div class="settings-section">
          <h2>{{ $t('auto.pocketbase_backend') }}</h2>
          <p class="section-description">
            {{ $t('auto.konfiguriere_die_verbindung_zu_deinem_pocketbase_server_für_') }}
          </p>

          <ion-list>
            <ion-item>
              <ion-label position="stacked">
                <strong>{{ $t('auto.server_url') }}</strong>
                <p>{{ $t('auto.z_b_https_deine_domain_com_oder_http_localhost_8090') }}</p>
              </ion-label>
              <ion-input
                v-model="settings.pocketbaseUrl"
                type="url"
                placeholder="https://example.com"
                clear-input
                @ionBlur="validateUrl"
              />
            </ion-item>

            <ion-item v-if="urlError">
              <ion-label color="danger">
                <p>{{ urlError }}</p>
              </ion-label>
            </ion-item>

            <ion-item>
              <ion-label position="stacked">
                <strong>{{ $t('auto.email_optional') }}</strong>
              </ion-label>
              <ion-input
                v-model="settings.email"
                type="email"
                placeholder="deine@email.com"
                clear-input
              />
            </ion-item>

            <ion-item lines="none">
              <ion-label position="stacked">
                <strong>{{ $t('auto.passwort_optional') }}</strong>
              </ion-label>
              <ion-input
                v-model="settings.password"
                type="password"
                placeholder="••••••••"
                clear-input
              />
            </ion-item>
          </ion-list>

          <div class="button-group ion-margin-top">
            <ion-button expand="block" @click="testConnection" :disabled="!settings.pocketbaseUrl || isTesting">
              <ion-spinner v-if="isTesting" slot="start" />
              <ion-icon v-else :icon="flash" slot="start" />
              {{ $t('auto.verbindung_testen') }}
            </ion-button>

            <ion-button 
              v-if="settings.email && settings.password" 
              expand="block" 
              fill="outline"
              @click="authenticateUser"
              :disabled="isAuthenticating"
            >
              <ion-spinner v-if="isAuthenticating" slot="start" />
              <ion-icon v-else :icon="lockClosed" slot="start" />
              {{ $t('auto.anmelden') }}
            </ion-button>
          </div>

          <!-- Connection Status -->
          <ion-card v-if="connectionStatus" :color="connectionStatus.color" class="status-card">
            <ion-card-content>
              <div class="status-content">
                <ion-icon :icon="connectionStatus.icon" size="large" />
                <div>
                  <strong>{{ connectionStatus.title }}</strong>
                  <p>{{ connectionStatus.message }}</p>
                </div>
              </div>
            </ion-card-content>
          </ion-card>

          <!-- Sync Info -->
          <ion-card v-if="settings.pocketbaseUrl && lastSyncTime" class="info-card">
            <ion-card-content>
              <p class="sync-info">
                <ion-icon :icon="timeOutline" />
                Letzte Synchronisation: {{ formatSyncTime(lastSyncTime) }}
              </p>
            </ion-card-content>
          </ion-card>
        </div>

        <!-- Storage Settings -->
        <div class="settings-section">
          <h2>{{ $t('auto.speicher') }}</h2>
          <ion-list>
            <ion-item>
              <ion-label>
                <h3>{{ $t('auto.lokale_datenbank') }}</h3>
                <p>SQLite ({{ isWebPlatform ? 'In-Memory' : 'Native' }})</p>
              </ion-label>
            </ion-item>

            <ion-item>
              <ion-toggle v-model="settings.autoSync" @ionChange="saveSettings">
                <ion-label>
                  <h3>{{ $t('auto.auto_synchronisation') }}</h3>
                  <p>{{ $t('auto.automatisch_mit_pocketbase_synchronisieren') }}</p>
                </ion-label>
              </ion-toggle>
            </ion-item>
            <ion-item>
              <ion-toggle v-model="settings.syncOnlyOnWifi" @ionChange="saveSettings">
                <ion-label>
                  <h3>{{ $t('settings.sync_only_on_wifi') }}</h3>
                  <p>{{ $t('settings.sync_only_on_wifi_desc') }}</p>
                </ion-label>
              </ion-toggle>
            </ion-item>
          </ion-list>
        </div>

        <!-- App Info -->
        <div class="settings-section">
          <h2>{{ $t('auto.app_info') }}</h2>
          <ion-list>
            <ion-item>
              <ion-label>
                <p>{{ $t('auto.version') }}</p>
                <h3>0.0.1</h3>
              </ion-label>
            </ion-item>
            <ion-item>
              <ion-label>
                <p>{{ $t('auto.plattform') }}</p>
                <h3>{{ platform }}</h3>
              </ion-label>
            </ion-item>
          </ion-list>
        </div>

        <!-- Save Button -->
        <div class="settings-section">
          <h2>{{ $t('auto.sprache') }}</h2>
          <ion-list>
            <ion-item>
              <ion-label position="stacked">
                <strong>{{ t('settings.chooseLanguage') }}</strong>
              </ion-label>
              <ion-select v-model="selectedLocale" interface="popover" @ionChange="changeLocale">
                <ion-select-option value="de">{{ t('languageNames.de') }}</ion-select-option>
                <ion-select-option value="en">{{ t('languageNames.en') }}</ion-select-option>
                <ion-select-option value="it">{{ t('languageNames.it') }}</ion-select-option>
                <ion-select-option value="fr">{{ t('languageNames.fr') }}</ion-select-option>
                <ion-select-option value="bar">{{ t('languageNames.bar') }}</ion-select-option>
              </ion-select>
            </ion-item>
          </ion-list>
        </div>

        <ion-button expand="block" @click="saveSettings" :disabled="isSaving" class="save-button">
          <ion-spinner v-if="isSaving" slot="start" />
          <ion-icon v-else :icon="save" slot="start" />
          {{ t('settings.save') }}
        </ion-button>

        <ion-button @click="testGPSExtraction">{{ $t('auto.test_gps_extraction') }}</ion-button>
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
  IonBackButton,
  IonList,
  IonItem,
  IonSelect,
  IonSelectOption,
  IonLabel,
  IonInput,
  IonButton,
  IonIcon,
  IonToggle,
  IonCard,
  IonCardContent,
  IonSpinner,
  toastController
} from '@ionic/vue';
import { save, flash, lockClosed, checkmarkCircle, closeCircle, warning, timeOutline } from 'ionicons/icons';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { useI18n } from 'vue-i18n';
import i18n from '@/i18n/i18n';
import PocketBase from 'pocketbase';
import { usePocketbaseSync } from '@/composables/usePocketbaseSync';
import { extractGPSFromSpecificPath } from '@/services/exif';

const router = useRouter();

const settings = ref({
  pocketbaseUrl: '',
  email: '',
  password: '',
  autoSync: false,
  syncOnlyOnWifi: false
});

const urlError = ref('');
const isTesting = ref(false);
const isSaving = ref(false);
const isAuthenticating = ref(false);
const connectionStatus = ref<{
  title: string;
  message: string;
  color: string;
  icon: string;
} | null>(null);

const { lastSyncTime } = usePocketbaseSync();

const platform = Capacitor.getPlatform();
const isWebPlatform = platform === 'web';
  const { locale, t } = useI18n({ useScope: 'global' });
const selectedLocale = ref<string>(locale.value ?? 'de');

onMounted(async () => {
  await loadSettings();
  selectedLocale.value = locale.value ?? 'de';
});

const loadSettings = async () => {
  try {
    const [url, email, autoSync, syncOnlyOnWifi] = await Promise.all([
        Preferences.get({ key: 'pocketbase_url' }),
        Preferences.get({ key: 'pocketbase_email' }),
        Preferences.get({ key: 'auto_sync' }),
        Preferences.get({ key: 'sync_only_on_wifi' })
      ]);

    if (url.value) settings.value.pocketbaseUrl = url.value;
    if (email.value) settings.value.email = email.value;
    if (autoSync.value) settings.value.autoSync = autoSync.value === 'true';
    if (syncOnlyOnWifi.value) settings.value.syncOnlyOnWifi = syncOnlyOnWifi.value === 'true';
  } catch (error) {
    console.error('Error loading settings:', error);
  }
};

const validateUrl = () => {
  urlError.value = '';
  
  if (!settings.value.pocketbaseUrl) return;

  try {
    const url = new URL(settings.value.pocketbaseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      urlError.value = 'URL muss mit http:// oder https:// beginnen';
    }
  } catch (error) {
    urlError.value = 'Ungültige URL';
  }
};

const testConnection = async () => {
  if (!settings.value.pocketbaseUrl) return;

  isTesting.value = true;
  connectionStatus.value = null;

  try {
    const pb = new PocketBase(settings.value.pocketbaseUrl);
    const health = await pb.health.check();

    connectionStatus.value = {
      title: 'Verbindung erfolgreich',
      message: `Server ist erreichbar (Code: ${health.code})`,
      color: 'success',
      icon: checkmarkCircle
    };
  } catch (error) {
    console.error('Connection test failed:', error);
    connectionStatus.value = {
      title: 'Verbindung fehlgeschlagen',
      message: error instanceof Error ? error.message : 'Server nicht erreichbar',
      color: 'danger',
      icon: closeCircle
    };
  } finally {
    isTesting.value = false;
  }
};

const authenticateUser = async () => {
  if (!settings.value.pocketbaseUrl || !settings.value.email || !settings.value.password) {
    return;
  }

  isAuthenticating.value = true;

  try {
    const pb = new PocketBase(settings.value.pocketbaseUrl);
    await pb.collection('users').authWithPassword(
      settings.value.email,
      settings.value.password
    );

    // Store auth token
    await Preferences.set({
      key: 'pocketbase_token',
      value: pb.authStore.token
    });

    connectionStatus.value = {
      title: 'Anmeldung erfolgreich',
      message: `Angemeldet als ${settings.value.email}`,
      color: 'success',
      icon: checkmarkCircle
    };

    const toast = await toastController.create({
      message: 'Erfolgreich angemeldet',
      duration: 2000,
      color: 'success',
      position: 'bottom'
    });
    await toast.present();
  } catch (error) {
    console.error('Authentication failed:', error);
    connectionStatus.value = {
      title: 'Anmeldung fehlgeschlagen',
      message: error instanceof Error ? error.message : 'Falsche Anmeldedaten',
      color: 'danger',
      icon: closeCircle
    };
  } finally {
    isAuthenticating.value = false;
  }
};

const saveSettings = async () => {
  validateUrl();
  if (urlError.value) return;

  isSaving.value = true;

  try {
    await Promise.all([
      Preferences.set({ key: 'pocketbase_url', value: settings.value.pocketbaseUrl }),
      Preferences.set({ key: 'pocketbase_email', value: settings.value.email }),
      Preferences.set({ key: 'auto_sync', value: settings.value.autoSync.toString() }),
      Preferences.set({ key: 'sync_only_on_wifi', value: settings.value.syncOnlyOnWifi.toString() })
    ]);

    const toast = await toastController.create({
      message: t('settings.save'),
      duration: 2000,
      color: 'success',
      position: 'bottom'
    });
    await toast.present();

    // Optional: Redirect back after save
    setTimeout(() => router.back(), 1000);
  } catch (error) {
    console.error('Error saving settings:', error);
    const toast = await toastController.create({
      message: 'Fehler beim Speichern',
      duration: 2000,
      color: 'danger',
      position: 'bottom'
    });
    await toast.present();
  } finally {
    isSaving.value = false;
  }
};

const changeLocale = async (eventOrValue: any) => {
  try {
    // support: IonChange event (event.detail.value), plain string, or a Ref ({ value: 'de' })
    let value: string | undefined;
    if (eventOrValue && eventOrValue.detail && eventOrValue.detail.value !== undefined) value = eventOrValue.detail.value;
    else if (typeof eventOrValue === 'string') value = eventOrValue;
    else if (eventOrValue && eventOrValue.value !== undefined) value = eventOrValue.value;
    if (!value) return;
    // update both the local `useI18n` ref and the global i18n instance
    locale.value = value;
    // @ts-ignore - global locale is a Ref
    i18n.global.locale.value = value;
    selectedLocale.value = value;
    await Preferences.set({ key: 'locale', value });
    const toast = await toastController.create({
      message: 'Sprache gespeichert',
      duration: 1500,
      position: 'bottom'
    });
    await toast.present();
  } catch (e) {
    console.error('Failed to change locale', e);
  }
};

const formatSyncTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} Minute${minutes > 1 ? 'n' : ''}`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Stunde${hours > 1 ? 'n' : ''}`;
  
  const days = Math.floor(hours / 24);
  return `vor ${days} Tag${days > 1 ? 'en' : ''}`;
};

// --- GPS Extraction Test Button ---
const testGPSExtraction = async () => {
  console.log(await extractGPSFromSpecificPath('/sdcard/SdCardBackUp/DCIM/Camera/20240331_132252.jpg'));
  // Beispiel: await extractGPSFromSpecificPath('/sdcard/SdCardBackUp/DCIM/Camera/20240331_132252.jpg');
};
</script>

<style scoped>
.settings-container {
  max-width: 800px;
  margin: 0 auto;
}

.settings-section {
  margin-bottom: 2rem;
}

.settings-section h2 {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0 0 0.5rem 0;
  color: var(--ion-color-dark);
}

.section-description {
  color: var(--ion-color-medium);
  margin: 0 0 1rem 0;
  font-size: 0.95rem;
  line-height: 1.5;
}

.settings-section ion-list {
  margin: 1rem 0;
  border-radius: 12px;
  overflow: hidden;
}

.button-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.status-card {
  margin-top: 1rem;
}

.status-content {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.status-content ion-icon {
  flex-shrink: 0;
}

.status-content p {
  margin: 0.25rem 0 0 0;
  font-size: 0.9rem;
}

.info-card {
  margin-top: 1rem;
}

.sync-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 0.9rem;
  color: var(--ion-color-medium);
}

.sync-info ion-icon {
  font-size: 1rem;
}

.save-button {
  margin-top: 2rem;
  margin-bottom: 2rem;
}

ion-item ion-label p {
  margin-top: 0.25rem;
  font-size: 0.9rem;
  color: var(--ion-color-medium);
}

ion-item ion-label h3 {
  margin: 0.5rem 0 0 0;
  font-weight: 600;
}

ion-button {
  margin-bottom: 0.5rem;
}
</style>


