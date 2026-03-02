import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type Visibility } from '@capacitor/local-notifications';
import type { UnsubscribeFunc } from 'pocketbase';
import { pocketbase } from '@/services/pocketbase';

const NOTIFICATION_CHANNEL_ID = 'pb-summary-updates';
const NOTIFICATION_COLLECTION = 'notifications';
const isNativePlatform = ['android', 'ios'].includes(Capacitor.getPlatform());
let channelConfigured = false;
let permissionGranted = false;

const buildSummaryParts = (source?: Record<string, unknown>): string[] => {
  if (!source) return [];
  const parts: string[] = [];
  const addCount = (value: unknown, label: string) => {
    if (value === undefined || value === null) return;
    const count = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(count) || count <= 0) return;
    parts.push(`${count} ${label}`);
  };

  addCount(source.todosCreated ?? source.todoItemsCreated ?? source.newTodoItems, 'neue ToDos');
  addCount(source.todoListsCreated ?? source.newTodoLists, 'neue ToDo-Listen');
  addCount(source.galleriesCreated ?? source.newGalleries, 'neue Galerien');
  addCount(source.photosCreated ?? source.newPhotos, 'neue Fotos');
  addCount(source.booksCreated ?? source.newBooks, 'neue Bücher');
  addCount(source.winesCreated ?? source.newWines, 'neue Weine');
  addCount(source.pendingChanges ?? source.changeCount, 'Änderungen');

  if (Array.isArray(source.details)) {
    source.details.forEach((item) => {
      if (typeof item === 'string' && item.trim().length > 0) {
        parts.push(item.trim());
      }
    });
  }

  return parts;
};

const formatNotificationSummary = (
  data?: Record<string, unknown>,
  title?: string,
  body?: string
): { title: string; body: string } => {
  const fallbackTitle = title || 'Updates';
  const fallbackBody = body || '';
  const recordParts = buildSummaryParts(data);
  const payloadMessage = data?.summary ?? data?.message ?? data?.body;
  const bodyParts = recordParts.length
    ? recordParts
    : payloadMessage && typeof payloadMessage === 'string'
      ? [payloadMessage]
      : [];
  const matchedBody = bodyParts.length > 0 ? bodyParts.join(', ') : fallbackBody;
  return {
    title: fallbackTitle,
    body: matchedBody || 'Neue Änderungen sind verfügbar'
  };
};

const ensureLocalNotificationChannel = async (): Promise<boolean> => {
  if (!isNativePlatform) return false;
  if (channelConfigured && permissionGranted) return true;

  try {
    const permission = await LocalNotifications.requestPermissions();
    permissionGranted = permission.display === 'granted';
  } catch (error) {
    console.warn('Local notification permission request failed', error);
    permissionGranted = false;
  }

  if (!permissionGranted) {
    return false;
  }

  try {
    await LocalNotifications.createChannel({
      id: NOTIFICATION_CHANNEL_ID,
      name: 'PocketBase Updates',
      importance: 4,
      visibility: 1 as Visibility,
      description: 'Zusammenfassungen der PocketBase-Änderungen'
    });
    channelConfigured = true;
  } catch (error) {
    console.warn('Could not configure notification channel', error);
    channelConfigured = false;
  }

  return channelConfigured;
};

export const scheduleLocalNotification = async (title: string, body: string) => {
  if (!isNativePlatform) return;
  const ready = await ensureLocalNotificationChannel();
  if (!ready) return;

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Date.now(),
          title,
          body,
          channelId: NOTIFICATION_CHANNEL_ID
        }
      ]
    });
  } catch (error) {
    console.warn('Unable to schedule local notification', error);
  }
};

let notificationSubscription: UnsubscribeFunc | null = null;

export const ensurePocketbaseNotificationSubscription = async (): Promise<void> => {
  const pb = pocketbase.getInstance();
  if (!pb || !pocketbase.isAuthenticated()) {
    return;
  }

  if (notificationSubscription) {
    await notificationSubscription();
    notificationSubscription = null;
  }

  try {
    notificationSubscription = await pb.collection(NOTIFICATION_COLLECTION).subscribe('create', (event) => {
      const { title, body } = formatNotificationSummary(event.record);
      void scheduleLocalNotification(title, body);
    });
  } catch (error) {
    console.warn('Could not subscribe to PocketBase notification collection', error);
  }
};

export const unsubscribePocketbaseNotificationSubscription = async (): Promise<void> => {
  if (!notificationSubscription) return;
  await notificationSubscription();
  notificationSubscription = null;
};
