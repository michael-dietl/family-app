
import { ref, reactive, readonly } from 'vue';
import { pocketbase } from '@/services/pocketbase';
import { db, type Gallery, type Photo, type Book } from '@/services/database';
import { Preferences } from '@capacitor/preferences';
import { toastController } from '@ionic/vue';

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
            if (existingRecords.items.length > 0) {
              const remote = existingRecords.items[0];
              await pb.collection('photos').update(remote.id, data);
              await db.updatePhoto(photo.id!, {
                foreignID: remote.id,
                updated: photo.updated
              });
            } else {
              const created = await pb.collection('photos').create(data);
              await db.updatePhoto(photo.id!, {
                foreignID: created.id,
                updated: photo.updated
              });
            }
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
          const filter = book.foreignID ? `foreignID = "${book.foreignID}"` : `isbn = "${book.isbn}"`;
          const existingRecords = await pb.collection('books').getList(1, 1, {
            filter
          });
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
            coverImage: book.coverImage || '',
            categoryId: book.categoryId,
            notes: book.notes || '',
            rating: book.rating || 0,
            read: book.read || false,
          };
          if (existingRecords.items.length > 0) {
            const remote = existingRecords.items[0];
            await pb.collection('books').update(remote.id, data);
            await db.updateBook(book.id!, {
              foreignID: remote.id,
              updated: book.updated
            });
          } else {
            const created = await pb.collection('books').create(data);
            await db.updateBook(book.id!, {
              foreignID: created.id,
              updated: book.updated
            });
          }
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
              coverImage: remote.coverImage,
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
              coverImage: remote.coverImage,
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
    syncProgress: readonly(syncProgress)
  };
}
