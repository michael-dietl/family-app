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

const app = createApp(App)
  .use(IonicVue)
  .use(router);

router.isReady().then(async () => {
  // Set app status bar color to match the light orange theme (Android/iOS where supported)
  try {
    await StatusBar.setBackgroundColor({ color: '#FF7A18' });
    await StatusBar.setStyle({ style: Style.Dark });
  } catch (e) {
    // ignore if not supported in current environment
    // console.debug('StatusBar not available', e);
  }
  app.mount('#app');
});
