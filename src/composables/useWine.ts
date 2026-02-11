import { ref, computed } from 'vue';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { db, type Wine } from '@/services/database';
import { extractGPSFromImage } from '@/services/exif';

const wines = ref<Wine[]>([]);
const isLoading = ref(false);
const searchTerm = ref('');

// Helper-Funktionen für EXIF-Daten (übernommen von usePhoto)
const toString = (value: any): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'description' in value) return value.description;
  if (typeof value === 'object' && 'value' in value) {
    const val = value.value;
    if (Array.isArray(val)) return val[0]?.toString();
    return val?.toString();
  }
  return value.toString();
};

const toNumber = (value: any): number | undefined => {
  if (!value) return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && 'value' in value) {
    const val = value.value;
    if (Array.isArray(val)) return parseFloat(val[0]);
    return parseFloat(val);
  }
  return parseFloat(value);
};

export function useWine() {
  
  // Alle Weine laden
  const loadWines = async () => {
    isLoading.value = true;
    try {
      wines.value = await db.getWines(searchTerm.value || undefined);
    } catch (error) {
      console.error('Failed to load wines:', error);
      throw error;
    } finally {
      isLoading.value = false;
    }
  };

  // Weine mit Suche filtern
  const filteredWines = computed(() => {
    let result = wines.value;
    if (searchTerm.value) {
      const term = searchTerm.value.toLowerCase();
      result = result.filter(wine => 
        wine.name.toLowerCase().includes(term) ||
        wine.winery?.toLowerCase().includes(term) ||
        wine.region?.toLowerCase().includes(term) ||
        wine.grapeVariety?.toLowerCase().includes(term)
      );
    }
    // Nur Weine mit definierter ID zurückgeben
    return result.filter(wine => wine.id !== undefined);
  });

  // Einzelnen Wein laden
  const getWine = async (id: number): Promise<Wine | null> => {
    try {
      return await db.getWine(id);
    } catch (error) {
      console.error('Failed to get wine:', error);
      throw error;
    }
  };

  // Foto aufnehmen mit GPS-Daten
  const takeWinePhoto = async (): Promise<{ photoPath: string; latitude?: number; longitude?: number }> => {
    console.log('📸 Starting takeWinePhoto...');
    try {
      console.log('📸 Requesting camera permission...');
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        quality: 90,
        allowEditing: false,
        saveToGallery: false
      });

      console.log('📸 Photo captured:', photo);

      if (!photo.webPath) {
        throw new Error('No photo path returned');
      }

      // Foto laden und EXIF-Daten extrahieren
      console.log('📸 Fetching photo from:', photo.webPath);
      const response = await fetch(photo.webPath);
      const blob = await response.blob();
      console.log('📸 Blob size:', blob.size, 'type:', blob.type);
      const arrayBuffer = await blob.arrayBuffer();

      // Nutze zentralen EXIF-Service für GPS-Extraktion
      const gpsData = await extractGPSFromImage(arrayBuffer);
      const latitude = gpsData?.latitude ?? undefined;
      const longitude = gpsData?.longitude ?? undefined;

      // Foto im Filesystem speichern
      const base64Data = await convertBlobToBase64(blob);
      const fileName = `wine_${Date.now()}.jpg`;
      
      console.log('💾 Saving file:', fileName);
      
      // Stelle sicher, dass das wines-Verzeichnis existiert
      try {
        await Filesystem.mkdir({
          path: 'wines',
          directory: Directory.Data,
          recursive: true
        });
        console.log('📁 Directory created/verified');
      } catch (e) {
        console.log('📁 Directory already exists or created');
      }
      
      const savedFile = await Filesystem.writeFile({
        path: `wines/${fileName}`,
        data: base64Data,
        directory: Directory.Data
      });

      console.log('✅ File saved:', savedFile.uri);

      return {
        photoPath: savedFile.uri,
        latitude,
        longitude
      };
    } catch (error) {
      console.error('❌ Failed to take wine photo:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      throw error;
    }
  };

  // Wein erstellen
  const createWine = async (wine: Omit<Wine, 'id' | 'created' | 'updated'>): Promise<number> => {
    isLoading.value = true;
    try {
      console.log('🍷 Creating wine with data:', {
        name: wine.name,
        hasPhoto: !!wine.photoPath,
        hasGPS: !!(wine.latitude && wine.longitude),
        latitude: wine.latitude,
        longitude: wine.longitude
      });
      const id = await db.createWine(wine);
      console.log('✅ Wine created with ID:', id);
      try {
        await loadWines(); // Liste aktualisieren
      } catch (refreshError) {
        console.warn('⚠️ Failed to refresh wines after create:', refreshError);
      }
      return id;
    } catch (error) {
      console.error('❌ Failed to create wine:', error);
      throw error;
    } finally {
      isLoading.value = false;
    }
  };

  // Wein aktualisieren
  const updateWine = async (id: number, updates: Partial<Wine>): Promise<void> => {
    isLoading.value = true;
    try {
      await db.updateWine(id, updates);
      await loadWines(); // Liste aktualisieren
    } catch (error) {
      console.error('Failed to update wine:', error);
      throw error;
    } finally {
      isLoading.value = false;
    }
  };

  // Wein löschen
  const deleteWine = async (id: number): Promise<void> => {
    isLoading.value = true;
    try {
      const wine = await db.getWine(id);
      
      // Foto löschen falls vorhanden
      if (wine?.photoPath) {
        try {
          await Filesystem.deleteFile({
            path: wine.photoPath.split('/').pop() || '',
            directory: Directory.Data
          });
        } catch (e) {
          console.warn('Could not delete wine photo:', e);
        }
      }

      await db.deleteWine(id);
      await loadWines(); // Liste aktualisieren
    } catch (error) {
      console.error('Failed to delete wine:', error);
      throw error;
    } finally {
      isLoading.value = false;
    }
  };

  // Anzahl der Weine
  const getWineCount = async (): Promise<number> => {
    try {
      return await db.getWineCount();
    } catch (error) {
      console.error('Failed to get wine count:', error);
      return 0;
    }
  };

  // Helper: Blob zu Base64 konvertieren
  const convertBlobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
      };
      reader.readAsDataURL(blob);
    });
  };

  return {
    wines,
    filteredWines,
    isLoading,
    searchTerm,
    loadWines,
    getWine,
    createWine,
    updateWine,
    deleteWine,
    takeWinePhoto,
    getWineCount
  };
}
