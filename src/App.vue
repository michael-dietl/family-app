<template>
  <ion-app>
    <ion-router-outlet />
  </ion-app>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { IonApp, IonRouterOutlet } from '@ionic/vue';
import { db } from '@/services/database';
import router from './router';
import { onUnmounted } from 'vue';
import { alertController, toastController } from '@ionic/vue';
import { App as CapacitorApp } from '@capacitor/app';
import { NavigationBar } from '@capgo/capacitor-navigation-bar';
import i18n from '@/i18n/i18n';
import { StatusBar, Style } from '@capacitor/status-bar';


// Datenbank beim App-Start initialisieren
onMounted(async () => {

  StatusBar.setOverlaysWebView({ overlay: false });
  StatusBar.setStyle({ style: Style.Dark });
  try {
    await db.initialize();
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
  }
  // Hardware back handling: on root page ask before exit if a route recording is active
  const handler = (ev: any) => {
    ev.detail.register(0, async (proceed: any) => {
      try {
        const path = router.currentRoute.value.path || '/';
        const isRoot = path === '/' || path === '/welcome' || path === '';

        if (!isRoot) {
          // Not root - allow default navigation
          proceed();
          return;
        }

        // On root: check for active route recordings in DB
        let activeRecording = false;
        try {
          const routes = await db.getRoutes();
          activeRecording = (routes || []).some((r: any) => r.isRecording === true);
        } catch (e) {
          console.warn('Could not query routes for active recording check', e);
        }

        if (activeRecording) {
          const alert = await alertController.create({
            header: i18n.global.t('aufzeichnung-laeuft'),
            message: i18n.global.t('eine-routenaufzeichnung-laeuft-moechtest'),
            buttons: [
              { text: i18n.global.t('abbrechen'), role: 'cancel' },
              {
                text: i18n.global.t('im-hintergrund-weiterlaufen'),
                handler: async () => {
                  const toast = await toastController.create({
                    message: i18n.global.t('die-app-laeuft-weiter-druecke-home-um-si'),
                    duration: 2500,
                    position: 'bottom'
                  });
                  await toast.present();
                }
              },
              {
                text: i18n.global.t('beenden'),
                role: 'destructive',
                handler: async () => {
                  try {
                    await CapacitorApp.exitApp();
                  } catch (e) {
                    console.warn('exitApp failed', e);
                  }
                }
              }
            ]
          });
          await alert.present();
        } else {
          // No recording -> exit immediately
          try {
            await CapacitorApp.exitApp();
          } catch (e) {
            console.warn('exitApp failed', e);
          }
        }
      } catch (err) {
        console.error('Error in hardware back handler', err);
        proceed();
      }
    });
  };


  // Beispiel: Heller App-Farbton -> dunkle Buttons
  try {
    await NavigationBar.setNavigationBarColor({
      color: '#FFFFFF',
      darkButtons: true
    });
  } catch (error) {
    console.warn('NavigationBar plugin not available:', error);
  }

  document.addEventListener('ionBackButton', handler as EventListener);
  onUnmounted(() => document.removeEventListener('ionBackButton', handler as EventListener));
});
</script>
