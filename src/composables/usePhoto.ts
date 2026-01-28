import { ref } from 'vue';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import ExifReader from 'exifreader';
import { db, type Photo } from '@/services/database';

export function usePhoto() {
  const isProcessing = ref(false);

  // Foto aufnehmen oder aus Galerie wählen
  const takePhoto = async (source: CameraSource = CameraSource.Camera) => {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: source
      });

      // Log EXIF data from Camera API if available
      if (image.exif) {
        console.log('📸 Camera API returned EXIF data:', {
          hasGPS: !!(image.exif.GPSLatitude && image.exif.GPSLongitude),
          GPSLatitude: image.exif.GPSLatitude,
          GPSLongitude: image.exif.GPSLongitude,
          allExifKeys: Object.keys(image.exif)
        });
      }

      return image;
    } catch (error) {
      console.error('Error taking photo:', error);
      throw error;
    }
  };

  // Mehrere Fotos/Videos aus Galerie wählen (nur Web)
  const pickMultiplePhotos = async (): Promise<File[]> => {
    return new Promise((resolve) => {
      // Erstelle temporären File-Input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,video/*';
      input.multiple = true;
      
      input.onchange = (event: Event) => {
        const target = event.target as HTMLInputElement;
        const files = Array.from(target.files || []);
        resolve(files);
      };
      
      input.oncancel = () => {
        resolve([]);
      };
      
      input.click();
    });
  };

  // EXIF-Daten aus Foto extrahieren
  const extractExifData = async (photoUri: string) => {
    console.log('🔍 Starting EXIF extraction for:', photoUri);
    console.log('🔍 URI type:', photoUri.substring(0, 50));
    
    try {
      // Für Android content:// URIs müssen wir das Bild anders laden
      let arrayBuffer: ArrayBuffer;
      
      if (photoUri.startsWith('content://') || photoUri.startsWith('file://')) {
        console.log('📱 Native URI detected, loading via fetch...');
        const response = await fetch(photoUri);
        const blob = await response.blob();
        console.log('📦 Blob loaded:', { type: blob.type, size: blob.size });
        arrayBuffer = await blob.arrayBuffer();
      } else if (photoUri.startsWith('data:')) {
        console.log('🌐 Data URL detected, extracting base64...');
        const base64 = photoUri.split(',')[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        arrayBuffer = bytes.buffer;
      } else {
        console.log('🌐 Standard URL, loading via fetch...');
        const response = await fetch(photoUri);
        const blob = await response.blob();
        console.log('📦 Blob loaded:', { type: blob.type, size: blob.size });
        arrayBuffer = await blob.arrayBuffer();
      }
      
      console.log('📦 ArrayBuffer size:', arrayBuffer.byteLength);
      
      // Prüfe ob ArrayBuffer groß genug ist
      if (arrayBuffer.byteLength < 100) {
        console.warn('⚠️ ArrayBuffer too small, probably not a valid image');
        return {};
      }
      
      // EXIF-Daten extrahieren (expanded mode - wie im Weinmodul)
      const tagsExpanded = ExifReader.load(arrayBuffer, { expanded: true });
      console.log('📸 EXIF Tags (expanded):', tagsExpanded);
      
      const gps = tagsExpanded.gps;
      const exif = tagsExpanded.exif;
      
      console.log('📍 GPS (expanded):', {
        hasGPS: !!gps,
        Latitude: gps?.Latitude,
        Longitude: gps?.Longitude
      });
      
      // GPS Koordinaten extrahieren - expanded mode gibt direkt Dezimalwerte
      let latitude: number | undefined;
      let longitude: number | undefined;
      
      if (gps?.Latitude && gps?.Longitude) {
        latitude = typeof gps.Latitude === 'number' ? gps.Latitude : undefined;
        longitude = typeof gps.Longitude === 'number' ? gps.Longitude : undefined;
        console.log('📍 GPS Coordinates:', { latitude, longitude });
      }
      
      // GPS-Validierung
      const isValidGPS = (lat?: number, lng?: number): boolean => {
        if (lat === undefined || lng === undefined) return false;
        if (isNaN(lat) || isNaN(lng)) return false;
        // Latitude: -90 bis 90, Longitude: -180 bis 180
        if (lat < -90 || lat > 90) return false;
        if (lng < -180 || lng > 180) return false;
        // Ignoriere ungültige 0,0 Koordinaten (Golf von Guinea)
        if (lat === 0 && lng === 0) return false;
        return true;
      };
      
      const validGPS = isValidGPS(latitude, longitude);
      console.log('📍 GPS nach EXIF-Extraktion:', { latitude, longitude, valid: validGPS });
      
      // Setze ungültige GPS-Werte auf undefined
      if (!validGPS) {
        latitude = undefined;
        longitude = undefined;
        console.log('⚠️ Keine gültigen GPS-Daten in EXIF gefunden');
      } else {
        console.log('✅ GPS aus EXIF-Daten erfolgreich extrahiert:', { latitude, longitude });
      }
      
      // Helper für number conversion + EXIF value extraction
      const toNumber = (value: any): number | undefined => {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
          const parsed = parseFloat(value);
          return isNaN(parsed) ? undefined : parsed;
        }
        // EXIF Reader kann nested objects zurückgeben: { value: [num, den], description: "..." }
        if (value && typeof value === 'object') {
          if (Array.isArray(value.value)) {
            // Rational: [numerator, denominator]
            return value.value[0] / value.value[1];
          }
          if (typeof value.value === 'number') return value.value;
          if (typeof value.description === 'string') {
            const parsed = parseFloat(value.description);
            return isNaN(parsed) ? undefined : parsed;
          }
        }
        return undefined;
      };
      
      // Helper für string extraction
      const toString = (value: any): string | undefined => {
        if (typeof value === 'string') return value;
        if (value && typeof value === 'object') {
          if (typeof value.description === 'string') return value.description;
          if (Array.isArray(value.value) && typeof value.value[0] === 'string') return value.value[0];
          if (typeof value.value === 'string') return value.value;
        }
        return undefined;
      };
      
      const result = {
        latitude,
        longitude,
        dateTaken: toString(exif?.DateTimeOriginal) || toString(exif?.DateTime),
        camera: exif?.Make && exif?.Model 
          ? `${toString(exif.Make)} ${toString(exif.Model)}`.trim()
          : undefined,
        lens: toString(exif?.LensModel),
        focalLength: exif?.FocalLength ? toNumber(exif.FocalLength) : undefined,
        aperture: toString(exif?.FNumber),  // Als String speichern (z.B. "f/2.2")
        shutterSpeed: toString(exif?.ExposureTime),  // Als String speichern (z.B. "1/50")
        iso: exif?.ISOSpeedRatings ? toNumber(exif.ISOSpeedRatings) : undefined,
        width: exif?.PixelXDimension ? toNumber(exif.PixelXDimension) : undefined,
        height: exif?.PixelYDimension ? toNumber(exif.PixelYDimension) : undefined
      };
      
      console.log('📊 Final EXIF result:', result);
      return result;
    } catch (error) {
      console.error('❌ EXIF extraction error:', error);
      if (error instanceof Error) {
        console.error('❌ Error details:', { name: error.name, message: error.message, stack: error.stack });
      }
      // Gebe leeres Objekt zurück - Fallback-Entscheidung erfolgt auf höherer Ebene
      console.log('⚠️ EXIF-Extraktion fehlgeschlagen - Foto wird ohne EXIF-Metadaten verarbeitet');
      return {};
    }
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

  // Foto-Thumbnail generieren (200x200px max)
  const generatePhotoThumbnail = async (photoDataUrl: string): Promise<string> => {
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
        
        // Niedrige Qualität für kleines Thumbnail
        const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.6);
        resolve(thumbnailDataUrl);
      };
      
      img.onerror = () => {
        reject(new Error('Could not load image for thumbnail'));
      };
    });
  };

  // Video-Thumbnail generieren (erster Frame als JPEG)
  const generateVideoThumbnail = async (videoDataUrl: string): Promise<string | undefined> => {
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
            resolve(undefined);
            return;
          }
          
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Konvertiere zu JPEG mit 70% Qualität
          const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.7);
          console.log('✅ Video thumbnail generated');
          
          resolve(thumbnailDataUrl);
        } catch (error) {
          console.error('Error generating thumbnail:', error);
          resolve(undefined);
        }
      };
      
      video.onerror = () => {
        console.warn('Could not load video for thumbnail generation');
        resolve(undefined);
      };
      
      // Timeout nach 5 Sekunden
      setTimeout(() => {
        console.warn('Thumbnail generation timed out');
        resolve(undefined);
      }, 5000);
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
  const savePhoto = async (
    photoUri: string, 
    galleryId: number, 
    filename?: string,
    cameraExifData?: any,  // EXIF-Daten von Camera API
    manualLocation?: { latitude: number; longitude: number }  // Manuell gewählter Standort
  ): Promise<number> => {
    isProcessing.value = true;
    
    try {
      console.log('📸 Starting media save:', { photoUri, galleryId, filename, hasCameraExif: !!cameraExifData });
      
      // Lade Datei
      const response = await fetch(photoUri);
      const blob = await response.blob();
      const isVideo = blob.type.startsWith('video/');
      
      console.log('🖼️ Blob loaded:', { type: blob.type, size: blob.size, isVideo });

      // 1. EXIF-Daten verarbeiten
      let exifData: any = {};
      if (!isVideo) {
        // Prüfe zuerst ob Camera API EXIF-Daten mitgegeben hat
        if (cameraExifData && cameraExifData.GPSLatitude && cameraExifData.GPSLongitude) {
          console.log('📸 Using EXIF from Camera API:', cameraExifData);
          
          // Parse GPS aus Camera API Format: "48/1,3/1,25217640/1000000"
          const parseGPSString = (gpsString: string, ref: string): number | undefined => {
            try {
              const parts = gpsString.split(',');
              if (parts.length !== 3) {
                console.warn('⚠️ Invalid GPS string format:', gpsString);
                return undefined;
              }
              
              // Parse Brüche: "48/1" -> 48, "25217640/1000000" -> 25.21764
              const parseFraction = (fraction: string): number => {
                const [num, den] = fraction.split('/').map(s => parseFloat(s.trim()));
                return den ? num / den : num;
              };
              
              const degrees = parseFraction(parts[0]);
              const minutes = parseFraction(parts[1]);
              const seconds = parseFraction(parts[2]);
              
              console.log('🔍 GPS DMS parsed:', { degrees, minutes, seconds, ref });
              
              // Konvertiere DMS zu Decimal
              let decimal = degrees + (minutes / 60) + (seconds / 3600);
              
              // Süd und West sind negativ
              if (ref === 'S' || ref === 'W') {
                decimal = -decimal;
              }
              
              console.log('✅ GPS decimal:', decimal);
              return decimal;
            } catch (e) {
              console.error('❌ GPS parsing error:', e);
              return undefined;
            }
          };
          
          const latitude = parseGPSString(cameraExifData.GPSLatitude, cameraExifData.GPSLatitudeRef || 'N');
          const longitude = parseGPSString(cameraExifData.GPSLongitude, cameraExifData.GPSLongitudeRef || 'E');
          
          // Validiere GPS-Koordinaten
          const isValidGPS = (lat?: number, lng?: number): boolean => {
            if (lat === undefined || lng === undefined) return false;
            if (isNaN(lat) || isNaN(lng)) return false;
            // Latitude: -90 bis 90, Longitude: -180 bis 180
            if (lat < -90 || lat > 90) return false;
            if (lng < -180 || lng > 180) return false;
            // Ignoriere ungültige 0,0 Koordinaten (Golf von Guinea)
            if (lat === 0 && lng === 0) return false;
            return true;
          };
          
          const validGPS = isValidGPS(latitude, longitude);
          console.log('📍 Parsed GPS:', { latitude, longitude, valid: validGPS });
          
          exifData = {
            latitude: validGPS ? latitude : undefined,
            longitude: validGPS ? longitude : undefined,
            dateTaken: cameraExifData.DateTime || cameraExifData.DateTimeOriginal,
            camera: cameraExifData.Make && cameraExifData.Model 
              ? `${cameraExifData.Make} ${cameraExifData.Model}`.trim()
              : undefined,
            focalLength: cameraExifData.FocalLength ? parseFloat(cameraExifData.FocalLength) : undefined,
            aperture: cameraExifData.FNumber,
            shutterSpeed: cameraExifData.ExposureTime,
            iso: cameraExifData.PhotographicSensitivity ? parseInt(cameraExifData.PhotographicSensitivity) : undefined,
            width: cameraExifData.PixelXDimension || cameraExifData.ImageWidth,
            height: cameraExifData.PixelYDimension || cameraExifData.ImageLength
          };
        } else {
          // Fallback: Extrahiere EXIF aus Bild
          exifData = await extractExifData(photoUri);
        }
        
        // Überschreibe GPS mit manuellem Standort, falls vorhanden
        if (manualLocation) {
          console.log('📍 Using manual location:', manualLocation);
          exifData.latitude = manualLocation.latitude;
          exifData.longitude = manualLocation.longitude;
        }
        
        console.log('📊 Final EXIF data:', exifData);
      }

      // 2. Dateiname generieren falls nicht vorhanden
      const extension = isVideo ? '.mp4' : '.jpg';
      const finalFilename = filename || `${isVideo ? 'video' : 'photo'}_${Date.now()}${extension}`;

      // 3. Foto/Video konvertieren
      const base64Data = await blobToBase64(blob);
      const dataUrl = `data:${blob.type};base64,${base64Data}`;

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
            data: base64Data,
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
      console.log('💿 Saving to database...');
      const photoId = await db.createPhoto({
        galleryId,
        filename: finalFilename,
        filepath: filePath,  // Nur der Pfad zur Datei
        mimeType: blob.type,
        filesize: blob.size,
        ...exifData
      });

      console.log('✅ Media saved successfully with ID:', photoId);
      return photoId;
    } catch (error) {
      console.error('❌ Error saving media:', error);
      throw error;
    } finally {
      isProcessing.value = false;
    }
  };

  // Foto speichern aus File-Objekt (für Mehrfachauswahl)
  const savePhotoFromFile = async (
    file: File,
    galleryId: number
  ): Promise<number> => {
    const dataUrl = await fileToDataUrl(file);
    return savePhoto(dataUrl, galleryId, file.name);
  };

  // Mehrere Fotos speichern
  const saveMultiplePhotos = async (
    files: File[],
    galleryId: number,
    onProgress?: (current: number, total: number) => void
  ): Promise<number[]> => {
    isProcessing.value = true;
    const photoIds: number[] = [];
    
    try {
      for (let i = 0; i < files.length; i++) {
        const photoId = await savePhotoFromFile(files[i], galleryId);
        photoIds.push(photoId);
        
        if (onProgress) {
          onProgress(i + 1, files.length);
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

  return {
    isProcessing,
    takePhoto,
    pickMultiplePhotos,
    extractExifData,
    savePhoto,
    savePhotoFromFile,
    saveMultiplePhotos,
    deletePhoto,
    generatePhotoThumbnail,
    generateVideoThumbnail
  };
}
