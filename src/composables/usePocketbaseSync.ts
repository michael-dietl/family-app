
import { ref, reactive, readonly } from 'vue';
import { Capacitor } from '@capacitor/core';
import { pocketbase } from '@/services/pocketbase';
import { db, type Gallery, type Photo, type Book } from '@/services/database';
import { Preferences } from '@capacitor/preferences';
import { toastController } from '@ionic/vue';
import type { UnsubscribeFunc } from 'pocketbase';
import { uploadFileToPocketBase } from '@/utils/pbFileUploadExample';

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
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`Cover fetch failed (${response.status})`);
    }
    return await response.blob();
  } catch (error) {
    console.warn('Could not fetch cover blob for upload', { coverImage, error });
    return null;
  }
};
const uploadCoverForBook = async (recordId: string, coverImage?: string) => {
  if (!coverImage || !shouldUploadCoverImage(coverImage)) return null;
  const blob = await fetchCoverBlob(coverImage);
  if (!blob) return null;
  try {
    return await uploadFileToPocketBase('books', recordId, blob, 'cover');
  } catch (error) {
    console.warn('Cover upload failed for book', { recordId, error });
    return null;
  }
};

const uploadPhotoPicture = async (recordId: string, filepath?: string) => {
  if (!filepath) return null;
  const blob = await fetchCoverBlob(filepath);
  if (!blob) return null;
  try {
    return await uploadFileToPocketBase('photos', recordId, blob, 'picture');
  } catch (error) {
    console.warn('Picture upload failed for photo', { recordId, error });
    return null;
  }
};

