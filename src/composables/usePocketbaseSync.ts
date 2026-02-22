
import { ref, reactive } from 'vue';
import { Capacitor } from '@capacitor/core';
import { pocketbase, getPocketbaseAuthorId, setPocketbaseAuthorId } from '@/services/pocketbase';
import { db, type Gallery, type Photo, type Book, type BookCategory, type ShoppingList, type ShoppingItem, type TodoList, type TodoItem, type Route, type Waypoint, type Wine, type WinePhoto, type WineCategory, type DeletedEntry } from '@/services/database';
import { Preferences } from '@capacitor/preferences';
import { toastController } from '@ionic/vue';
import type { UnsubscribeFunc } from 'pocketbase';
import { uploadFileToPocketBase } from '@/utils/pbFileUploadExample';
import { getBlobLongEdge, resizeImagePreservingExif } from '@/utils/imageCompression';
import {
  hideSyncProgress,
  runBackgroundOperation,
  showSyncProgress,
  syncProgressState,
  updateSyncProgress
} from '@/services/backgroundSyncService';

const REMOTE_HTTP_RE = /^https?:\/\//i;
const isRemoteHttpUrl = (value?: string) => Boolean(value && REMOTE_HTTP_RE.test(value));
const isNativeFileUri = (value?: string) => Boolean(value && (value.startsWith('file://') || value.startsWith('content://')));
const resolveCoverFetchUrl = (value: string): string => {
  if (value.startsWith('data:')) return value;
  if (isNativeFileUri(value)) {
    return Capacitor.convertFileSrc(value);
  }
  return value;
};
const shouldUploadCoverImage = (value?: string) => Boolean(value);
const getRemoteCoverUrlFromRecord = (record: any): string | undefined => {
  if (record?.cover && Array.isArray(record.cover) && record.cover.length > 0) {
    return record.cover[0]?.url;
  }
  if (record?.coverImage) {
    return record.coverImage;
  }
  return undefined;
};
const fetchCoverBlob = async (coverImage: string): Promise<Blob | null> => {
  try {
    const fetchUrl = resolveCoverFetchUrl(coverImage);
    const fetchOptions: RequestInit = {
      referrerPolicy: 'no-referrer'
    };
    if (isRemoteHttpUrl(coverImage)) {
      fetchOptions.mode = 'cors';
      fetchOptions.cache = 'force-cache';
    }
    const response = await fetch(fetchUrl, fetchOptions);
    if (!response.ok) {
      throw new Error(`Cover fetch failed (${response.status})`);
    }
    return await response.blob();
  } catch (error) {
    logSyncWarn('Could not fetch cover blob for upload', { coverImage, error });
    return null;
  }
};

const MIN_UPLOAD_LONG_EDGE = 1920;

const optimizeImageForSyncUpload = async (blob: Blob | null): Promise<Blob | null> => {
  if (!blob) {
    return null;
  }
  if (!blob.type || !blob.type.startsWith('image/')) {
    return blob;
  }

  try {
    const resized = await resizeImagePreservingExif(blob, { targetLongEdge: 2800, quality: 0.82 });
    const longEdge = await getBlobLongEdge(resized);
    if (longEdge < MIN_UPLOAD_LONG_EDGE) {
      console.warn('[sync] Resized image long edge below minimum, keeping original', {
        longEdge,
        min: MIN_UPLOAD_LONG_EDGE
      });
      return blob;
    }
    return resized;
  } catch (error) {
    console.warn('[sync] Image optimization failed, uploading original', error);
    return blob;
  }
};
const uploadCoverForBook = async (recordId: string, coverImage?: string) => {
  if (!coverImage || !shouldUploadCoverImage(coverImage)) return null;
  const blob = await fetchCoverBlob(coverImage);
  if (!blob) return null;
  try {
    return await uploadFileToPocketBase('books', recordId, blob, 'cover');
  } catch (error) {
    logSyncWarn('Cover upload failed for book', { recordId, error });
    return null;
  }
};

const uploadPhotoPicture = async (recordId: string, filepath?: string) => {
  if (!filepath) return null;
  const blob = await fetchCoverBlob(filepath);
  if (!blob) return null;
  const optimizedBlob = (await optimizeImageForSyncUpload(blob)) || blob;
  try {
    return await uploadFileToPocketBase('photos', recordId, optimizedBlob, 'picture');
  } catch (error) {
    logSyncWarn('Picture upload failed for photo', { recordId, error });
    return null;
  }
};

const getRemoteFileUrlFromRecord = (record: any, fieldName: string): string | undefined => {
  const field = record?.[fieldName];
  if (Array.isArray(field) && field.length > 0) {
    return field[0]?.url;
  }
  return undefined;
};

const parseNumberValue = (value?: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const buildGeoPoint = (latitude?: number | null, longitude?: number | null) => {
  if (latitude == null || longitude == null) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { lon: longitude, lat: latitude };
};

const ensureGeoPoint = (latitude?: number | null, longitude?: number | null) => {
  const point = buildGeoPoint(latitude, longitude);
  if (point) return point;
  return {
    lon: longitude ?? 0,
    lat: latitude ?? 0
  };
};

const parseGeoPointValue = (value?: unknown): { latitude?: number; longitude?: number } => {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return parseGeoPointValue(JSON.parse(value));
    } catch {
      return {};
    }
  }
  if (typeof value === 'object' && value !== null) {
    const candidateLat = parseNumberValue(
      (value as any).lat ?? (value as any).latitude
    );
    const candidateLng = parseNumberValue(
      (value as any).lng ?? (value as any).longitude ?? (value as any).lon
    );
    if (candidateLat !== undefined && candidateLng !== undefined) {
      return { latitude: candidateLat, longitude: candidateLng };
    }
    const coordinates = (value as any).coordinates;
    if (Array.isArray(coordinates) && coordinates.length >= 2) {
      const parsedLat = parseNumberValue(coordinates[1]);
      const parsedLng = parseNumberValue(coordinates[0]);
      if (parsedLat !== undefined && parsedLng !== undefined) {
        return { latitude: parsedLat, longitude: parsedLng };
      }
    }
  }
  return {};
};

const extractCoordinatesFromRecord = (
  record?: any
): { latitude?: number; longitude?: number; valLatitude?: number; valLongitude?: number } => {
  if (!record) return {};
  const valLocation = parseGeoPointValue(record.val_location ?? record.valLocation);
  const locationValue = record.location ?? record.geo ?? record.position;
  const parsedLocation = locationValue ? parseGeoPointValue(locationValue) : {};
  const fallbackLatitude = parseNumberValue(record.latitude ?? record.lat);
  const fallbackLongitude = parseNumberValue(record.longitude ?? record.lng);
  const latitude = parsedLocation.latitude ?? fallbackLatitude ?? valLocation.latitude;
  const longitude = parsedLocation.longitude ?? fallbackLongitude ?? valLocation.longitude;
  const valLatitude = valLocation.latitude ?? latitude;
  const valLongitude = valLocation.longitude ?? longitude;
  return { latitude, longitude, valLatitude, valLongitude };
};

const formatAltitudeForRemote = (value?: number | null): string => {
  const candidate = value ?? 0;
  return Number.isFinite(candidate) ? candidate.toString() : '0';
};

const parseAltitudeFromRemote = (value?: unknown): number | undefined => parseNumberValue(value);

const WINE_PHOTO_FILE_FIELD = 'file';

const uploadWinePhotoFile = async (recordId: string, filepath?: string) => {
  if (!filepath) return null;
  const blob = await fetchCoverBlob(filepath);
  if (!blob) return null;
  const optimizedBlob = (await optimizeImageForSyncUpload(blob)) || blob;
  try {
    return await uploadFileToPocketBase('winePhotos', recordId, optimizedBlob, WINE_PHOTO_FILE_FIELD);
  } catch (error) {
    logSyncWarn('Wine photo upload failed', { recordId, filepath, error });
    return null;
  }
};

type CollectionSubscriptionConfig = {
  collection: string;
  label: string;
};

const defaultRealtimeCollections: CollectionSubscriptionConfig[] = [
  { collection: 'galleries', label: 'Galerie' },
  { collection: 'photos', label: 'Foto' },
  { collection: 'books', label: 'Buch' },
  { collection: 'shoppingLists', label: 'Einkaufslisten' },
  { collection: 'shoppingItems', label: 'Einkaufsartikel' },
  { collection: 'todoLists', label: 'ToDo-Listen' },
  { collection: 'todoItems', label: 'ToDo-Items' },
  { collection: 'todoPhotos', label: 'ToDo-Fotos' },
  { collection: 'routes', label: 'Routen' },
  { collection: 'waypoints', label: 'Wegpunkte' }
];

const parseTimestamp = (value?: string | null): number => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const parseLocalIdFromForeign = (value?: string | number | null): number | null => {
  if (value === undefined || value === null) return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.trunc(numeric);
};

const buildGalleryPayload = (gallery: Gallery) => ({
  foreignID: gallery.id,
  name: gallery.name,
  description: gallery.description || '',
  coverPhotoId: gallery.coverPhotoId ?? null,
  color: gallery.color ?? null,
  startDate: gallery.startDate ?? null,
  endDate: gallery.endDate ?? null,
  updated: gallery.updated
});

const buildBookPayload = (book: Book) => ({
  foreignID: book.id,
  isbn: book.isbn,
  title: book.title,
  subtitle: book.subtitle || '',
  authors: book.authors || '',
  publisher: book.publisher || '',
  publishedDate: book.publishedDate || '',
  description: book.description || '',
  pageCount: book.pageCount || 0,
  categories: book.categories || '',
  language: book.language || '',
  coverImage: book.coverImage || '',
  categoryId: book.categoryId || null,
  notes: book.notes || '',
  rating: book.rating || 0,
  read: book.read || false,
  quantity: book.quantity || 1,
  updated: book.updated
});

const buildPhotoPayload = (photo: Photo) => ({
  foreignID: photo.id,
  galleryId: photo.galleryId,
  filename: photo.filename,
  width: photo.width ?? null,
  height: photo.height ?? null,
  filesize: photo.filesize ?? null,
  mimeType: photo.mimeType || null,
  isVideo: Boolean(photo.isVideo),
  location: buildGeoPoint(photo.latitude ?? null, photo.longitude ?? null),
  dateTaken: photo.dateTaken || null,
  camera: photo.camera || null,
  lens: photo.lens || null,
  focalLength: photo.focalLength ?? null,
  aperture: photo.aperture || null,
  shutterSpeed: photo.shutterSpeed || null,
  iso: photo.iso ?? null,
  created: photo.created,
  updated: photo.updated
});

