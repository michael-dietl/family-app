import { ref } from 'vue';
import { pocketbase } from '@/services/pocketbase';
import { db, type Gallery, type Photo, type Book } from '@/services/database';
import { Preferences } from '@capacitor/preferences';

export function usePocketbaseSync() {
  const isSyncing = ref(false);
  const lastSyncTime = ref<string | null>(null);

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
    const pb = pocketbase.getInstance();
    if (!pb || !pocketbase.isAuthenticated()) {
      console.warn('PocketBase not configured or not authenticated');
      return;
    }

    try {
      console.log('🔄 Syncing galleries...');

      // Upload local galleries
      const localGalleries = await db.getGalleries();
      
      for (const gallery of localGalleries) {
        try {
          // Check if gallery exists in PocketBase
          const existingRecords = await pb.collection('galleries').getList(1, 1, {
            filter: `localId = "${gallery.id}"`
          });

          const data = {
            localId: gallery.id,
            name: gallery.name,
            description: gallery.description || '',
            coverPhotoId: gallery.coverPhotoId,
            startDate: gallery.startDate || null,
            endDate: gallery.endDate || null,
            updated: gallery.updated
          };

          if (existingRecords.items.length > 0) {
            // Update existing
            await pb.collection('galleries').update(existingRecords.items[0].id, data);
          } else {
            // Create new
            await pb.collection('galleries').create(data);
          }
        } catch (error) {
          console.error(`Failed to sync gallery ${gallery.id}:`, error);
        }
      }

      // Download remote galleries
      const remoteGalleries = await pb.collection('galleries').getFullList({
        sort: '-updated'
      });

      for (const remote of remoteGalleries) {
        try {
          const localGallery = localGalleries.find(g => g.id === remote.localId);
          
          if (!localGallery) {
            // Create locally if not exists
            await db.createGallery({
              name: remote.name,
              description: remote.description || undefined,
              coverPhotoId: remote.coverPhotoId || undefined,
              startDate: remote.startDate || undefined,
              endDate: remote.endDate || undefined
            });
          } else if (new Date(remote.updated) > new Date(localGallery.updated)) {
            // Update local if remote is newer
            await db.updateGallery(localGallery.id!, {
              name: remote.name,
              description: remote.description || undefined,
              coverPhotoId: remote.coverPhotoId || undefined,
              startDate: remote.startDate || undefined,
              endDate: remote.endDate || undefined
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
    }
  };

  // Photos Sync
  const syncPhotos = async (): Promise<void> => {
    const pb = pocketbase.getInstance();
    if (!pb || !pocketbase.isAuthenticated()) return;

    try {
      console.log('🔄 Syncing photos...');

      const galleries = await db.getGalleries();
      
      for (const gallery of galleries) {
        const localPhotos = await db.getPhotosByGallery(gallery.id!);

        for (const photo of localPhotos) {
          try {
            const existingRecords = await pb.collection('photos').getList(1, 1, {
              filter: `localId = "${photo.id}"`
            });

            // Prepare photo data (without large base64 data)
            const data = {
              localId: photo.id,
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
              created: photo.created
            };

            if (existingRecords.items.length > 0) {
              await pb.collection('photos').update(existingRecords.items[0].id, data);
            } else {
              await pb.collection('photos').create(data);
            }
          } catch (error) {
            console.error(`Failed to sync photo ${photo.id}:`, error);
          }
        }
      }

      console.log('✅ Photos metadata synced');
    } catch (error) {
      console.error('Photo sync error:', error);
      throw error;
    }
  };

  // Books Sync
  const syncBooks = async (): Promise<void> => {
    const pb = pocketbase.getInstance();
    if (!pb || !pocketbase.isAuthenticated()) return;

    try {
      console.log('🔄 Syncing books...');

      // Upload local books
      const localBooks = await db.getBooks();
      
      for (const book of localBooks) {
        try {
          const existingRecords = await pb.collection('books').getList(1, 1, {
            filter: `isbn = "${book.isbn}"`
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
            read: book.read || false
          };

          if (existingRecords.items.length > 0) {
            await pb.collection('books').update(existingRecords.items[0].id, data);
          } else {
            await pb.collection('books').create(data);
          }
        } catch (error) {
          console.error(`Failed to sync book ${book.isbn}:`, error);
        }
      }

      // Download remote books
      const remoteBooks = await pb.collection('books').getFullList();

      for (const remote of remoteBooks) {
        try {
          const localBook = localBooks.find(b => b.isbn === remote.isbn);
          
          if (!localBook) {
            // Create locally if not exists
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
              read: remote.read
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
    }
  };

  // Full Sync
  const syncAll = async (): Promise<void> => {
    if (isSyncing.value) {
      console.warn('Sync already in progress');
      return;
    }

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
    autoSyncIfEnabled
  };
}