export function usePocketbaseSync() {
  // Hilfsfunktion: Automatische Authentifizierung, falls nötig
  async function authenticateUserIfNeeded() {
    await pocketbase.initialize();
    if (!pocketbase.isAuthenticated()) {
      // Versuche Login mit gespeicherten Credentials
      const [{ value: url }, { value: email }, { value: password }] = await Promise.all([
        Preferences.get({ key: 'pocketbase_url' }),
        Preferences.get({ key: 'pocketbase_email' }),
        Preferences.get({ key: 'pocketbase_password' })
      ]);
      if (url && email && password) {
        const pb = pocketbase.getInstance();
        if (pb) {
          try {
            await pb.collection('users').authWithPassword(email, password);
            // Token wird automatisch gespeichert
            await pocketbase.initialize(); // Token übernehmen
          } catch (e) {
            console.warn('Automatische Authentifizierung fehlgeschlagen:', e);
          }
        }
      }
    }
  }

  const isSyncing = ref(false);
  const lastSyncTime = ref<string | null>(null);

  // Fortschritt-Overlay State
  const syncProgress = reactive({
    open: false,
    entity: '', // z.B. 'Bücher', 'Fotos', 'Galerien'
    current: 0,
    total: 0
  });

  let gallerySubscription: UnsubscribeFunc | null = null;

  function showSyncProgress(entity: string, total: number) {
    syncProgress.open = true;
    syncProgress.entity = entity;
    syncProgress.current = 0;
    syncProgress.total = total;
  }
  function updateSyncProgress(current: number) {
    syncProgress.current = current;
  }
  function hideSyncProgress() {
    syncProgress.open = false;
  }

  const presentGalleryToast = async (message: string) => {
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

  const subscribeToGalleries = async (): Promise<void> => {
    await authenticateUserIfNeeded();
    const pb = pocketbase.getInstance();
    if (!pb || !pocketbase.isAuthenticated()) {
      console.warn('PocketBase not authenticated -> cannot subscribe to galleries');
      return;
    }
    if (gallerySubscription) {
      await gallerySubscription();
      gallerySubscription = null;
    }

    try {
      gallerySubscription = await pb.collection('galleries').subscribe('*', (event) => {
        const title = event.record?.name || `ID ${event.record?.id ?? 'unknown'}`;
        const action = () => {
          switch (event.action) {
            case 'create':
              return `Neue Galerie angelegt: ${title}`;
            case 'update':
              return `Galerie aktualisiert: ${title}`;
            case 'delete':
              return `Galerie gelöscht: ${title}`;
            default:
              return `Galerie-Event (${event.action}): ${title}`;
          }
        };
        void presentGalleryToast(action());
      });
    } catch (error) {
      console.error('Gallery realtime subscription failed:', error);
      gallerySubscription = null;
    }
  };

  const unsubscribeFromGalleries = async (): Promise<void> => {
    if (gallerySubscription) {
      await gallerySubscription();
      gallerySubscription = null;
    }
  };

  // Gallery Sync
  const syncGalleries = async (): Promise<void> => {
    // Fortschritt anzeigen
    const localGalleries = await db.getGalleries();
    showSyncProgress('Galerien', localGalleries.length);
    await authenticateUserIfNeeded();
    const pb = pocketbase.getInstance();
    if (!pb || !pocketbase.isAuthenticated()) {
      console.warn('PocketBase not configured or not authenticated');
      hideSyncProgress();
      return;
    }

    try {
      console.log('🔄 Syncing galleries...');
      let i = 0;
      for (const gallery of localGalleries) {
        try {
          // Check if gallery exists in PocketBase
          const existingRecords = await pb.collection('galleries').getList(1, 1, {
            filter: `foreignID = "${gallery.id}"`
          });
          const data = {
            foreignID: gallery.id,
            name: gallery.name,
            description: gallery.description || '',
            coverPhotoId: gallery.coverPhotoId,
            startDate: gallery.startDate || null,
            endDate: gallery.endDate || null,
            updated: gallery.updated
          };
          if (existingRecords.items.length > 0) {
            const remote = existingRecords.items[0];
            await pb.collection('galleries').update(remote.id, data);
            await db.updateGallery(gallery.id!, {
              foreignID: remote.id,
              updated: gallery.updated
            });
          } else {
            const created = await pb.collection('galleries').create(data);
            await db.updateGallery(gallery.id!, {
              foreignID: created.id,
              updated: gallery.updated
            });
          }
        } catch (error) {
          console.error(`Failed to sync gallery ${gallery.id}:`, error);
        }
        i++;
        updateSyncProgress(i);
      }
      // Download remote galleries (kein Fortschritt nötig)
      const remoteGalleries = await pb.collection('galleries').getFullList({ sort: '-updated' });
      for (const remote of remoteGalleries) {
        try {
          const remoteLocalId = remote.foreignID ? Number(remote.foreignID) : remote.localId ? Number(remote.localId) : null;
          const localGallery = remoteLocalId ? localGalleries.find(g => g.id === remoteLocalId) : null;
          if (!localGallery) {
            await db.createGallery({
              name: remote.name,
              description: remote.description || undefined,
              coverPhotoId: remote.coverPhotoId || undefined,
              startDate: remote.startDate || undefined,
              endDate: remote.endDate || undefined,
              foreignID: remote.id,
              updated: remote.updated
            });
          } else if (new Date(remote.updated) > new Date(localGallery.updated)) {
            await db.updateGallery(localGallery.id!, {
              name: remote.name,
              description: remote.description || undefined,
              coverPhotoId: remote.coverPhotoId || undefined,
              startDate: remote.startDate || undefined,
              endDate: remote.endDate || undefined,
              foreignID: remote.id,
              updated: remote.updated
            });
          }
        } catch (error) {
          console.error(`Failed to sync remote gallery:`, error);
        }
      }
      console.log('✅ Galleries synced');
    } catch (error) {
      console.error('Gallery sync error:', error);
      throw error;
    } finally {
      hideSyncProgress();
    }
  };

  // Photos Sync
  const syncPhotos = async (): Promise<void> => {
    const galleries = await db.getGalleries();
    let total = 0;
    for (const gallery of galleries) {
      const localPhotos = await db.getPhotosByGallery(gallery.id!);
      total += localPhotos.length;
    }
    showSyncProgress('Fotos', total);
    await authenticateUserIfNeeded();
    const pb = pocketbase.getInstance();
    if (!pb || !pocketbase.isAuthenticated()) {
      hideSyncProgress();
      return;
    }
    try {
      console.log('🔄 Syncing photos...');
      let i = 0;
      for (const gallery of galleries) {
        const localPhotos = await db.getPhotosByGallery(gallery.id!);
        for (const photo of localPhotos) {
          try {
            const existingRecords = await pb.collection('photos').getList(1, 1, {
              filter: `foreignID = "${photo.id}"`
            });
            const data = {
              foreignID: photo.id,
              galleryId: photo.galleryId,
              filename: photo.filename,
              width: photo.width,
              height: photo.height,
              filesize: photo.filesize,
              mimeType: photo.mimeType,
              isVideo: photo.isVideo,
              latitude: photo.latitude,
              longitude: photo.longitude,
              dateTaken: photo.dateTaken,
              camera: photo.camera,
              lens: photo.lens,
              focalLength: photo.focalLength,
              aperture: photo.aperture,
              shutterSpeed: photo.shutterSpeed,
              iso: photo.iso,
              created: photo.created,
              updated: photo.updated
            };
            let remoteRecord: any;
            if (existingRecords.items.length > 0) {
              const remote = existingRecords.items[0];
              remoteRecord = await pb.collection('photos').update(remote.id, data);
            } else {
              remoteRecord = await pb.collection('photos').create(data);
            }

            const pictureUploadRecord = await uploadPhotoPicture(remoteRecord.id, photo.filepath);
            const finalRemoteRecord = pictureUploadRecord || remoteRecord;

            await db.updatePhoto(photo.id!, {
              foreignID: finalRemoteRecord.id,
              updated: photo.updated
            });
          } catch (error) {
            console.error(`Failed to sync photo ${photo.id}:`, error);
          }
          i++;
          updateSyncProgress(i);
        }
      }
      console.log('✅ Photos metadata synced');
    } catch (error) {
      console.error('Photo sync error:', error);
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
    try {
      console.log('🔄 Syncing books...');
      let i = 0;
      for (const book of localBooks) {
        try {
          const filter = book.foreignID ? `id = "${book.foreignID}"` : `isbn = "${book.isbn}"`;
          const existingRecords = await pb.collection('books').getList(1, 1, {
            filter
          });
          const payloadCoverImage = isRemoteHttpUrl(book.coverImage) ? book.coverImage : '';
          const data = {
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
            coverImage: payloadCoverImage,
            categoryId: book.categoryId,
            notes: book.notes || '',
            rating: book.rating || 0,
            read: book.read || false,
          };
          let remoteRecord: any;
          if (existingRecords.items.length > 0) {
            const remote = existingRecords.items[0];
            remoteRecord = await pb.collection('books').update(remote.id, data);
          } else {
            remoteRecord = await pb.collection('books').create(data);
          }

          const coverUploadRecord = await uploadCoverForBook(remoteRecord.id, book.coverImage);
          const finalRemoteRecord = coverUploadRecord || remoteRecord;
          const remoteCoverUrl = getRemoteCoverUrlFromRecord(finalRemoteRecord);

          await db.updateBook(book.id!, {
            foreignID: finalRemoteRecord.id,
            updated: book.updated,
            coverImage: remoteCoverUrl || book.coverImage
          });
        } catch (error) {
          console.error(`Failed to sync book ${book.isbn}:`, error);
        }
        i++;
        updateSyncProgress(i);
      }
      // Download remote books (kein Fortschritt nötig)
      const remoteBooks = await pb.collection('books').getFullList();
      for (const remote of remoteBooks) {
        try {
          const localBook = localBooks.find(b => b.isbn === remote.isbn);
          const remoteCoverUrl = getRemoteCoverUrlFromRecord(remote);
          if (!localBook) {
            await db.createBook({
              isbn: remote.isbn,
              title: remote.title,
              subtitle: remote.subtitle,
              authors: remote.authors,
              publisher: remote.publisher,
              publishedDate: remote.publishedDate,
              description: remote.description,
              pageCount: remote.pageCount,
              categories: remote.categories,
              language: remote.language,
              coverImage: remoteCoverUrl,
              categoryId: remote.categoryId,
              notes: remote.notes,
              rating: remote.rating,
              read: remote.read,
              foreignID: remote.id,
              updated: remote.updated
            });
          } else if (new Date(remote.updated) > new Date(localBook.updated)) {
            await db.updateBook(localBook.id!, {
              title: remote.title,
              subtitle: remote.subtitle,
              authors: remote.authors,
              publisher: remote.publisher,
              publishedDate: remote.publishedDate,
              description: remote.description,
              pageCount: remote.pageCount,
              categories: remote.categories,
              language: remote.language,
              coverImage: remoteCoverUrl,
              categoryId: remote.categoryId,
              notes: remote.notes,
              rating: remote.rating,
              read: remote.read,
              foreignID: remote.id,
              updated: remote.updated
            });
          }
        } catch (error) {
          console.error(`Failed to sync remote book:`, error);
        }
      }
      console.log('✅ Books synced');
    } catch (error) {
      console.error('Book sync error:', error);
      throw error;
    } finally {
      hideSyncProgress();
    }
  };

  // Full Sync
  const syncAll = async (): Promise<void> => {
    if (isSyncing.value) {
      console.warn('Sync already in progress');
      return;
    }

    await authenticateUserIfNeeded();

    if (!pocketbase.isConfigured()) {
      console.warn('PocketBase not configured');
      return;
    }

    if (!pocketbase.isAuthenticated()) {
      console.warn('Not authenticated with PocketBase');
      return;
    }

    isSyncing.value = true;

    try {
      await loadLastSyncTime();
      
      await syncGalleries();
      await syncPhotos();
      await syncBooks();
      
      await saveLastSyncTime();
      
      console.log('✅ Full sync completed');
    } catch (error) {
      console.error('Sync failed:', error);
      throw error;
    } finally {
      isSyncing.value = false;
    }
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
        console.warn('Network plugin not available at runtime');
        return false;
      }
      const status = await Network.getStatus();
      return status.connected && status.connectionType === 'wifi';
    } catch (e) {
      // If network plugin unavailable, be conservative: do not auto-sync
      console.warn('Network plugin unavailable, skipping auto-sync due to wifi-only setting', e);
      return false;
    }
  };

  // Trigger sync if auto-sync is enabled
  const autoSyncIfEnabled = async () => {
    const enabled = await shouldAutoSync();
    if (enabled && pocketbase.isAuthenticated()) {
      await syncAll();
    }
  };

  return {
    isSyncing,
    lastSyncTime,
    syncGalleries,
    syncPhotos,
    syncBooks,
    syncAll,
    autoSyncIfEnabled,
    subscribeToGalleries,
    unsubscribeFromGalleries,
    syncProgress: readonly(syncProgress)
  };
}