const SYNC_LOG_PREFIX = 'SYNC';
type SyncLogLevel = 'log' | 'info' | 'warn' | 'error';
const logWithSyncPrefix = (level: SyncLogLevel, message: string, meta?: unknown) => {
  const formatted = `[${SYNC_LOG_PREFIX}] ${message}`;
  if (meta === undefined) {
    console[level](formatted);
  } else {
    console[level](formatted, meta);
  }
};
const logSyncInfo = (message: string, meta?: unknown) => logWithSyncPrefix('info', message, meta);
const logSyncWarn = (message: string, meta?: unknown) => logWithSyncPrefix('warn', message, meta);
const logSyncError = (message: string, meta?: unknown) => logWithSyncPrefix('error', message, meta);

const buildShoppingListPayload = (list: ShoppingList) => ({
  foreignID: list.id,
  name: list.name,
  updated: list.updated
});

const buildShoppingItemPayload = (item: ShoppingItem, remoteListId: string) => ({
  foreignID: item.id,
  listId: remoteListId,
  name: item.name,
  quantity: item.quantity ?? null,
  completed: Boolean(item.completed),
  updated: item.updated
});

const buildTodoListPayload = (list: TodoList) => ({
  foreignID: list.id,
  name: list.name,
  updated: list.updated
});

const buildTodoItemPayload = (item: TodoItem, remoteListId: string) => ({
  foreignID: item.id,
  listId: remoteListId,
  title: item.title,
  description: item.description || '',
  completed: Boolean(item.completed),
  photoPath: item.photoPath || '',
  dueDate: item.dueDate ?? null,
  completionDate: item.completionDate ?? null,
  updated: item.updated
});

const buildRoutePayload = (route: Route) => ({
  foreignID: route.id,
  name: route.name,
  description: route.description || '',
  startTime: route.startTime,
  endTime: route.endTime ?? null,
  distance: route.distance ?? null,
  duration: route.duration ?? null,
  travelMode: route.travelMode || 'car',
  isRecording: Boolean(route.isRecording),
  updated: route.updated
});

const resolveRemoteRouteName = (name?: string, startTime?: string): string => {
  if (name && name.trim().length > 0) {
    return name;
  }
  if (startTime) {
    const parsed = new Date(startTime);
    if (!Number.isNaN(parsed.getTime())) {
      return `Route ${parsed.toLocaleDateString()}`;
    }
  }
  return 'Route';
};

const toCoordinateText = (value?: number): string => (Number.isFinite(value ?? 0) ? (value ?? 0).toString() : '0');

const buildWaypointPayload = (waypoint: Waypoint) => {
  const valLatitude = waypoint.valLatitude ?? waypoint.latitude;
  const valLongitude = waypoint.valLongitude ?? waypoint.longitude;
  return {
    foreignID: waypoint.id,
    routeId: waypoint.routeId,
    type: waypoint.type,
    location: ensureGeoPoint(waypoint.latitude, waypoint.longitude),
    val_location: ensureGeoPoint(valLatitude, valLongitude),
    altitude: formatAltitudeForRemote(waypoint.altitude ?? null),
    accuracy: waypoint.accuracy ?? null,
    name: waypoint.name ?? null,
    description: waypoint.description ?? null,
    photoId: waypoint.photoId ?? null,
    timestamp: waypoint.timestamp,
    updated: waypoint.updated
  };
};

const buildWinePayload = (wine: Wine) => ({
  foreignID: wine.id,
  name: wine.name,
  winery: wine.winery || null,
  region: wine.region || null,
  country: wine.country || null,
  year: wine.year ?? null,
  grapeVariety: wine.grapeVariety || null,
  type: wine.type || null,
  price: wine.price ?? null,
  quantity: wine.quantity ?? 1,
  rating: wine.rating ?? null,
  notes: wine.notes || null,
  location: buildGeoPoint(wine.latitude ?? null, wine.longitude ?? null),
  purchaseDate: wine.purchaseDate || null,
  storageLocation: wine.storageLocation || null,
  showOnMap: Boolean(wine.showOnMap),
  updated: wine.updated
});

const buildWinePhotoPayload = (photo: WinePhoto, remoteWineId: string) => ({
  foreignID: photo.id,
  wineId: remoteWineId,
  filename: photo.filename,
  mimeType: photo.mimeType || null,
  filesize: photo.filesize ?? null,
  isPrimary: Boolean(photo.isPrimary),
  updated: photo.updated
});

const buildWineCategoryPayload = (category: WineCategory) => ({
  foreignID: category.id,
  name: category.name,
  description: category.description || '',
  updated: category.updated
});

const buildBookCategoryLookup = async (): Promise<Map<string, number>> => {
  try {
    const categories = await db.getBookCategories();
    const map = new Map<string, number>();
    for (const category of categories) {
      if (category.foreignID && typeof category.id === 'number') {
        map.set(category.foreignID, category.id);
      }
    }
    return map;
  } catch (error) {
    logSyncWarn('Failed to load book categories for sync', error);
    return new Map();
  }
};

const buildBookCategoryPayload = (category: BookCategory) => ({
  foreignID: category.id,
  name: category.name,
  description: category.description || '',
  updated: category.updated
});

const attachAuthorToPayload = <T extends Record<string, unknown>>(payload: T, authorId: string | null) => ({
  ...payload,
  pb_author: authorId ?? null
});

const resolveAuthorIdForSync = async (): Promise<string | null> => {
  const storedAuthorId = await getPocketbaseAuthorId();
  if (storedAuthorId) {
    return storedAuthorId;
  }
  const pb = pocketbase.getInstance();
  const fallbackAuthorId = pb?.authStore?.model?.id ?? null;
  if (fallbackAuthorId) {
    await setPocketbaseAuthorId(fallbackAuthorId);
    return fallbackAuthorId;
  }
  return null;
};

