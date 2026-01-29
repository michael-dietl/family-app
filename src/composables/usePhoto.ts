import { ref } from 'vue';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Geolocation } from '@capacitor/geolocation'; // Retained for route tracker module
import { Capacitor } from '@capacitor/core';
import { db, type Photo } from '@/services/database';
import { extractExifFromUri, extractGPSFromCameraExif, extractExifFromImage } from '@/services/exif';
import { readContentUri } from '@/services/contentReader';

export function usePhoto() {
  const isProcessing = ref(false);

  // Foto aufnehmen oder aus Galerie wählen
  const takePhoto = async (source: CameraSource = CameraSource.Camera) => {
    try {
      const image = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        source: source,
        quality: 90,
        allowEditing: false,
        saveToGallery: false  // Wichtig: Verhindert Verlust von EXIF-Daten
      });

      // Log EXIF data from Camera API if available
      if (image.exif) {
        console.log('📸 Camera API returned EXIF data:', {
          hasGPS: !!(image.exif.GPSLatitude && image.exif.GPSLongitude),
          GPSLatitude: image.exif.GPSLatitude,
          GPSLongitude: image.exif.GPSLongitude,
          allExifKeys: Object.keys(image.exif)
        });
      } else {
        console.log('⚠️ Camera API returned NO EXIF data');
      }

      return image;
    } catch (error) {
      console.error('Error taking photo:', error);
      throw error;
    }
  };

  // Pick single photo from gallery using FilePicker
  // Returns { path, data } where data is base64 (without prefix) when available
  const pickSinglePhoto = async (): Promise<{ path: string | null; data?: string | null }> => {
    try {
      const pick = await import('@/services/photoPicker');
      const uris = await pick.pickMedia({ multiple: false, allowVideos: true });
      if (uris && uris.length > 0) {
        const uri = uris[0];
        console.log('📸 Picked native URI:', uri);
        // Try to request base64 via native ContentReader (no UI) as a best-effort for EXIF preservation
        try {
          const cr = await import('@/services/contentReader');
          const res = await cr.readContentUri(uri);
          if (res && res.data) {
            return { path: uri || null, data: res.data };
          }
        } catch (e) {
          // ignore and return URI
        }
        return { path: uri || null, data: null };
      }
      return { path: null, data: null };
    } catch (error) {
      console.error('❌ Error picking photo:', error);
      return { path: null, data: null };
    }
  };

  // Pick multiple photos from gallery using FilePicker
  const pickMultiplePhotos = async (): Promise<Array<{ path: string | null; data?: string | null }>> => {
    try {
      const pick = await import('@/services/photoPicker');
      const uris = await pick.pickMedia({ multiple: true, allowVideos: true });
      if (uris && uris.length > 0) {
        console.log(`📸 Picked ${uris.length} files from native picker`);
        // Try to enrich with base64 data via native ContentReader for each URI (no UI)
        try {
          const cr = await import('@/services/contentReader');
          const out: Array<{ path: string | null; data?: string | null }> = [];
          for (const u of uris) {
            try {
              const res = await cr.readContentUri(u);
              out.push({ path: u || null, data: res?.data || null });
            } catch (e) {
              out.push({ path: u || null, data: null });
            }
          }
          return out;
        } catch (e) {
          // fallback to URIs
        }
        return uris.map(u => ({ path: u || null }));
      }
      return [];
    } catch (error) {
      console.error('❌ Error picking photos:', error);
      return [];
    }
  };

  // EXIF-Daten aus Foto extrahieren (delegiert an zentralen Service)
  const extractExifData = async (photoUri: string) => {
    console.log('🔍 Using centralized EXIF service for:', photoUri);
    return await extractExifFromUri(photoUri);
  };

  // Hilfsfunktion: Blob zu Base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // "data:image/jpeg;base64," entfernen
        resolve(base64.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Hilfsfunktion: File zu Data URL
  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Hilfsfunktion: DataURL zu ArrayBuffer konvertieren
  const dataUrlToArrayBuffer = (dataUrl: string): ArrayBuffer => {
    const base64 = dataUrl.split(',')[1];
    const binaryString = atob(base64);
    const len = binaryString.length;
    const buffer = new ArrayBuffer(len);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < len; i++) {
      view[i] = binaryString.charCodeAt(i);
    }
    return buffer;
  };

  // Hilfsfunktion: base64 (raw) zu ArrayBuffer
  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const buffer = new ArrayBuffer(len);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < len; i++) {
      view[i] = binaryString.charCodeAt(i);
    }
    return buffer;
  };

  // Foto-Thumbnail generieren (200x200px max)
  const generatePhotoThumbnail = async (photoDataUrl: string): Promise<{ thumbnailBlob: Blob; exifData: any }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = photoDataUrl;

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Berechne Thumbnail-Größe (max 200x200, Aspect Ratio erhalten)
        const maxSize = 200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSize) {
            height = height * (maxSize / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = width * (maxSize / height);
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        // EXIF-Daten extrahieren
        const exifData = extractExifFromImage(dataUrlToArrayBuffer(photoDataUrl));

        // Blob statt DataURL verwenden
        canvas.toBlob((blob) => {
          if (blob) {
            resolve({ thumbnailBlob: blob, exifData });
          } else {
            reject(new Error('Could not generate thumbnail blob'));
          }
        }, 'image/jpeg', 0.6);
      };

      img.onerror = () => {
        reject(new Error('Could not load image for thumbnail'));
      };
    });
  };

  // Video-Thumbnail generieren (erster Frame als JPEG)
  const generateVideoThumbnail = async (videoDataUrl: string): Promise<{ thumbnailBlob: Blob | undefined; exifData: any }> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.src = videoDataUrl;
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;

      video.onloadeddata = () => {
        // Springe zu 1 Sekunde oder 10% der Duration
        video.currentTime = Math.min(1, video.duration * 0.1);
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            console.warn('Could not get canvas context for thumbnail');
            resolve({ thumbnailBlob: undefined, exifData: null });
            return;
          }

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          // EXIF-Daten extrahieren (falls vorhanden)
          const exifData = extractExifFromImage(dataUrlToArrayBuffer(videoDataUrl));

          // Blob statt DataURL verwenden
          canvas.toBlob((blob) => {
            if (blob) {
              resolve({ thumbnailBlob: blob, exifData });
            } else {
              resolve({ thumbnailBlob: undefined, exifData });
            }
          }, 'image/jpeg', 0.7);
        } catch (error) {
          console.error('Error generating thumbnail:', error);
          resolve({ thumbnailBlob: undefined, exifData: null });
        }
      };

      video.onerror = () => {
        resolve({ thumbnailBlob: undefined, exifData: null });
      };
    });
  };

  // Hilfsfunktion: Bildgröße aus Blob extrahieren
  const getImageDimensions = async (photoUri: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = () => {
        reject(new Error('Could not load image dimensions'));
      };
      img.src = photoUri;
    });
  };

  // Foto speichern (Filesystem + Database)
  // `base64Data` optional: raw base64 (without data: prefix) from FilePicker
  const savePhoto = async (
    photoUri: string, 
    galleryId: number, 
    filename?: string,
    cameraExifData?: any,  // EXIF-Daten von Camera API
    manualLocation?: { latitude: number; longitude: number },  // Manuell gewählter Standort
    base64Data?: string | null
  ): Promise<number> => {
    isProcessing.value = true;
    
    try {
      console.log('📸 Starting media save:', { photoUri, galleryId, filename, hasCameraExif: !!cameraExifData });
      console.log('📸 Photo URI:', photoUri);
      console.log('📸 Is content:// URI?', photoUri.startsWith('content://'));
      
      // 1. EXIF-Daten ZUERST extrahieren (bevor Blob, weil Blob EXIF entfernen kann!)
      let exifData: any = {};
      let arrayBufferForExif: ArrayBuffer | undefined;
      
      // Versuche EXIF aus URI zu extrahieren (funktioniert bei Android content:// URIs)
      if (!cameraExifData && photoUri.startsWith('content://')) {
        console.log('📸 Detected Android content:// URI, trying direct EXIF extraction...');
        try {
          exifData = await extractExifFromUri(photoUri);
          console.log('   ✅ EXIF extracted from URI:', {
            hasGPS: !!(exifData.latitude && exifData.longitude),
            latitude: exifData.latitude,
            longitude: exifData.longitude
          });
        } catch (error) {
          console.warn('⚠️ Could not extract EXIF from URI:', error);
        }
      }
      
      // Lade Datei als Blob (oder verwende provided base64Data direkt)
      let blob: Blob;

      if (base64Data) {
        // base64Data is raw base64 without data: prefix
        console.log('📥 Using base64 data provided by FilePicker (preserves EXIF)');
        const mime = 'image/jpeg';
        const binary = atob(base64Data);
        const len = binary.length;
        const buffer = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          buffer[i] = binary.charCodeAt(i);
        }
        blob = new Blob([buffer.buffer], { type: mime });
      } else {
        if (photoUri.startsWith('content://') || photoUri.startsWith('file://')) {
          // Native URI - Konvertiere zu WebView-kompatiblem Pfad
          console.log('📱 Native URI detected, converting to WebView path...');
          const webViewPath = Capacitor.convertFileSrc(photoUri);
          console.log('   🔄 Converted to:', webViewPath);
          const response = await fetch(webViewPath);
          blob = await response.blob();
          console.log('📦 Blob loaded:', { type: blob.type, size: blob.size });
        } else {
          // Data URL oder http:// URL - verwende fetch
          const response = await fetch(photoUri);
          blob = await response.blob();
        }
      }
      
      const isVideo = blob.type.startsWith('video/');
      
      console.log('🖼️ Blob loaded:', { type: blob.type, size: blob.size, isVideo });

      // 2. Falls noch keine EXIF-Daten, versuche aus Blob
      if (!isVideo && !exifData.latitude && !exifData.longitude) {
        console.log('📸 No GPS from URI, trying to extract from blob...');
        const arrayBuffer = await blob.arrayBuffer();
        arrayBufferForExif = arrayBuffer;
        const blobExifData = await extractExifFromImage(arrayBuffer);
        // Merge EXIF-Daten (blob kann andere Infos haben wie Kamera, etc.)
        exifData = { ...blobExifData, ...exifData };
        console.log('   - Extracted EXIF from blob:', {
          hasGPS: !!(exifData.latitude && exifData.longitude),
          latitude: exifData.latitude,
          longitude: exifData.longitude,
          dateTaken: exifData.dateTaken,
          camera: exifData.camera
        });

        // 2b. Fallback: Wenn noch immer keine GPS-Daten vorhanden sind und wir eine content:// URI haben,
        // frage das native ContentReader Plugin per Capacitor an, das den ContentResolver nutzt und die
        // Originalbytes als Base64 zurückliefert.
        if (!exifData.latitude && photoUri.startsWith('content://')) {
          try {
            console.log('🔁 Trying native ContentReader fallback for original bytes...');
            const res = await readContentUri(photoUri);
            if (res && res.data) {
              const ab = base64ToArrayBuffer(res.data);
              const fallbackExif = await extractExifFromImage(ab);
              exifData = { ...fallbackExif, ...exifData };
              console.log('   - Extracted EXIF from native content bytes:', {
                hasGPS: !!(exifData.latitude && exifData.longitude),
                latitude: exifData.latitude,
                longitude: exifData.longitude
              });
            }
          } catch (nativeErr) {
            console.warn('⚠️ Native ContentReader fallback failed:', nativeErr);
          }
        }
      }

      // 3. EXIF-Daten verarbeiten und Fallbacks
      if (!isVideo) {
        // Nur wenn KEINE GPS-Daten im Bild sind UND kein manueller Standort, versuche Fallback
        const hasImageGPS = (exifData.latitude !== undefined && exifData.latitude !== null) && 
                            (exifData.longitude !== undefined && exifData.longitude !== null);
        
        // DEAKTIVIERT: Kein automatischer Fallback auf aktuelle Position mehr
        // if (!hasImageGPS && !manualLocation) {
        //   console.log('⚠️ No GPS in image EXIF, requesting current position as fallback...');
        //   try {
        //     const position = await Geolocation.getCurrentPosition({
        //       enableHighAccuracy: true,
        //       timeout: 3000,
        //       maximumAge: 30000
        //     });
        //     console.log('✅ GPS position obtained:', {
        //       latitude: position.coords.latitude,
        //       longitude: position.coords.longitude
        //     });
        //     exifData.latitude = position.coords.latitude;
        //     exifData.longitude = position.coords.longitude;
        //   } catch (geoError) {
        //     console.warn('⚠️ Could not get GPS position:', geoError);
        //   }
        // }
        
        if (hasImageGPS) {
          console.log('✅ Using GPS from image EXIF - no fallback needed');
        } else if (!manualLocation) {
          console.log('⚠️ No GPS in image and no manual location provided');
        }

        // Überschreibe mit Camera API EXIF falls vorhanden (für frische Fotos)
        if (cameraExifData && cameraExifData.GPSLatitude && cameraExifData.GPSLongitude) {
          console.log('📸 Using EXIF from Camera API:', cameraExifData);
          console.log('🔍 Raw GPS from Camera:', {
            GPSLatitude: cameraExifData.GPSLatitude,
            GPSLongitude: cameraExifData.GPSLongitude,
            GPSLatitudeRef: cameraExifData.GPSLatitudeRef,
            GPSLongitudeRef: cameraExifData.GPSLongitudeRef
          });
          
          // Nutze zentralen Service für Camera API GPS-Parsing
          const gpsCoords = extractGPSFromCameraExif(cameraExifData);
          console.log('📍 Parsed GPS coordinates from service (override from Camera API):', gpsCoords);
          
          if (gpsCoords) {
            exifData.latitude = gpsCoords.latitude;
            exifData.longitude = gpsCoords.longitude;
          }
          
          // Erweitere mit anderen Camera API EXIF-Daten
          if (cameraExifData.DateTime || cameraExifData.DateTimeOriginal) {
            exifData.dateTaken = cameraExifData.DateTime || cameraExifData.DateTimeOriginal;
          }
          if (cameraExifData.Make && cameraExifData.Model) {
            exifData.camera = `${cameraExifData.Make} ${cameraExifData.Model}`.trim();
          }
          if (cameraExifData.FocalLength) {
            exifData.focalLength = parseFloat(cameraExifData.FocalLength);
          }
          if (cameraExifData.FNumber) {
            exifData.aperture = cameraExifData.FNumber;
          }
          if (cameraExifData.ExposureTime) {
            exifData.shutterSpeed = cameraExifData.ExposureTime;
          }
          if (cameraExifData.PhotographicSensitivity) {
            exifData.iso = parseInt(cameraExifData.PhotographicSensitivity);
          }
          if (cameraExifData.PixelXDimension || cameraExifData.ImageWidth) {
            exifData.width = cameraExifData.PixelXDimension || cameraExifData.ImageWidth;
          }
          if (cameraExifData.PixelYDimension || cameraExifData.ImageLength) {
            exifData.height = cameraExifData.PixelYDimension || cameraExifData.ImageLength;
          }
        }
        
        // Überschreibe GPS mit manuellem Standort, falls vorhanden
        if (manualLocation) {
          console.log('📍 Using manual location (overrides all):', manualLocation);
          exifData.latitude = manualLocation.latitude;
          exifData.longitude = manualLocation.longitude;
        }
        
        console.log('📊 Final EXIF data:', exifData);
      }

      // 2. Dateiname generieren falls nicht vorhanden
      const extension = isVideo ? '.mp4' : '.jpg';
      const finalFilename = filename || `${isVideo ? 'video' : 'photo'}_${Date.now()}${extension}`;

      // 3. Foto/Video konvertieren
      // If base64Data was passed in, reuse it (already raw base64); otherwise create it from blob
      const finalBase64 = base64Data || await blobToBase64(blob);
      const dataUrl = `data:${blob.type};base64,${finalBase64}`;

      // 4. Speichere Datei im Filesystem (nur auf nativen Plattformen)
      const isNative = Capacitor.getPlatform() !== 'web';
      let filePath: string;
      
      if (isNative) {
        try {
          // Erstelle Gallery-Ordner explizit VORHER (recursive: true funktioniert nicht auf Android)
          try {
            await Filesystem.mkdir({
              path: `galleries/${galleryId}`,
              directory: Directory.Data,
              recursive: true
            });
          } catch (mkdirError) {
            // Ordner existiert bereits - ignorieren
            console.log('📁 Directory already exists or created');
          }

          const result = await Filesystem.writeFile({
            path: `galleries/${galleryId}/${finalFilename}`,
            data: finalBase64,
            directory: Directory.Data
          });
          filePath = result.uri; // Nativer Dateipfad
          console.log('💾 File saved to filesystem:', filePath);
        } catch (fsError) {
          console.error('⚠️ Filesystem write failed - skipping DB save:', fsError);
          throw new Error(`Filesystem error: ${fsError}`);
        }
      } else {
        // Web: Verwende Data-URL
        filePath = dataUrl;
      }

      // 4.5 Width/Height sicherstellen (falls nicht aus EXIF vorhanden)
      if (!isVideo && (!exifData.width || !exifData.height)) {
        try {
          const dimensions = await getImageDimensions(isNative ? filePath : dataUrl);
          if (!exifData.width) exifData.width = dimensions.width;
          if (!exifData.height) exifData.height = dimensions.height;
          console.log('📐 Image dimensions extracted:', dimensions);
        } catch (dimError) {
          console.warn('⚠️ Could not extract image dimensions:', dimError);
        }
      }

      // 5. In Datenbank speichern (OHNE Thumbnail - wird bei Bedarf aus Datei generiert)
      console.log('💿 Saving to database with EXIF data:');
      console.log('   - Gallery ID:', galleryId);
      console.log('   - Filename:', finalFilename);
      console.log('   - GPS Latitude:', exifData.latitude);
      console.log('   - GPS Longitude:', exifData.longitude);
      console.log('   - Camera:', exifData.camera);
      console.log('   - Date taken:', exifData.dateTaken);
      
      const photoId = await db.createPhoto({
        galleryId,
        filename: finalFilename,
        filepath: filePath,  // Nur der Pfad zur Datei
        mimeType: blob.type,
        filesize: blob.size,
        ...exifData
      });

      console.log('✅ Media saved successfully with ID:', photoId, '- GPS in DB:', !!exifData.latitude && !!exifData.longitude);
      return photoId;
    } catch (error) {
      console.error('❌ Error saving media:', error);
      throw error;
    } finally {
      isProcessing.value = false;
    }
  };

  // Foto speichern aus content:// URI (für File Picker)
  const savePhotoFromUri = async (
    contentUri: string,
    galleryId: number
  ): Promise<number> => {
    // savePhoto kann direkt mit content:// URIs arbeiten
    return savePhoto(contentUri, galleryId);
  };

  // Mehrere Fotos speichern (aus content:// URIs)
  const saveMultiplePhotos = async (
    contentUris: Array<string | { path: string | null; data?: string | null }>,
    galleryId: number,
    onProgress?: (current: number, total: number) => void
  ): Promise<number[]> => {
    isProcessing.value = true;
    const photoIds: number[] = [];
    
    try {
      for (let i = 0; i < contentUris.length; i++) {
        const item = contentUris[i];
        let uri: string;
        let data: string | null | undefined = undefined;

        if (typeof item === 'string') {
          uri = item;
        } else {
          uri = item.path || '';
          data = item.data;
        }

        const photoId = await savePhoto(uri, galleryId, undefined, undefined, undefined, data);
        photoIds.push(photoId);

        if (onProgress) {
          onProgress(i + 1, contentUris.length);
        }
      }
      
      return photoIds;
    } catch (error) {
      console.error('Error saving multiple photos:', error);
      throw error;
    } finally {
      isProcessing.value = false;
    }
  };

  // Foto aus Datenbank und Filesystem löschen
  const deletePhoto = async (photo: Photo) => {
    try {
      // 1. Aus Filesystem löschen (nur wenn es ein tatsächlicher Pfad ist, keine Data-URL)
      if (photo.filepath && !photo.filepath.startsWith('data:')) {
        try {
          await Filesystem.deleteFile({
            path: photo.filepath
          });
        } catch (error) {
          console.warn('Could not delete file from filesystem:', error);
        }
      }

      // 2. Aus Datenbank löschen
      if (photo.id) {
        await db.deletePhoto(photo.id);
      }
    } catch (error) {
      console.error('Error deleting photo:', error);
      throw error;
    }
  };

  // Sicherstellen, ob ein Verzeichnis existiert, und erstellt es bei Bedarf
  const ensureDirectoryExists = async (path: string): Promise<void> => {
    try {
      await Filesystem.mkdir({
        path,
        directory: Directory.Data,
        recursive: true
      });
      console.log('📂 Verzeichnis erstellt:', path);
    } catch (error: any) {
      if (error.code === 'EEXIST') {
        console.log('📂 Verzeichnis existiert bereits:', path);
      } else {
        throw error;
      }
    }
  };

  // Kopiert ausgewählte Fotos in das App-Verzeichnis und extrahiert EXIF-Daten
  const copyPhotoToAppDirectory = async (photoUri: string): Promise<{ savedPath: string; exifData: any } | null> => {
    try {
      console.log('📂 Kopiere Foto in das App-Verzeichnis:', photoUri);

      // Sicherstellen, dass das Zielverzeichnis existiert
      const targetDirectory = 'galleries/2'; // Beispielpfad, anpassen nach Bedarf
      await ensureDirectoryExists(targetDirectory);

      // Lese die Datei als Blob
      const response = await fetch(photoUri);
      const blob = await response.blob();

      // Generiere einen eindeutigen Dateinamen
      const fileName = `photo_${Date.now()}.jpg`;
      const savedPath = `${targetDirectory}/${fileName}`;

      // Schreibe die Datei in das App-Verzeichnis
      await Filesystem.writeFile({
        path: savedPath,
        data: await blobToBase64(blob),
        directory: Directory.Data
      });

      console.log('✅ Foto gespeichert unter:', savedPath);

      // Extrahiere EXIF-Daten
      const exifData = await extractExifFromUri(photoUri);
      console.log('📸 EXIF-Daten extrahiert:', exifData);

      return { savedPath, exifData };
    } catch (error) {
      console.error('❌ Fehler beim Kopieren des Fotos:', error);
      return null;
    }
  };

  return {
    isProcessing,
    takePhoto,
    pickSinglePhoto,
    pickMultiplePhotos,
    extractExifData,
    savePhoto,
    savePhotoFromUri,
    saveMultiplePhotos,
    deletePhoto,
    generatePhotoThumbnail,
    generateVideoThumbnail,
    copyPhotoToAppDirectory
  };
}

async function ensureDirectoryExists(path: string) {
  try {
    await Filesystem.mkdir({
      path,
      directory: Directory.Data,
      recursive: true,
    });
  } catch (error: any) {
    if (error.code !== 'EEXIST' && error.code !== 'OS-PLUG-FILE-0010') {
      throw error; // Re-throw if the error is not about the directory already existing
    }
  }
}

export { ensureDirectoryExists };
