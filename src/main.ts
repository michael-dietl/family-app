import { createApp } from 'vue'
import App from './App.vue'
import router from './router';

import { IonicVue } from '@ionic/vue';

/* Core CSS required for Ionic components to work properly */
import '@ionic/vue/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';
import '@ionic/vue/css/typography.css';

/* Optional CSS utils that can be commented out */
import '@ionic/vue/css/padding.css';
import '@ionic/vue/css/float-elements.css';
import '@ionic/vue/css/text-alignment.css';
import '@ionic/vue/css/text-transformation.css';
import '@ionic/vue/css/flex-utils.css';
import '@ionic/vue/css/display.css';


/**
 * Ionic Dark Mode
 * -----------------------------------------------------
 * For more info, please see:
 * https://ionicframework.com/docs/theming/dark-mode
 */

/* Uncomment one of the dark mode palette imports below to enable dark mode.
  Default: do not import `dark.system.css` so the app does not automatically follow
  the device's color-scheme preference. This keeps the app in the light theme unless
  a `dark` class or `data-theme` is applied explicitly. */
/* @import '@ionic/vue/css/palettes/dark.always.css'; */
/* @import '@ionic/vue/css/palettes/dark.class.css'; */
// intentionally not importing dark.system.css to prevent auto dark-mode

/* Theme variables */
import './theme/variables.css';

/* Leaflet CSS for map component */
import 'leaflet/dist/leaflet.css';

import { StatusBar, Style } from '@capacitor/status-bar';
import i18n from '@/i18n/i18n';
import { Preferences } from '@capacitor/preferences';
import { applyTheme, loadTheme } from '@/services/theme';
import { usePocketbaseSync } from '@/composables/usePocketbaseSync';
import { useShareTarget } from '@/composables/useShareTarget';
import { ensureSharedStorageFoldersExist } from '@/services/storagePaths';


const app = createApp(App)
  .use(IonicVue)
  .use(router);

const pocketbaseSync = usePocketbaseSync();
useShareTarget();

const initializeLocale = async () => {
  // install i18n into the app first, then set the locale so the saved value is not overwritten
  app.use(i18n);
  try {
    const res = await Preferences.get({ key: 'locale' });
    const saved = res.value;
    if (saved) {
      // @ts-expect-error global locale ist ein Ref und wird dynamisch gesetzt
      i18n.global.locale.value = saved;
    } else if (typeof navigator !== 'undefined' && navigator.language) {
      const nav = navigator.language.split('-')[0];
      // @ts-expect-error global locale ist ein Ref und wird dynamisch gesetzt
      i18n.global.locale.value = nav;
    }
  } catch (e) {
    // ignore
  }
};


const initializeTheme = async () => {
  const savedTheme = await loadTheme();
  applyTheme(savedTheme);
};


/* ⬇️ GANZ WICHTIG: global.css MUSS HIER stehen */
import './global.css';

router.isReady().then(async () => {
  await ensureSharedStorageFoldersExist();
  await initializeLocale();
  await initializeTheme();
  // Set app status bar color to a lighter orange (Android/iOS where supported)
  app.mount('#app');

  await pocketbaseSync.subscribeToAllEntities();
  

  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Dark });
  } catch (e) {
    // ignore if not supported in current environment
  }

});