export function usePocketbaseSync() {
  // Hilfsfunktion: Automatische Authentifizierung, falls nötig
  async function authenticateUserIfNeeded(): Promise<boolean> {
    if (pocketbase.isAuthenticated()) {
      return true;
    }
    // Versuche Login mit gespeicherten Credentials
    const [{ value: email }, { value: password }] = await Promise.all([
      Preferences.get({ key: 'pocketbase_email' }),
      Preferences.get({ key: 'pocketbase_password' })
    ]);
    if (!email || !password) {
      return false;
    }

    const pb = pocketbase.getInstance();
    if (!pb) {
      return false;
    }

    try {
      await pb.collection('users').authWithPassword(email, password);
      return pocketbase.isAuthenticated();
    } catch (error) {
      logSyncWarn('Automatische Authentifizierung fehlgeschlagen', error);
      return false;
    }
  }

  async function ensurePocketbaseConfiguredAndAuthenticated(): Promise<boolean> {
    await pocketbase.initialize();
    if (!pocketbase.isConfigured()) {
      logSyncWarn('PocketBase not configured');
      return false;
    }
    return authenticateUserIfNeeded();
  }

  const isSyncing = ref(false);
  const lastSyncTime = ref<string | null>(null);

  let gallerySubscription: UnsubscribeFunc | null = null;

  const presentRealtimeToast = async (message: string) => {
    const toast = await toastController.create({
      message,
      duration: 3500,
      position: 'bottom',
      color: 'primary'
    });
    await toast.present();
  };

  const loadLastSyncTime = async () => {
    const { value } = await Preferences.get({ key: 'last_sync_time' });
    if (value) {
      lastSyncTime.value = value;
    }
  };

  const saveLastSyncTime = async () => {
    const now = new Date().toISOString();
    lastSyncTime.value = now;
    await Preferences.set({ key: 'last_sync_time', value: now });
  };

  const collectionSubscriptions = new Map<string, UnsubscribeFunc>();
  let realtimeActive = false;
  let pendingRealtimeResume = false;

  const formatRealtimeMessage = (label: string, event: any) => {
    const defaultTitle = event.record?.name ?? event.record?.title ?? event.record?.filename ?? `ID ${event.record?.id ?? 'unknown'}`;
    const actionMap: Record<string, string> = {
      create: 'angelegt',
      update: 'aktualisiert',
      delete: 'gelöscht'
    };
    const action = actionMap[event.action] ?? event.action;
    return `${label} ${action}: ${defaultTitle}`;
  };

  const subscribeToRealtimeCollections = async (collections: CollectionSubscriptionConfig[] = defaultRealtimeCollections) => {
    await authenticateUserIfNeeded();
    const pb = pocketbase.getInstance();
    if (!pb || !pocketbase.isAuthenticated()) {
      logSyncWarn('PocketBase not authenticated -> cannot subscribe to realtime collections');
      return;
    }

    let subscribedCount = 0;
    for (const { collection, label } of collections) {
      const existing = collectionSubscriptions.get(collection);
      if (existing) {
        await existing();
        collectionSubscriptions.delete(collection);
      }

      try {
        const unsubscribe = await pb.collection(collection).subscribe('*', (event) => {
          void presentRealtimeToast(formatRealtimeMessage(label, event));
        });
        collectionSubscriptions.set(collection, unsubscribe);
        subscribedCount++;
      } catch (error) {
        logSyncError(`Realtime subscription failed for ${collection}:`, error);
      }
    }

    if (subscribedCount > 0) {
      realtimeActive = true;
      pendingRealtimeResume = false;
    } else {
      realtimeActive = false;
    }
  };

  const unsubscribeFromRealtimeCollections = async (collections?: string[]) => {
    const toUnsubscribe = collections?.length
      ? collections.filter(c => collectionSubscriptions.has(c))
      : Array.from(collectionSubscriptions.keys());

    for (const collection of toUnsubscribe) {
      const unsubscribeFn = collectionSubscriptions.get(collection);
      if (unsubscribeFn) {
        await unsubscribeFn();
        collectionSubscriptions.delete(collection);
      }
    }

    realtimeActive = collectionSubscriptions.size > 0;
  };

  const subscribeToGalleries = async () => subscribeToRealtimeCollections([{ collection: 'galleries', label: 'Galerie' }]);
  const subscribeToAllEntities = async () => subscribeToRealtimeCollections();
  const unsubscribeFromGalleries = async () => unsubscribeFromRealtimeCollections(['galleries']);
  const unsubscribeFromAllEntities = async () => unsubscribeFromRealtimeCollections();

  const pauseRealtimeNotifications = async (): Promise<boolean> => {
    if (!realtimeActive) {
      pendingRealtimeResume = false;
      return false;
    }

    pendingRealtimeResume = true;
    await unsubscribeFromRealtimeCollections();
    return true;
  };

  const resumeRealtimeNotifications = async (): Promise<void> => {
    if (!pendingRealtimeResume) return;
    pendingRealtimeResume = false;
    await subscribeToAllEntities();
  };

  // Gallery Sync
  const syncGalleries = async (): Promise<void> => {
    const localGalleries = await db.getGalleries();
    showSyncProgress('Galerien', localGalleries.length);
    await authenticateUserIfNeeded();
    const pb = pocketbase.getInstance();
    if (!pb || !pocketbase.isAuthenticated()) {
      logSyncWarn('PocketBase not configured or not authenticated');
      hideSyncProgress();
      return;
    }

    const authorId = await resolveAuthorIdForSync();

    try {
      logSyncInfo('🔄 Syncing galleries...');
      const remoteGalleries = await pb.collection('galleries').getFullList({ sort: '-updated' });
      const remoteById = new Map<string, any>();
      const remoteByForeignId = new Map<number, any>();
      for (const remote of remoteGalleries) {
        remoteById.set(remote.id, remote);
        const localId = parseLocalIdFromForeign(remote.foreignID);
        if (localId) {
          remoteByForeignId.set(localId, remote);
        }
      }

      const handledRemoteIds = new Set<string>();
      let processed = 0;
      for (const gallery of localGalleries) {
        let remote = gallery.foreignID ? remoteById.get(gallery.foreignID) : undefined;
        if (!remote && gallery.id) {
          remote = remoteByForeignId.get(gallery.id);
        }

        if (!remote) {
          const created = await pb.collection('galleries').create(attachAuthorToPayload(buildGalleryPayload(gallery), authorId));
          handledRemoteIds.add(created.id);
          await db.updateGallery(gallery.id!, {
            foreignID: created.id
          });
        } else {
          handledRemoteIds.add(remote.id);
          const localTs = parseTimestamp(gallery.updated);
          const remoteTs = parseTimestamp(remote.updated);
          if (localTs > remoteTs) {
            const updatedRemote = await pb.collection('galleries').update(remote.id, attachAuthorToPayload(buildGalleryPayload(gallery), authorId));
            await db.updateGallery(gallery.id!, {
              foreignID: updatedRemote.id,
              updated: gallery.updated
            });
          } else if (remoteTs > localTs) {
            await db.updateGallery(gallery.id!, {
              name: remote.name,
              description: remote.description ?? undefined,
              coverPhotoId: remote.coverPhotoId || undefined,
              color: remote.color || undefined,
              startDate: remote.startDate || undefined,
              endDate: remote.endDate || undefined,
              foreignID: remote.id,
              updated: remote.updated
            });
          } else if (gallery.foreignID !== remote.id) {
            await db.updateGallery(gallery.id!, {
              foreignID: remote.id,
              updated: remote.updated
            });
          }
        }

        processed++;
        updateSyncProgress(processed);
      }

      for (const remote of remoteGalleries) {
        if (handledRemoteIds.has(remote.id)) continue;
        const localId = parseLocalIdFromForeign(remote.foreignID);
        const alreadyExists = localId ? localGalleries.some(g => g.id === localId) : false;
        if (alreadyExists) continue;

        const createdId = await db.createGallery({
          name: remote.name,
          description: remote.description ?? undefined,
          coverPhotoId: remote.coverPhotoId || undefined,
          color: remote.color || undefined,
          startDate: remote.startDate || undefined,
          endDate: remote.endDate || undefined,
          foreignID: remote.id,
          updated: remote.updated
        });

        await pb.collection('galleries').update(remote.id, {
          foreignID: createdId,
          updated: remote.updated
        });
      }

      logSyncInfo('✅ Galleries synced');
    } catch (error) {
      logSyncError('Gallery sync error', error);
      throw error;
    } finally {
      hideSyncProgress();
    }
  };

  // Photos Sync
  const syncPhotos = async (): Promise<void> => {
    const galleries = await db.getGalleries();
    const localPhotos: Photo[] = [];
    for (const gallery of galleries) {
      const photosInGallery = await db.getPhotosByGallery(gallery.id!);
      localPhotos.push(...photosInGallery);
    }

    showSyncProgress('Fotos', localPhotos.length);
    await authenticateUserIfNeeded();
    const pb = pocketbase.getInstance();
    if (!pb || !pocketbase.isAuthenticated()) {
      hideSyncProgress();
      return;
    }

    const authorId = await resolveAuthorIdForSync();

    try {
      logSyncInfo('🔄 Syncing photos...');
      const remotePhotos = await pb.collection('photos').getFullList({ sort: '-updated' });
      const remoteById = new Map<string, any>();
      const remoteByForeignId = new Map<number, any>();
      for (const remote of remotePhotos) {
        remoteById.set(remote.id, remote);
        const localId = parseLocalIdFromForeign(remote.foreignID);
        if (localId) {
          remoteByForeignId.set(localId, remote);
        }
      }

      const processedRemoteIds = new Set<string>();
      let processed = 0;
      for (const photo of localPhotos) {
        let remote = photo.foreignID ? remoteById.get(photo.foreignID) : undefined;
        if (!remote && photo.id) {
          remote = remoteByForeignId.get(photo.id);
        }

        if (!remote) {
          const created = await pb.collection('photos').create(attachAuthorToPayload(buildPhotoPayload(photo), authorId));
          processedRemoteIds.add(created.id);
          const pictureUploadRecord = await uploadPhotoPicture(created.id, photo.filepath);
          const finalRemote = pictureUploadRecord || created;
          await db.updatePhoto(photo.id!, {
            foreignID: finalRemote.id,
            updated: photo.updated
          });
        } else {
          processedRemoteIds.add(remote.id);
          const localTs = parseTimestamp(photo.updated);
          const remoteTs = parseTimestamp(remote.updated);
          if (localTs > remoteTs) {
            const updatedRemote = await pb.collection('photos').update(remote.id, attachAuthorToPayload(buildPhotoPayload(photo), authorId));
            const pictureUploadRecord = await uploadPhotoPicture(updatedRemote.id, photo.filepath);
            const finalRemote = pictureUploadRecord || updatedRemote;
            await db.updatePhoto(photo.id!, {
              foreignID: finalRemote.id,
              updated: photo.updated
            });
          } else if (remoteTs > localTs) {
            const galleryId = Number(remote.galleryId) || photo.galleryId;
            const remoteCoords = extractCoordinatesFromRecord(remote);
            await db.updatePhoto(photo.id!, {
              galleryId,
              filename: remote.filename || photo.filename,
              width: remote.width ?? photo.width,
              height: remote.height ?? photo.height,
              filesize: remote.filesize ?? photo.filesize,
              mimeType: remote.mimeType || photo.mimeType,
              isVideo: Boolean(remote.isVideo) || Boolean(photo.isVideo),
              latitude: remoteCoords.latitude ?? photo.latitude,
              longitude: remoteCoords.longitude ?? photo.longitude,
              dateTaken: remote.dateTaken || photo.dateTaken,
              camera: remote.camera || photo.camera,
              lens: remote.lens || photo.lens,
              focalLength: remote.focalLength ?? photo.focalLength,
              aperture: remote.aperture || photo.aperture,
              shutterSpeed: remote.shutterSpeed || photo.shutterSpeed,
              iso: remote.iso ?? photo.iso,
              foreignID: remote.id,
              updated: remote.updated
            });
          } else if (photo.foreignID !== remote.id) {
            await db.updatePhoto(photo.id!, {
              foreignID: remote.id,
              updated: photo.updated
            });
          }
        }

        processed++;
        updateSyncProgress(processed);
      }

      logSyncInfo('✅ Photos metadata synced');
    } catch (error) {
      logSyncError('Photo sync error', error);
      throw error;
    } finally {
      hideSyncProgress();
    }
  };

  const syncBookCategories = async (): Promise<void> => {
    const localCategories = await db.getBookCategories();
    showSyncProgress('Buchkategorien', localCategories.length);
    await authenticateUserIfNeeded();
    const pb = pocketbase.getInstance();
    if (!pb || !pocketbase.isAuthenticated()) {
      hideSyncProgress();
      return;
    }

    const authorId = await resolveAuthorIdForSync();

    try {
      logSyncInfo('🔄 Syncing book categories...');
      const remoteCategories = await pb.collection('bookCategories').getFullList({ sort: '-updated' });
      const remoteById = new Map<string, any>();
      const remoteByForeignId = new Map<number, any>();
      for (const remote of remoteCategories) {
        remoteById.set(remote.id, remote);
        const localId = parseLocalIdFromForeign(remote.foreignID);
        if (localId) {
          remoteByForeignId.set(localId, remote);
        }
      }

      const handledRemoteIds = new Set<string>();
      let processed = 0;
      for (const category of localCategories) {
        if (!category.id) continue;
        let remote = category.foreignID ? remoteById.get(category.foreignID) : undefined;
        if (!remote) {
          remote = remoteByForeignId.get(category.id);
        }

        if (!remote) {
          const created = await pb.collection('bookCategories').create(attachAuthorToPayload(buildBookCategoryPayload(category), authorId));
          handledRemoteIds.add(created.id);
          await db.updateBookCategory(category.id, {
            foreignID: created.id,
            updated: category.updated
          });
        } else {
          handledRemoteIds.add(remote.id);
          const localTs = parseTimestamp(category.updated);
          const remoteTs = parseTimestamp(remote.updated);
          if (localTs > remoteTs) {
            const updatedRemote = await pb.collection('bookCategories').update(remote.id, attachAuthorToPayload(buildBookCategoryPayload(category), authorId));
            await db.updateBookCategory(category.id, {
              foreignID: updatedRemote.id,
              updated: category.updated
            });
          } else if (remoteTs > localTs) {
            await db.updateBookCategory(category.id, {
              name: remote.name,
              description: remote.description ?? undefined,
              foreignID: remote.id,
              updated: remote.updated
            });
          } else if (category.foreignID !== remote.id) {
            await db.updateBookCategory(category.id, {
              foreignID: remote.id,
              updated: remote.updated
            });
          }
        }

        processed++;
        updateSyncProgress(processed);
      }

      for (const remote of remoteCategories) {
        if (handledRemoteIds.has(remote.id)) continue;
        const localId = parseLocalIdFromForeign(remote.foreignID);
        const alreadyExists = localId ? localCategories.some((c) => c.id === localId) : false;
        if (alreadyExists) continue;

        const newLocalId = await db.createBookCategory({
          name: remote.name ?? 'Kategorie',
          description: remote.description ?? undefined,
          foreignID: remote.id,
          updated: remote.updated ?? new Date().toISOString()
        });

        await pb.collection('bookCategories').update(remote.id, {
          foreignID: newLocalId,
          updated: remote.updated ?? new Date().toISOString()
        });
      }

      logSyncInfo('✅ Book categories synced');
    } catch (error) {
      logSyncError('Book categories sync error', error);
      throw error;
    } finally {
      hideSyncProgress();
    }
  };

  // Books Sync
  const syncBooks = async (): Promise<void> => {
    const localBooks = await db.getBooks();
    showSyncProgress('Bücher', localBooks.length);
    await authenticateUserIfNeeded();
    const pb = pocketbase.getInstance();
    if (!pb || !pocketbase.isAuthenticated()) {
      hideSyncProgress();
      return;
    }

    const authorId = await resolveAuthorIdForSync();

    try {
      logSyncInfo('🔄 Syncing books...');
      const bookCategoryLookup = await buildBookCategoryLookup();
      const missingCategoryIds = new Set<string>();
      const resolveRemoteCategoryId = (categoryId?: string | number | null): number | null => {
        if (categoryId === undefined || categoryId === null) return null;
        const key = String(categoryId);
        const mapped = bookCategoryLookup.get(key);
        if (mapped === undefined && !missingCategoryIds.has(key)) {
          missingCategoryIds.add(key);
          logSyncWarn('Remote book references unknown category', { categoryId: key });
        }
        return mapped ?? null;
      };
      const remoteBooks = await pb.collection('books').getFullList({ sort: '-updated' });
      const remoteById = new Map<string, any>();
      const remoteByForeignId = new Map<number, any>();
      for (const remote of remoteBooks) {
        remoteById.set(remote.id, remote);
        const localId = parseLocalIdFromForeign(remote.foreignID);
        if (localId) {
          remoteByForeignId.set(localId, remote);
        }
      }

      const handledRemoteIds = new Set<string>();
      let processed = 0;
      for (const book of localBooks) {
        let remote = book.foreignID ? remoteById.get(book.foreignID) : undefined;
        if (!remote && book.id) {
          remote = remoteByForeignId.get(book.id);
        }

        if (!remote) {
          const created = await pb.collection('books').create(attachAuthorToPayload(buildBookPayload(book), authorId));
          handledRemoteIds.add(created.id);
          const coverUploadRecord = await uploadCoverForBook(created.id, book.coverImage);
          const finalRemoteRecord = coverUploadRecord || created;
          const remoteCoverUrl = getRemoteCoverUrlFromRecord(finalRemoteRecord);
          await db.updateBook(book.id!, {
            foreignID: finalRemoteRecord.id,
            coverImage: remoteCoverUrl || book.coverImage
          });
        } else {
          handledRemoteIds.add(remote.id);
          const localTs = parseTimestamp(book.updated);
          const remoteTs = parseTimestamp(remote.updated);
          if (localTs > remoteTs) {
            const updatedRemote = await pb.collection('books').update(remote.id, attachAuthorToPayload(buildBookPayload(book), authorId));
            const coverUploadRecord = await uploadCoverForBook(updatedRemote.id, book.coverImage);
            const finalRemoteRecord = coverUploadRecord || updatedRemote;
            const remoteCoverUrl = getRemoteCoverUrlFromRecord(finalRemoteRecord);
            await db.updateBook(book.id!, {
              foreignID: finalRemoteRecord.id,
              updated: book.updated,
              coverImage: remoteCoverUrl || book.coverImage
            });
          } else if (remoteTs > localTs) {
            const resolvedCategoryId = resolveRemoteCategoryId(remote.categoryId);
            const remoteCoverUrl = getRemoteCoverUrlFromRecord(remote);
            await db.updateBook(book.id!, {
              isbn: remote.isbn,
              title: remote.title,
              subtitle: remote.subtitle ?? undefined,
              authors: remote.authors ?? undefined,
              publisher: remote.publisher ?? undefined,
              publishedDate: remote.publishedDate ?? undefined,
              description: remote.description ?? undefined,
              pageCount: remote.pageCount ?? undefined,
              categories: remote.categories ?? undefined,
              language: remote.language ?? undefined,
              coverImage: remoteCoverUrl || book.coverImage,
              categoryId: resolvedCategoryId ?? undefined,
              notes: remote.notes ?? undefined,
              rating: remote.rating ?? undefined,
              read: remote.read ?? false,
              quantity: remote.quantity ?? book.quantity ?? 1,
              foreignID: remote.id,
              updated: remote.updated
            });
          } else if (book.foreignID !== remote.id) {
            await db.updateBook(book.id!, {
              foreignID: remote.id,
              updated: remote.updated
            });
          }
        }

        processed++;
        updateSyncProgress(processed);
      }

      for (const remote of remoteBooks) {
        if (handledRemoteIds.has(remote.id)) continue;
        const localId = parseLocalIdFromForeign(remote.foreignID);
        const alreadyExists = localId ? localBooks.some(b => b.id === localId) : false;
        if (alreadyExists) continue;

        const newLocalId = await db.createBook({
          isbn: remote.isbn,
          title: remote.title,
          subtitle: remote.subtitle ?? undefined,
          authors: remote.authors ?? undefined,
          publisher: remote.publisher ?? undefined,
          publishedDate: remote.publishedDate ?? undefined,
          description: remote.description ?? undefined,
          pageCount: remote.pageCount ?? undefined,
          categories: remote.categories ?? undefined,
          language: remote.language ?? undefined,
          coverImage: getRemoteCoverUrlFromRecord(remote) ?? undefined,
          categoryId: resolveRemoteCategoryId(remote.categoryId) ?? undefined,
          notes: remote.notes ?? undefined,
          rating: remote.rating ?? undefined,
          read: remote.read ?? false,
          quantity: remote.quantity ?? 1,
          foreignID: remote.id,
          updated: remote.updated
        });

        await pb.collection('books').update(remote.id, {
          foreignID: newLocalId,
          updated: remote.updated
        });
      }

      logSyncInfo('✅ Books synced');
    } catch (error) {
      logSyncError('Book sync error', error);
      throw error;
    } finally {
      hideSyncProgress();
    }
  };

  const syncWines = async (): Promise<void> => {
    const localWines = await db.getWines();
    showSyncProgress('Weine', localWines.length);
    await authenticateUserIfNeeded();
    const pb = pocketbase.getInstance();
    if (!pb || !pocketbase.isAuthenticated()) {
      hideSyncProgress();
      return;
    }

    const authorId = await resolveAuthorIdForSync();

    try {
      logSyncInfo('🔄 Syncing wines...');
      const remoteWines = await pb.collection('wine').getFullList({ sort: '-updated' });
      const remoteById = new Map<string, any>();
      const remoteByForeignId = new Map<number, any>();
      for (const remote of remoteWines) {
        remoteById.set(remote.id, remote);
        const localId = parseLocalIdFromForeign(remote.foreignID);
        if (localId) {
          remoteByForeignId.set(localId, remote);
        }
      }

      const handledRemoteIds = new Set<string>();
      let processed = 0;
      for (const wine of localWines) {
        if (!wine.id) continue;

        let remote = wine.foreignID ? remoteById.get(wine.foreignID) : undefined;
        if (!remote) {
          remote = remoteByForeignId.get(wine.id);
        }

        if (!remote) {
          const created = await pb.collection('wine').create(attachAuthorToPayload(buildWinePayload(wine), authorId));
          handledRemoteIds.add(created.id);
          await db.updateWine(wine.id, {
            foreignID: created.id,
            updated: wine.updated
          });
        } else {
          handledRemoteIds.add(remote.id);
          const localTs = parseTimestamp(wine.updated);
          const remoteTs = parseTimestamp(remote.updated);
          if (localTs > remoteTs) {
            const updatedRemote = await pb.collection('wine').update(remote.id, attachAuthorToPayload(buildWinePayload(wine), authorId));
            await db.updateWine(wine.id, {
              foreignID: updatedRemote.id,
              updated: wine.updated
            });
          } else if (remoteTs > localTs) {
            const remoteCoords = extractCoordinatesFromRecord(remote);
            await db.updateWine(wine.id, {
              name: remote.name,
              winery: remote.winery ?? undefined,
              region: remote.region ?? undefined,
              country: remote.country ?? undefined,
              year: remote.year ?? undefined,
              grapeVariety: remote.grapeVariety ?? undefined,
              type: remote.type ?? undefined,
              price: remote.price ?? undefined,
              quantity: remote.quantity ?? undefined,
              rating: remote.rating ?? undefined,
              notes: remote.notes ?? undefined,
              latitude: remoteCoords.latitude ?? undefined,
              longitude: remoteCoords.longitude ?? undefined,
              purchaseDate: remote.purchaseDate ?? undefined,
              storageLocation: remote.storageLocation ?? undefined,
              showOnMap: Boolean(remote.showOnMap),
              foreignID: remote.id,
              updated: remote.updated
            });
          } else if (wine.foreignID !== remote.id) {
            await db.updateWine(wine.id, {
              foreignID: remote.id,
              updated: remote.updated
            });
          }
        }

        processed++;
        updateSyncProgress(processed);
      }

      for (const remote of remoteWines) {
        if (handledRemoteIds.has(remote.id)) continue;
        const localId = parseLocalIdFromForeign(remote.foreignID);
        const alreadyExists = localId ? localWines.some(w => w.id === localId) : false;
        if (alreadyExists) continue;

        const remoteCoords = extractCoordinatesFromRecord(remote);
        const newLocalId = await db.createWine({
          name: remote.name ?? 'Wein',
          winery: remote.winery ?? undefined,
          region: remote.region ?? undefined,
          country: remote.country ?? undefined,
          year: remote.year ?? undefined,
          grapeVariety: remote.grapeVariety ?? undefined,
          type: remote.type ?? undefined,
          price: remote.price ?? undefined,
          quantity: remote.quantity ?? undefined,
          rating: remote.rating ?? undefined,
          notes: remote.notes ?? undefined,
          latitude: remoteCoords.latitude ?? undefined,
          longitude: remoteCoords.longitude ?? undefined,
          purchaseDate: remote.purchaseDate ?? undefined,
          storageLocation: remote.storageLocation ?? undefined,
          showOnMap: Boolean(remote.showOnMap),
          foreignID: remote.id,
          updated: remote.updated ?? new Date().toISOString()
        });

        await pb.collection('wine').update(remote.id, {
          foreignID: newLocalId,
          updated: remote.updated ?? new Date().toISOString()
        });
      }

      logSyncInfo('✅ Wines synced');
    } catch (error) {
      logSyncError('Wine sync error', error);
      throw error;
    } finally {
      hideSyncProgress();
    }
  };

  const syncWinePhotos = async (): Promise<void> => {
    const localWines = await db.getWines();
    const localPhotos: WinePhoto[] = [];
    for (const wine of localWines) {
      if (!wine.id) continue;
      const photos = await db.getWinePhotos(wine.id);
      localPhotos.push(...photos);
    }

    showSyncProgress('Wein-Fotos', localPhotos.length);
    await authenticateUserIfNeeded();
    const pb = pocketbase.getInstance();
    if (!pb || !pocketbase.isAuthenticated()) {
      hideSyncProgress();
      return;
    }

    const authorId = await resolveAuthorIdForSync();

    try {
      logSyncInfo('🔄 Syncing wine photos...');
      const remoteWines = await pb.collection('wine').getFullList({ sort: '-updated' });
      const remoteWineIdByLocal = new Map<number, string>();
      const localWineIdByRemote = new Map<string, number>();
      for (const remote of remoteWines) {
        const localId = parseLocalIdFromForeign(remote.foreignID);
        if (localId) {
          remoteWineIdByLocal.set(localId, remote.id);
          localWineIdByRemote.set(remote.id, localId);
        }
      }

      const remotePhotos = await pb.collection('winePhotos').getFullList({ sort: '-updated' });
      const remoteById = new Map<string, any>();
      const remoteByForeignId = new Map<number, any>();
      for (const remote of remotePhotos) {
        remoteById.set(remote.id, remote);
        const localId = parseLocalIdFromForeign(remote.foreignID);
        if (localId) {
          remoteByForeignId.set(localId, remote);
        }
      }

      const handledRemoteIds = new Set<string>();
      let processed = 0;
      for (const photo of localPhotos) {
        if (!photo.id) continue;
        const remoteWineId = remoteWineIdByLocal.get(photo.wineId);
        if (!remoteWineId) {
          logSyncWarn('Wine photo references unknown remote wine, skipping', { photoId: photo.id, wineId: photo.wineId });
          processed++;
          updateSyncProgress(processed);
          continue;
        }

        let remote = photo.foreignID ? remoteById.get(photo.foreignID) : undefined;
        if (!remote) {
          remote = remoteByForeignId.get(photo.id);
        }

        if (!remote) {
          const created = await pb.collection('winePhotos').create(attachAuthorToPayload(buildWinePhotoPayload(photo, remoteWineId), authorId));
          const uploadRecord = await uploadWinePhotoFile(created.id, photo.filepath);
          const finalRemote = uploadRecord || created;
          handledRemoteIds.add(finalRemote.id);
          await db.updateWinePhoto(photo.id, {
            foreignID: finalRemote.id,
            updated: photo.updated
          });
        } else {
          handledRemoteIds.add(remote.id);
          const localTs = parseTimestamp(photo.updated);
          const remoteTs = parseTimestamp(remote.updated);
          if (localTs > remoteTs) {
            const updatedRemote = await pb.collection('winePhotos').update(remote.id, attachAuthorToPayload(buildWinePhotoPayload(photo, remoteWineId), authorId));
            const uploadRecord = await uploadWinePhotoFile(updatedRemote.id, photo.filepath);
            const finalRemote = uploadRecord || updatedRemote;
            await db.updateWinePhoto(photo.id, {
              foreignID: finalRemote.id,
              updated: photo.updated
            });
          } else if (remoteTs > localTs) {
            const remoteUrl = getRemoteFileUrlFromRecord(remote, WINE_PHOTO_FILE_FIELD);
            await db.updateWinePhoto(photo.id, {
              filename: remote.filename || photo.filename,
              mimeType: remote.mimeType || photo.mimeType,
              filesize: remote.filesize ?? photo.filesize,
              isPrimary: Boolean(remote.isPrimary),
              filepath: remoteUrl || photo.filepath,
              updated: remote.updated ?? photo.updated
            });
          } else if (photo.foreignID !== remote.id) {
            await db.updateWinePhoto(photo.id, {
              foreignID: remote.id,
              updated: remote.updated ?? photo.updated
            });
          }
        }

        processed++;
        updateSyncProgress(processed);
      }

      for (const remote of remotePhotos) {
        if (handledRemoteIds.has(remote.id)) continue;
        const localId = parseLocalIdFromForeign(remote.foreignID);
        const alreadyExists = localId ? localPhotos.some(p => p.id === localId) : false;
        if (alreadyExists) continue;

        const wineLocalId = localWineIdByRemote.get(remote.wineId);
        if (!wineLocalId) {
          logSyncWarn('Remote wine photo references missing wine, skipping', { remoteId: remote.id, wineId: remote.wineId });
          continue;
        }

        const remoteUrl = getRemoteFileUrlFromRecord(remote, WINE_PHOTO_FILE_FIELD) ?? '';
        const newLocalId = await db.createWinePhoto({
          wineId: wineLocalId,
          filename: remote.filename || `wine_photo_${remote.id}`,
          filepath: remoteUrl || `wine_photos/${remote.id}`,
          mimeType: remote.mimeType || undefined,
          filesize: remote.filesize ?? undefined,
          isPrimary: Boolean(remote.isPrimary),
          foreignID: remote.id,
          updated: remote.updated ?? new Date().toISOString()
        });

        await pb.collection('winePhotos').update(remote.id, {
          foreignID: newLocalId,
          updated: remote.updated ?? new Date().toISOString()
        });
      }

      logSyncInfo('✅ Wine photos synced');
    } catch (error) {
      logSyncError('Wine photos sync error', error);
      throw error;
    } finally {
      hideSyncProgress();
    }
  };

  const syncWineCategories = async (): Promise<void> => {
    const localCategories = await db.getWineCategories();
    showSyncProgress('Weinkategorien', localCategories.length);
    await authenticateUserIfNeeded();
    const pb = pocketbase.getInstance();
    if (!pb || !pocketbase.isAuthenticated()) {
      hideSyncProgress();
      return;
    }

    const authorId = await resolveAuthorIdForSync();

    try {
      logSyncInfo('🔄 Syncing wine categories...');
      const remoteCategories = await pb.collection('wineCategories').getFullList({ sort: '-updated' });
      const remoteById = new Map<string, any>();
      const remoteByForeignId = new Map<number, any>();
      for (const remote of remoteCategories) {
        remoteById.set(remote.id, remote);
        const localId = parseLocalIdFromForeign(remote.foreignID);
        if (localId) {
          remoteByForeignId.set(localId, remote);
        }
      }

      const handledRemoteIds = new Set<string>();
      let processed = 0;
      for (const category of localCategories) {
        if (!category.id) continue;
        let remote = category.foreignID ? remoteById.get(category.foreignID) : undefined;
        if (!remote) {
          remote = remoteByForeignId.get(category.id);
        }

        if (!remote) {
          const created = await pb.collection('wineCategories').create(attachAuthorToPayload(buildWineCategoryPayload(category), authorId));
          handledRemoteIds.add(created.id);
          await db.updateWineCategory(category.id, {
            foreignID: created.id,
            updated: category.updated
          });
        } else {
          handledRemoteIds.add(remote.id);
          const localTs = parseTimestamp(category.updated);
          const remoteTs = parseTimestamp(remote.updated);
          if (localTs > remoteTs) {
            const updatedRemote = await pb.collection('wineCategories').update(remote.id, attachAuthorToPayload(buildWineCategoryPayload(category), authorId));
            await db.updateWineCategory(category.id, {
              foreignID: updatedRemote.id,
              updated: category.updated
            });
          } else if (remoteTs > localTs) {
            await db.updateWineCategory(category.id, {
              name: remote.name,
              description: remote.description ?? undefined,
              foreignID: remote.id,
              updated: remote.updated
            });
          } else if (category.foreignID !== remote.id) {
            await db.updateWineCategory(category.id, {
              foreignID: remote.id,
              updated: remote.updated
            });
          }
        }

        processed++;
        updateSyncProgress(processed);
      }

      for (const remote of remoteCategories) {
        if (handledRemoteIds.has(remote.id)) continue;
        const localId = parseLocalIdFromForeign(remote.foreignID);
        const alreadyExists = localId ? localCategories.some(c => c.id === localId) : false;
        if (alreadyExists) continue;

        const newLocalId = await db.createWineCategory({
          name: remote.name ?? 'Kategorie',
          description: remote.description ?? undefined,
          foreignID: remote.id,
          updated: remote.updated ?? new Date().toISOString()
        });

        await pb.collection('wineCategories').update(remote.id, {
          foreignID: newLocalId,
          updated: remote.updated ?? new Date().toISOString()
        });
      }

      logSyncInfo('✅ Wine categories synced');
    } catch (error) {
      logSyncError('Wine categories sync error', error);
      throw error;
    } finally {
      hideSyncProgress();
    }
  };

  const syncShoppingLists = async (): Promise<void> => {
    const localLists = await db.getShoppingLists();
    showSyncProgress('Einkaufslisten', localLists.length);
    await authenticateUserIfNeeded();
    const pb = pocketbase.getInstance();
    if (!pb || !pocketbase.isAuthenticated()) {
      hideSyncProgress();
      return;
    }

    const authorId = await resolveAuthorIdForSync();

    try {
      logSyncInfo('🔄 Syncing shopping lists...');
      const remoteLists = await pb.collection('shoppingLists').getFullList({ sort: '-updated' });
      const remoteById = new Map<string, any>();
      const remoteByForeignId = new Map<number, any>();
      for (const remote of remoteLists) {
        remoteById.set(remote.id, remote);
        const localId = parseLocalIdFromForeign(remote.foreignID);
        if (localId) {
          remoteByForeignId.set(localId, remote);
        }
      }

      const handledRemoteIds = new Set<string>();
      let processed = 0;
      for (const list of localLists) {
        if (!list.id) {
          continue;
        }

        let remote = list.foreignID ? remoteById.get(list.foreignID) : undefined;
        if (!remote) {
          remote = remoteByForeignId.get(list.id);
        }

        if (!remote) {
          const created = await pb.collection('shoppingLists').create(attachAuthorToPayload(buildShoppingListPayload(list), authorId));
          handledRemoteIds.add(created.id);
          await db.updateShoppingList(list.id, {
            foreignID: created.id,
            updated: list.updated
          });
        } else {
          handledRemoteIds.add(remote.id);
          const localTs = parseTimestamp(list.updated);
          const remoteTs = parseTimestamp(remote.updated);
          if (localTs > remoteTs) {
            const updatedRemote = await pb.collection('shoppingLists').update(remote.id, attachAuthorToPayload(buildShoppingListPayload(list), authorId));
            await db.updateShoppingList(list.id, {
              foreignID: updatedRemote.id,
              updated: list.updated
            });
          } else if (remoteTs > localTs) {
            await db.updateShoppingList(list.id, {
              name: remote.name,
              foreignID: remote.id,
              updated: remote.updated
            });
          } else if (list.foreignID !== remote.id) {
            await db.updateShoppingList(list.id, {
              foreignID: remote.id,
              updated: remote.updated
            });
          }
        }

        processed++;
        updateSyncProgress(processed);
      }

      for (const remote of remoteLists) {
        if (handledRemoteIds.has(remote.id)) continue;
        const localId = parseLocalIdFromForeign(remote.foreignID);
        const alreadyExists = localId ? localLists.some(l => l.id === localId) : false;
        if (alreadyExists) continue;

        const newLocalId = await db.createShoppingList({
          name: remote.name,
          foreignID: remote.id,
          updated: remote.updated
        });

        await pb.collection('shoppingLists').update(remote.id, {
          foreignID: newLocalId,
          updated: remote.updated
        });
      }

      logSyncInfo('✅ Shopping lists synced');
    } catch (error) {
      logSyncError('Shopping lists sync error', error);
      throw error;
    } finally {
      hideSyncProgress();
    }
  };

  const syncShoppingItems = async (): Promise<void> => {
    const lists = await db.getShoppingLists();
    const localItems: ShoppingItem[] = [];
    const localListRemoteId = new Map<number, string>();
    const remoteListToLocal = new Map<string, number>();
    for (const list of lists) {
      if (!list.id) continue;
      const items = await db.getShoppingItems(list.id);
      localItems.push(...items);
      if (list.foreignID) {
        localListRemoteId.set(list.id, list.foreignID);
        remoteListToLocal.set(list.foreignID, list.id);
      }
    }

    showSyncProgress('Einkaufsartikel', localItems.length);
    await authenticateUserIfNeeded();
    const pb = pocketbase.getInstance();
    if (!pb || !pocketbase.isAuthenticated()) {
      hideSyncProgress();
      return;
    }

    const authorId = await resolveAuthorIdForSync();

    try {
      logSyncInfo('🔄 Syncing shopping items...');
      const remoteItems = await pb.collection('shoppingItems').getFullList({ sort: '-updated' });
      const remoteById = new Map<string, any>();
      const remoteByForeignId = new Map<number, any>();
      for (const remote of remoteItems) {
        remoteById.set(remote.id, remote);
        const localId = parseLocalIdFromForeign(remote.foreignID);
        if (localId) {
          remoteByForeignId.set(localId, remote);
        }
      }

      const handledRemoteIds = new Set<string>();
      const missingLocalListWarnings = new Set<string>();
      let processed = 0;
      const resolveRemoteListId = (listId?: number): string | null => {
        if (!listId) return null;
        return localListRemoteId.get(listId) ?? null;
      };
      const resolveLocalListId = (remoteListId?: string | number | null): number | null => {
        if (!remoteListId) return null;
        return remoteListToLocal.get(String(remoteListId)) ?? null;
      };

      for (const item of localItems) {
        if (!item.id) continue;
        let remote = item.foreignID ? remoteById.get(item.foreignID) : undefined;
        if (!remote) {
          remote = remoteByForeignId.get(item.id);
        }

        const remoteListId = resolveRemoteListId(item.listId);
        if (!remoteListId) {
          const warningKey = `missing-remote-list-${item.listId}`;
          if (!missingLocalListWarnings.has(warningKey)) {
            missingLocalListWarnings.add(warningKey);
            logSyncWarn('Shopping item list has no remote reference, skipping sync', { itemId: item.id });
          }
          processed++;
          updateSyncProgress(processed);
          continue;
        }

        if (!remote) {
          const created = await pb.collection('shoppingItems').create(attachAuthorToPayload(buildShoppingItemPayload(item, remoteListId), authorId));
          handledRemoteIds.add(created.id);
          await db.updateShoppingItem(item.id, {
            foreignID: created.id,
            updated: item.updated
          });
        } else {
          handledRemoteIds.add(remote.id);
          const localTs = parseTimestamp(item.updated);
          const remoteTs = parseTimestamp(remote.updated);
            if (localTs > remoteTs) {
              const updatedRemote = await pb.collection('shoppingItems').update(remote.id, attachAuthorToPayload(buildShoppingItemPayload(item, remoteListId), authorId));
            await db.updateShoppingItem(item.id, {
              foreignID: updatedRemote.id,
              updated: item.updated
            });
          } else if (remoteTs > localTs) {
            const resolvedListId = resolveLocalListId(remote.listId);
            if (!resolvedListId) {
              logSyncWarn('Remote shopping item references unknown list, skipping', { remoteId: remote.id, listId: remote.listId });
            } else {
              await db.updateShoppingItem(item.id, {
                name: remote.name,
                quantity: remote.quantity ?? undefined,
                completed: Boolean(remote.completed),
                foreignID: remote.id,
                updated: remote.updated
              });
            }
          } else if (item.foreignID !== remote.id) {
            await db.updateShoppingItem(item.id, {
              foreignID: remote.id,
              updated: remote.updated
            });
          }
        }

        processed++;
        updateSyncProgress(processed);
      }

      for (const remote of remoteItems) {
        if (handledRemoteIds.has(remote.id)) continue;
        const listId = resolveLocalListId(remote.listId);
        if (!listId) continue;
        const localId = parseLocalIdFromForeign(remote.foreignID);
        const alreadyExists = localId ? localItems.some(item => item.id === localId) : false;
        if (alreadyExists) continue;

          const newLocalId = await db.createShoppingItem({
          listId,
          name: remote.name,
          quantity: remote.quantity ?? null,
          completed: Boolean(remote.completed),
          foreignID: remote.id,
          updated: remote.updated
        });

          await pb.collection('shoppingItems').update(remote.id, {
          foreignID: newLocalId,
          updated: remote.updated
        });
      }

      logSyncInfo('✅ Shopping items synced');
    } catch (error) {
      logSyncError('Shopping items sync error', error);
      throw error;
    } finally {
      hideSyncProgress();
    }
  };

  const syncTodoLists = async (): Promise<void> => {
    const localLists = await db.getTodoLists();
    showSyncProgress('ToDo-Listen', localLists.length);
    await authenticateUserIfNeeded();
    const pb = pocketbase.getInstance();
    if (!pb || !pocketbase.isAuthenticated()) {
      hideSyncProgress();
      return;
    }

    const authorId = await resolveAuthorIdForSync();

    try {
      logSyncInfo('🔄 Syncing todo lists...');
      const remoteLists = await pb.collection('todoLists').getFullList({ sort: '-updated' });
      const remoteById = new Map<string, any>();
      const remoteByForeignId = new Map<number, any>();
      for (const remote of remoteLists) {
        remoteById.set(remote.id, remote);
        const localId = parseLocalIdFromForeign(remote.foreignID);
        if (localId) {
          remoteByForeignId.set(localId, remote);
        }
      }

      const handledRemoteIds = new Set<string>();
      let processed = 0;
      for (const list of localLists) {
        if (!list.id) continue;

        let remote = list.foreignID ? remoteById.get(list.foreignID) : undefined;
        if (!remote) {
          remote = remoteByForeignId.get(list.id);
        }

        if (!remote) {
          const created = await pb.collection('todoLists').create(attachAuthorToPayload(buildTodoListPayload(list), authorId));
          handledRemoteIds.add(created.id);
          await db.updateTodoList(list.id, {
            foreignID: created.id,
            updated: list.updated
          });
        } else {
          handledRemoteIds.add(remote.id);
          const localTs = parseTimestamp(list.updated);
          const remoteTs = parseTimestamp(remote.updated);
          if (localTs > remoteTs) {
            const updatedRemote = await pb.collection('todoLists').update(remote.id, attachAuthorToPayload(buildTodoListPayload(list), authorId));
            await db.updateTodoList(list.id, {
              foreignID: updatedRemote.id,
              updated: list.updated
            });
          } else if (remoteTs > localTs) {
            await db.updateTodoList(list.id, {
              name: remote.name,
              foreignID: remote.id,
              updated: remote.updated
            });
          } else if (list.foreignID !== remote.id) {
            await db.updateTodoList(list.id, {
              foreignID: remote.id,
              updated: remote.updated
            });
          }
        }

        processed++;
        updateSyncProgress(processed);
      }

      for (const remote of remoteLists) {
        if (handledRemoteIds.has(remote.id)) continue;
        const localId = parseLocalIdFromForeign(remote.foreignID);
        const alreadyExists = localId ? localLists.some(l => l.id === localId) : false;
        if (alreadyExists) continue;

        const newLocalId = await db.createTodoList({
          name: remote.name ?? 'ToDo-Liste',
          foreignID: remote.id,
          updated: remote.updated ?? new Date().toISOString()
        });

        await pb.collection('todoLists').update(remote.id, {
          foreignID: newLocalId,
          updated: remote.updated
        });
      }

      logSyncInfo('✅ Todo lists synced');
    } catch (error) {
      logSyncError('Todo lists sync error', error);
      throw error;
    } finally {
      hideSyncProgress();
    }
  };

  const syncTodoItems = async (): Promise<void> => {
    const lists = await db.getTodoLists();
    const localItems: TodoItem[] = [];
    const localListRemoteId = new Map<number, string>();
    const remoteListToLocal = new Map<string, number>();
    for (const list of lists) {
      if (!list.id) continue;
      const items = await db.getTodoItems(list.id);
      localItems.push(...items);
      if (list.foreignID) {
        localListRemoteId.set(list.id, list.foreignID);
        remoteListToLocal.set(list.foreignID, list.id);
      }
    }

    showSyncProgress('ToDo-Items', localItems.length);
    await authenticateUserIfNeeded();
    const pb = pocketbase.getInstance();
    if (!pb || !pocketbase.isAuthenticated()) {
      hideSyncProgress();
      return;
    }

    const authorId = await resolveAuthorIdForSync();

    try {
      logSyncInfo('🔄 Syncing todo items...');
      const remoteItems = await pb.collection('todoItems').getFullList({ sort: '-updated' });
      const remoteById = new Map<string, any>();
      const remoteByForeignId = new Map<number, any>();
      for (const remote of remoteItems) {
        remoteById.set(remote.id, remote);
        const localId = parseLocalIdFromForeign(remote.foreignID);
        if (localId) {
          remoteByForeignId.set(localId, remote);
        }
      }

      const handledRemoteIds = new Set<string>();
      const missingLocalListWarnings = new Set<string>();
      let processed = 0;
      const resolveRemoteListId = (listId?: number): string | null => {
        if (!listId) return null;
        return localListRemoteId.get(listId) ?? null;
      };
      const resolveLocalListId = (remoteListId?: string | number | null): number | null => {
        if (!remoteListId) return null;
        return remoteListToLocal.get(String(remoteListId)) ?? null;
      };

      for (const item of localItems) {
        if (!item.id) continue;
        let remote = item.foreignID ? remoteById.get(item.foreignID) : undefined;
        if (!remote) {
          remote = remoteByForeignId.get(item.id);
        }

        const remoteListId = resolveRemoteListId(item.listId);
        if (!remoteListId) {
          const warningKey = `missing-todo-list-${item.listId}`;
          if (!missingLocalListWarnings.has(warningKey)) {
            missingLocalListWarnings.add(warningKey);
            logSyncWarn('Todo item list has no remote reference, skipping sync', { itemId: item.id });
          }
          processed++;
          updateSyncProgress(processed);
          continue;
        }

        if (!remote) {
          const created = await pb.collection('todoItems').create(attachAuthorToPayload(buildTodoItemPayload(item, remoteListId), authorId));
          handledRemoteIds.add(created.id);
          await db.updateTodoItem(item.id, {
            foreignID: created.id,
            updated: item.updated
          });
        } else {
          handledRemoteIds.add(remote.id);
          const localTs = parseTimestamp(item.updated);
          const remoteTs = parseTimestamp(remote.updated);
            if (localTs > remoteTs) {
              const updatedRemote = await pb.collection('todoItems').update(remote.id, attachAuthorToPayload(buildTodoItemPayload(item, remoteListId), authorId));
            await db.updateTodoItem(item.id, {
              foreignID: updatedRemote.id,
              updated: item.updated
            });
          } else if (remoteTs > localTs) {
            const resolvedListId = resolveLocalListId(remote.listId);
            if (!resolvedListId) {
              logSyncWarn('Remote todo item references unknown list, skipping', { remoteId: remote.id, listId: remote.listId });
            } else {
              await db.updateTodoItem(item.id, {
                title: remote.title,
                description: remote.description ?? undefined,
                completed: Boolean(remote.completed),
                photoPath: remote.photoPath ?? undefined,
                dueDate: remote.dueDate ?? undefined,
                completionDate: remote.completionDate ?? undefined,
                foreignID: remote.id,
                updated: remote.updated
              });
            }
          } else if (item.foreignID !== remote.id) {
            await db.updateTodoItem(item.id, {
              foreignID: remote.id,
              updated: remote.updated
            });
          }
        }

        processed++;
        updateSyncProgress(processed);
      }

      for (const remote of remoteItems) {
        if (handledRemoteIds.has(remote.id)) continue;
        const listId = resolveLocalListId(remote.listId);
        if (!listId) continue;
        const localId = parseLocalIdFromForeign(remote.foreignID);
        const alreadyExists = localId ? localItems.some(item => item.id === localId) : false;
        if (alreadyExists) continue;

        const newLocalId = await db.createTodoItem({
          listId,
          title: remote.title,
          description: remote.description ?? undefined,
          completed: Boolean(remote.completed),
          photoPath: remote.photoPath ?? undefined,
          dueDate: remote.dueDate ?? undefined,
          completionDate: remote.completionDate ?? undefined,
          foreignID: remote.id,
          updated: remote.updated
        });

        await pb.collection('todoItems').update(remote.id, {
          foreignID: newLocalId,
          updated: remote.updated
        });
      }

      logSyncInfo('✅ Todo items synced');
    } catch (error) {
      logSyncError('Todo items sync error', error);
      throw error;
    } finally {
      hideSyncProgress();
    }
  };

  const syncRoutes = async (): Promise<void> => {
    const localRoutes = await db.getRoutes();
    showSyncProgress('Routen', localRoutes.length);
    await authenticateUserIfNeeded();
    const pb = pocketbase.getInstance();
    if (!pb || !pocketbase.isAuthenticated()) {
      hideSyncProgress();
      return;
    }

    const authorId = await resolveAuthorIdForSync();

    try {
      logSyncInfo('🔄 Syncing routes...');
      const remoteRoutes = await pb.collection('routes').getFullList({ sort: '-updated' });
      const remoteById = new Map<string, any>();
      const remoteByForeignId = new Map<number, any>();
      for (const remote of remoteRoutes) {
        remoteById.set(remote.id, remote);
        const localId = parseLocalIdFromForeign(remote.foreignID);
        if (localId) {
          remoteByForeignId.set(localId, remote);
        }
      }

      const handledRemoteIds = new Set<string>();
      let processed = 0;
      for (const route of localRoutes) {
        if (!route.id) continue;

        let remote = route.foreignID ? remoteById.get(route.foreignID) : undefined;
        if (!remote) {
          remote = remoteByForeignId.get(route.id);
        }

        if (!remote) {
          const created = await pb.collection('routes').create(attachAuthorToPayload(buildRoutePayload(route), authorId));
          handledRemoteIds.add(created.id);
          await db.updateRoute(route.id, {
            foreignID: created.id,
            updated: route.updated
          });
        } else {
          handledRemoteIds.add(remote.id);
          const localTs = parseTimestamp(route.updated);
          const remoteTs = parseTimestamp(remote.updated);
          if (localTs > remoteTs) {
            const updatedRemote = await pb.collection('routes').update(remote.id, attachAuthorToPayload(buildRoutePayload(route), authorId));
            await db.updateRoute(route.id, {
              foreignID: updatedRemote.id,
              updated: route.updated
            });
          } else if (remoteTs > localTs) {
            await db.updateRoute(route.id, {
              name: resolveRemoteRouteName(remote.name, remote.startTime),
              description: remote.description ?? undefined,
              startTime: remote.startTime,
              endTime: remote.endTime ?? undefined,
              distance: remote.distance ?? undefined,
              duration: remote.duration ?? undefined,
              travelMode: remote.travelMode ?? undefined,
              isRecording: Boolean(remote.isRecording),
              foreignID: remote.id,
              updated: remote.updated
            });
          } else if (route.foreignID !== remote.id) {
            await db.updateRoute(route.id, {
              foreignID: remote.id,
              updated: remote.updated
            });
          }
        }

        processed++;
        updateSyncProgress(processed);
      }

      for (const remote of remoteRoutes) {
        if (handledRemoteIds.has(remote.id)) continue;
        const localId = parseLocalIdFromForeign(remote.foreignID);
        const alreadyExists = localId ? localRoutes.some(r => r.id === localId) : false;
        if (alreadyExists) continue;

        const newLocalId = await db.createRoute({
          name: resolveRemoteRouteName(remote.name, remote.startTime),
          description: remote.description ?? undefined,
          startTime: remote.startTime,
          endTime: remote.endTime ?? undefined,
          distance: remote.distance ?? undefined,
          duration: remote.duration ?? undefined,
          travelMode: remote.travelMode ?? undefined,
          isRecording: Boolean(remote.isRecording),
          foreignID: remote.id,
          updated: remote.updated
        });

        await pb.collection('routes').update(remote.id, {
          foreignID: newLocalId,
          updated: remote.updated
        });
      }

      logSyncInfo('✅ Routes synced');
    } catch (error) {
      logSyncError('Routes sync error', error);
      throw error;
    } finally {
      hideSyncProgress();
    }
  };

  const syncWaypoints = async (): Promise<void> => {
    const localRoutes = await db.getRoutes();
    const localRoutesById = new Map<number, Route>();
    const localWaypoints: Waypoint[] = [];
    const localWaypointsById = new Map<number, Waypoint>();

    for (const route of localRoutes) {
      if (!route.id) continue;
      localRoutesById.set(route.id, route);
      const routeWaypoints = await db.getWaypointsByRoute(route.id);
      for (const waypoint of routeWaypoints) {
        localWaypoints.push(waypoint);
        if (waypoint.id) {
          localWaypointsById.set(waypoint.id, waypoint);
        }
      }
    }

    showSyncProgress('Wegpunkte', localWaypoints.length);
    await authenticateUserIfNeeded();
    const pb = pocketbase.getInstance();
    if (!pb || !pocketbase.isAuthenticated()) {
      hideSyncProgress();
      return;
    }

    const authorId = await resolveAuthorIdForSync();

    try {
      logSyncInfo('🔄 Syncing waypoints...');
      const remoteWaypoints = await pb.collection('waypoints').getFullList({ sort: '-updated' });
      const photoReferenceCache = new Map<number, number | null>();
      const resolveLocalPhotoReference = async (
        rawPhotoId?: string | number | null,
        remoteWaypointId?: string
      ): Promise<number | null> => {
        if (!rawPhotoId) return null;
        const candidate = parseLocalIdFromForeign(rawPhotoId);
        if (!candidate) return null;
        if (photoReferenceCache.has(candidate)) {
          return photoReferenceCache.get(candidate) ?? null;
        }
        const photo = await db.getPhoto(candidate);
        const resolvedId = photo?.id ?? null;
        photoReferenceCache.set(candidate, resolvedId);
        if (resolvedId === null) {
          logSyncWarn('Remote waypoint references photo that is not available locally', {
            remoteWaypointId,
            photoId: candidate
          });
        }
        return resolvedId;
      };
      const remoteById = new Map<string, any>();
      const remoteByForeignId = new Map<number, any>();
      for (const remote of remoteWaypoints) {
        remoteById.set(remote.id, remote);
        const localId = parseLocalIdFromForeign(remote.foreignID);
        if (localId) {
          remoteByForeignId.set(localId, remote);
        }
      }

      const handledRemoteIds = new Set<string>();
      let processed = 0;
      for (const waypoint of localWaypoints) {
        if (!waypoint.id) continue;
        if (!localRoutesById.has(waypoint.routeId)) {
          logSyncWarn('Waypoint references unknown route, skipping', { waypointId: waypoint.id, routeId: waypoint.routeId });
          processed++;
          updateSyncProgress(processed);
          continue;
        }

        let remote = waypoint.foreignID ? remoteById.get(waypoint.foreignID) : undefined;
        if (!remote) {
          remote = remoteByForeignId.get(waypoint.id);
        }

        if (!remote) {
          const created = await pb.collection('waypoints').create(attachAuthorToPayload(buildWaypointPayload(waypoint), authorId));
          handledRemoteIds.add(created.id);
          await db.updateWaypoint(waypoint.id, {
            foreignID: created.id,
            updated: waypoint.updated
          });
        } else {
          handledRemoteIds.add(remote.id);
          const localTs = parseTimestamp(waypoint.updated);
          const remoteTs = parseTimestamp(remote.updated);
          if (localTs > remoteTs) {
            const updatedRemote = await pb.collection('waypoints').update(remote.id, attachAuthorToPayload(buildWaypointPayload(waypoint), authorId));
            await db.updateWaypoint(waypoint.id, {
              foreignID: updatedRemote.id,
              updated: waypoint.updated
            });
          } else if (remoteTs > localTs) {
            const remoteCoords = extractCoordinatesFromRecord(remote);
            const resolvedPhotoId = await resolveLocalPhotoReference(remote.photoId, remote.id);
            await db.updateWaypoint(waypoint.id, {
              type: remote.type ?? waypoint.type,
              latitude: remoteCoords.latitude ?? waypoint.latitude,
              longitude: remoteCoords.longitude ?? waypoint.longitude,
              valLatitude:
                remoteCoords.valLatitude ??
                remoteCoords.latitude ??
                waypoint.valLatitude ??
                waypoint.latitude,
              valLongitude:
                remoteCoords.valLongitude ??
                remoteCoords.longitude ??
                waypoint.valLongitude ??
                waypoint.longitude,
              altitude: parseAltitudeFromRemote(remote.altitude) ?? waypoint.altitude ?? undefined,
              accuracy: remote.accuracy ?? waypoint.accuracy ?? undefined,
              name: remote.name ?? undefined,
              description: remote.description ?? undefined,
              photoId: resolvedPhotoId ?? undefined,
              foreignID: remote.id,
              updated: remote.updated ?? waypoint.updated
            });
          } else if (waypoint.foreignID !== remote.id) {
            await db.updateWaypoint(waypoint.id, {
              foreignID: remote.id,
              updated: remote.updated ?? waypoint.updated
            });
          }
        }

        processed++;
        updateSyncProgress(processed);
      }

      for (const remote of remoteWaypoints) {
        if (handledRemoteIds.has(remote.id)) continue;
        const referencedRouteId = parseLocalIdFromForeign(remote.routeId);
        if (!referencedRouteId) continue;
        if (!localRoutesById.has(referencedRouteId)) {
          logSyncWarn('Remote waypoint references missing route, skipping', { remoteId: remote.id, routeId: remote.routeId });
          continue;
        }

        const localId = parseLocalIdFromForeign(remote.foreignID);
        const alreadyExists = localId ? localWaypointsById.has(localId) : false;
        if (alreadyExists) continue;

        const now = new Date().toISOString();
        const remoteCoords = extractCoordinatesFromRecord(remote);
        const remoteAltitude = parseAltitudeFromRemote(remote.altitude);
        const resolvedPhotoId = await resolveLocalPhotoReference(remote.photoId, remote.id);
        const newLocalId = await db.createWaypoint({
          routeId: referencedRouteId,
          type: (remote.type as Waypoint['type']) ?? 'position',
          latitude: remoteCoords.latitude ?? 0,
          longitude: remoteCoords.longitude ?? 0,
          valLatitude: remoteCoords.valLatitude ?? remoteCoords.latitude ?? 0,
          valLongitude: remoteCoords.valLongitude ?? remoteCoords.longitude ?? 0,
          altitude: remoteAltitude ?? undefined,
          accuracy: remote.accuracy ?? undefined,
          name: remote.name ?? undefined,
          description: remote.description ?? undefined,
          photoId: resolvedPhotoId ?? undefined,
          timestamp: remote.timestamp ?? now,
          foreignID: remote.id,
          updated: remote.updated ?? remote.timestamp ?? now
        });

        await pb.collection('waypoints').update(remote.id, {
          foreignID: newLocalId,
          updated: remote.updated ?? remote.timestamp ?? now
        });
      }

      logSyncInfo('✅ Waypoints synced');
    } catch (error) {
      logSyncError('Waypoints sync error', error);
      throw error;
    } finally {
      hideSyncProgress();
    }
  };

  const deleteRemoteRecord = async (collectionName: string, localId: number): Promise<boolean> => {
    const pb = pocketbase.getInstance();
    if (!pb) return false;

    try {
      const filter = `foreignID = "${localId}"`;
      const remoteRecords = await pb.collection(collectionName).getFullList({ sort: '-updated', filter });
      if (!remoteRecords || remoteRecords.length === 0) {
        return true;
      }

      for (const remote of remoteRecords) {
        await pb.collection(collectionName).delete(remote.id);
      }

      return true;
    } catch (error) {
      logSyncWarn(`Failed to delete remote ${collectionName} ${localId}`, error);
      return false;
    }
  };

  const processPendingDeletions = async (): Promise<void> => {
    const pending = await db.getPendingDeletions();
    if (pending.length === 0) return;

    await authenticateUserIfNeeded();
    const pb = pocketbase.getInstance();
    if (!pb || !pocketbase.isAuthenticated()) {
      throw new Error('PocketBase not authenticated for pending deletions');
    }

    logSyncInfo(`Processing ${pending.length} pending deletions`);
    let failed = false;
    for (const entry of pending) {
      if (!entry.id) continue;
      const success = await deleteRemoteRecord(entry.entity, entry.localId);
      if (success) {
        await db.removeDeletionEntry(entry.id);
      } else {
        failed = true;
      }
    }

    if (failed) {
      throw new Error('Pending deletions could not be fully processed');
    }
  };

  const runFullSync = async () => {
    logSyncInfo('Starting full sync run');
    await loadLastSyncTime();
    await processPendingDeletions();
    
    await syncGalleries();
    await syncPhotos();
    await syncBookCategories();
    await syncBooks();
    await syncWineCategories();
    await syncWines();
    await syncWinePhotos();
    await syncShoppingLists();
    await syncShoppingItems();
    await syncTodoLists();
    await syncTodoItems();
    await syncRoutes();
    await syncWaypoints();
    
    await saveLastSyncTime();
    
    logSyncInfo('✅ Full sync completed');
  };

  const syncAll = async (): Promise<boolean> => {
    logSyncInfo('syncAll requested');
    if (isSyncing.value) {
      logSyncWarn('Sync already in progress');
      return false;
    }

    const ready = await ensurePocketbaseConfiguredAndAuthenticated();
    if (!ready) {
      return false;
    }

    isSyncing.value = true;
    const needsRealtimeResume = await pauseRealtimeNotifications();
    let syncCompleted = false;

    try {
      await runBackgroundOperation(async () => {
        await runFullSync();
      });
      syncCompleted = true;
    } catch (error) {
      logSyncError('Sync failed', error);
      throw error;
    } finally {
      if (needsRealtimeResume) {
        await resumeRealtimeNotifications();
      }
      isSyncing.value = false;
    }

    return syncCompleted;
  };

  // Check if auto-sync is enabled
  const shouldAutoSync = async (): Promise<boolean> => {
    const [{ value: autoValue }, { value: wifiOnlyValue }] = await Promise.all([
      Preferences.get({ key: 'auto_sync' }),
      Preferences.get({ key: 'sync_only_on_wifi' })
    ]);

    const auto = autoValue === 'true';
    const wifiOnly = wifiOnlyValue === 'true';

    if (!auto) return false;

    if (!wifiOnly) return true;

    // If wifi-only is set, check current network status
    try {
      // Dynamic import to avoid bundling '@capacitor/network' for web builds
      const spec = '@capacitor/network';
      const mod = await import(/* @vite-ignore */ spec);
      const Network = (mod as any).Network;
      if (!Network || !Network.getStatus) {
        logSyncWarn('Network plugin not available at runtime');
        return false;
      }
      const status = await Network.getStatus();
      return status.connected && status.connectionType === 'wifi';
    } catch (e) {
      // If network plugin unavailable, be conservative: do not auto-sync
      logSyncWarn('Network plugin unavailable, skipping auto-sync due to wifi-only setting', e);
      return false;
    }
  };

  // Trigger sync if auto-sync is enabled
  const autoSyncIfEnabled = async () => {
    const enabled = await shouldAutoSync();
    if (enabled) {
      await syncAll();
    }
  };

  return {
    isSyncing,
    lastSyncTime,
    syncGalleries,
    syncPhotos,
    syncBookCategories,
    syncBooks,
    syncWineCategories,
    syncWines,
    syncWinePhotos,
    syncShoppingLists,
    syncShoppingItems,
    syncTodoLists,
    syncTodoItems,
    syncRoutes,
    syncAll,
    autoSyncIfEnabled,
    subscribeToGalleries,
    subscribeToAllEntities,
    unsubscribeFromGalleries,
    unsubscribeFromAllEntities,
    syncWaypoints,
    ensurePocketbaseConfiguredAndAuthenticated,
    syncProgress: syncProgressState
  };
}
