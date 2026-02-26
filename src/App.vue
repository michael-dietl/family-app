<template>
  <ion-app>
    <ion-router-outlet />
  </ion-app>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { IonApp, IonRouterOutlet } from '@ionic/vue';
import { db } from '@/services/database';
import router from './router';
import { alertController, toastController } from '@ionic/vue';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { NavigationBar } from '@capgo/capacitor-navigation-bar';
import i18n from '@/i18n/i18n';
import { StatusBar, Style } from '@capacitor/status-bar';

const handleHardwareBack = (ev: any) => {
  ev.detail.register(0, async (proceed: any) => {
    try {
      const path = router.currentRoute.value.path || '/';
      const isRoot = path === '/' || path === '/welcome' || path === '';

      if (!isRoot) {
        proceed();
        return;
      }

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

const safeStatusBarCall = async (action: () => Promise<void>) => {
  if (Capacitor.getPlatform() === 'web') return;
  try {
    await action();
  } catch (error) {
    console.debug('StatusBar plugin not available on this platform', error);
  }
};

onMounted(async () => {
  await safeStatusBarCall(() => StatusBar.setOverlaysWebView({ overlay: false }));
  await safeStatusBarCall(() => StatusBar.setStyle({ style: Style.Dark }));
  document.addEventListener('ionBackButton', handleHardwareBack as EventListener);

  try {
    await NavigationBar.setNavigationBarColor({
      color: '#FFFFFF',
      darkButtons: true
    });
  } catch (error) {
    console.warn('NavigationBar plugin not available:', error);
  }
});

onUnmounted(() => document.removeEventListener('ionBackButton', handleHardwareBack as EventListener));
</script>
