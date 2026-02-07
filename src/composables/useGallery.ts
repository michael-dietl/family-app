import { ref, computed } from 'vue';
import { db, type Gallery, type Photo } from '@/services/database';

const galleries = ref<Gallery[]>([]);
const currentGallery = ref<Gallery | null>(null);
const photos = ref<Photo[]>([]);
const isLoading = ref(false);

export function useGallery() {
  const initialize = async () => {
    try {
      await db.initialize();
      await loadGalleries();
    } catch (error) {
      console.error('Failed to initialize gallery:', error);
      throw error;
    }
  };

  const loadGalleries = async () => {
    isLoading.value = true;
    try {
      galleries.value = await db.getGalleries();
    } catch (error) {
      console.error('Failed to load galleries:', error);
      throw error;
    } finally {
      isLoading.value = false;
    }
  };

  const loadGallery = async (id: number) => {
    isLoading.value = true;
    try {
      currentGallery.value = await db.getGallery(id);
      if (currentGallery.value) {
        photos.value = await db.getPhotosByGallery(id);
      }
    } catch (error) {
      console.error('Failed to load gallery:', error);
      throw error;
    } finally {
      isLoading.value = false;
    }
  };

  const createGallery = async (
    name: string,
    description?: string,
    color?: string,
    startDate?: string,
    endDate?: string
  ) => {
    try {
      const id = await db.createGallery({
        name,
        description,
        color,
        startDate,
        endDate
      });
      await loadGalleries();
      return id;
    } catch (error) {
      console.error('Failed to create gallery:', error);
      throw error;
    }
  };

  const updateGallery = async (id: number, updates: Partial<Gallery>) => {
    try {
      await db.updateGallery(id, updates);
      await loadGalleries();
      if (currentGallery.value?.id === id) {
        await loadGallery(id);
      }
    } catch (error) {
      console.error('Failed to update gallery:', error);
      throw error;
    }
  };

  const deleteGallery = async (id: number) => {
    try {
      await db.deleteGallery(id);
      await loadGalleries();
      if (currentGallery.value?.id === id) {
        currentGallery.value = null;
        photos.value = [];
      }
    } catch (error) {
      console.error('Failed to delete gallery:', error);
      throw error;
    }
  };

  const galleriesWithCounts = computed(() => {
    return galleries.value.map(gallery => ({
      ...gallery,
      photoCount: 0 // Wird beim Laden aktualisiert
    }));
  });

  return {
    // State
    galleries,
    currentGallery,
    photos,
    isLoading,
    galleriesWithCounts,

    // Methods
    initialize,
    loadGalleries,
    loadGallery,
    createGallery,
    updateGallery,
    deleteGallery
  };
}
