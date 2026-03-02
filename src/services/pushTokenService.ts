import { Capacitor } from '@capacitor/core';
import { PushNotifications, type PushNotificationSchema } from '@capacitor/push-notifications';
import { Preferences } from '@capacitor/preferences';
import { pocketbase } from '@/services/pocketbase';
import { scheduleLocalNotification } from '@/services/pushNotificationService';

const TOKEN_COLLECTION = 'device_tokens';
const STORED_TOKEN_KEY = 'fcm_token';
const PENDING_TOKEN_KEY = 'pending_fcm_token';
const isNativePlatform = ['android', 'ios'].includes(Capacitor.getPlatform());

let listenersRegistered = false;
let registering = false;

const getCurrentUserId = (): string | null => {
  const pb = pocketbase.getInstance();
  const model = pb?.authStore?.model as { id?: string } | null;
  return model?.id ?? null;
};

const buildTokenPayload = (token: string) => {
  const userId = getCurrentUserId();
  const platform = Capacitor.getPlatform();
  return {
    token,
    platform,
    userId
  };
};

const upsertTokenInPocketbase = async (token: string) => {
  const pb = pocketbase.getInstance();
  if (!pb || !pocketbase.isAuthenticated()) {
    await Preferences.set({ key: PENDING_TOKEN_KEY, value: token });
    return;
  }

  const payload = buildTokenPayload(token);
  try {
    const existing = await pb.collection(TOKEN_COLLECTION).getFirstListItem(`token="${token}"`);
    await pb.collection(TOKEN_COLLECTION).update(existing.id, payload);
  } catch (error) {
    try {
      await pb.collection(TOKEN_COLLECTION).create(payload);
    } catch (createError) {
      console.warn('[push] could not store token in PocketBase', createError);
    }
  }
};

const handleRegistrationToken = async (token: string) => {
  if (!token) return;
  await Preferences.set({ key: STORED_TOKEN_KEY, value: token });
  await upsertTokenInPocketbase(token);
};

const parseNotification = (notification: PushNotificationSchema) => {
  const title = notification.title || String(notification.data?.title || 'Updates');
  const body = notification.body || String(notification.data?.body || notification.data?.message || 'Neue Änderungen');
  return { title, body };
};

export const initializePushNotifications = () => {
  if (!isNativePlatform || listenersRegistered) return;
  listenersRegistered = true;

  PushNotifications.addListener('registration', (token) => {
    void handleRegistrationToken(token.value);
  });

  PushNotifications.addListener('registrationError', (error) => {
    console.warn('[push] registration error', error);
  });

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    const { title, body } = parseNotification(notification);
    void scheduleLocalNotification(title, body);
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    console.debug('[push] action performed', action.actionId, action.notification?.data);
  });
};

export const ensurePushTokenRegistered = async () => {
  if (!isNativePlatform || registering) return;
  registering = true;
  try {
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') {
      console.debug('[push] permission denied');
      return;
    }

    await PushNotifications.register();

    const { value: pending } = await Preferences.get({ key: PENDING_TOKEN_KEY });
    if (pending) {
      await upsertTokenInPocketbase(pending);
      await Preferences.remove({ key: PENDING_TOKEN_KEY });
    }
  } catch (error) {
    console.warn('[push] token registration failed', error);
  } finally {
    registering = false;
  }
};
