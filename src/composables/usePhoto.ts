import { ref } from 'vue';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem } from '@capacitor/filesystem';
import { Geolocation } from '@capacitor/geolocation'; // Retained for route tracker module
import { Capacitor } from '@capacitor/core';
import { db, type Photo } from '@/services/database';
import { extractExifFromUri, extractGPSFromCameraExif, extractExifFromImage } from '@/services/exif';
import { copyContentUriToFile, getContentUriGps, getContentUriMeta, readContentUri } from '@/services/contentReader';
import { buildSharedStoragePath, getSharedStorageDirectory } from '@/services/storagePaths';

const videoExtensions = ['mp4', 'mov', 'webm', 'mkv', 'avi', '3gp', 'm4v'];
const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tiff'];
const MAX_EXIF_FALLBACK_BYTES = 20 * 1024 * 1024;

const logGpsMobi = (message: string, payload?: Record<string, unknown>) => {
  if (!payload) {
    console.log(`GPSMOBI ${message}`);
    return;
  }
  let serialized = '';
  try {
    serialized = JSON.stringify(payload);
  } catch {
    serialized = String(payload);
  }
  console.log(`GPSMOBI ${message} ${serialized}`);
};

const isUsableCoordinatePair = (lat?: number | null, lng?: number | null): boolean => {
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) < 0.000001 && Math.abs(lng) < 0.000001) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
};

const getExtensionFromUri = (uri: string) => {
  if (!uri) return '';
  const clean = uri.split('?')[0].split('#')[0];
  const parts = clean.split('.');
  if (parts.length <= 1) return '';
  return parts.pop()?.toLowerCase() || '';
};

const getExtensionFromMime = (mime?: string) => {
  if (!mime) return '';
  const [typePart] = mime.split(';');
  const parts = typePart.split('/');
  if (parts.length !== 2) return '';
  const subtype = parts[1].split('+')[0].split('.')[0];
  return subtype.toLowerCase();
};

const getExtensionFromName = (name?: string) => {
  if (!name) return '';
  const clean = name.split('?')[0].split('#')[0];
  const parts = clean.split('.');
  if (parts.length <= 1) return '';
  return parts.pop()?.toLowerCase() || '';
};

const getFilenameFromUri = (uri?: string) => {
  if (!uri) return '';
  const clean = uri.split('?')[0].split('#')[0];
  const slashIndex = clean.lastIndexOf('/');
  if (slashIndex === -1) return clean;
  return clean.slice(slashIndex + 1);
};

const normalizeVideoExtension = (ext?: string) => {
  const normalized = (ext || '').toLowerCase();
  if (normalized === 'quicktime') return 'mov';
  return normalized;
};

const getVideoMimeFromExtension = (ext?: string) => {
  const normalized = normalizeVideoExtension(ext);
  if (normalized === 'mov') return 'video/quicktime';
  if (normalized === '3gp') return 'video/3gpp';
  if (normalized === 'm4v') return 'video/x-m4v';
  return 'video/mp4';
};

const isVideoFromMeta = (meta?: { mimeType?: string; displayName?: string } | null) => {
  if (!meta) return false;
  if (meta.mimeType?.startsWith('video/')) return true;
  const nameExt = normalizeVideoExtension(getExtensionFromName(meta.displayName));
  return videoExtensions.includes(nameExt);
};

const isUriLikelyVideo = (uri?: string) => {
  if (!uri) return false;
  const normalized = uri.toLowerCase();
  if (normalized.startsWith('data:video')) return true;
  if (normalized.includes('/video/')) return true;
  if (normalized.includes('/videos/')) return true;
  if (normalized.includes(':video')) return true;
  if (normalized.includes('mime=video')) return true;
  const ext = getExtensionFromUri(uri);
  return videoExtensions.includes(ext);
};

const guessMimeFromBase64 = (base64: string) => {
  if (!base64) return undefined;
  try {
    const headerLength = 24;
    const slice = base64.slice(0, headerLength);
    const binary = atob(slice);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    if (bytes.length >= 12) {
      const signature = String.fromCharCode(...bytes.slice(4, 8));
      const brand = String.fromCharCode(...bytes.slice(8, 12));
      if (signature === 'ftyp') {
        if (brand.startsWith('qt')) return 'video/quicktime';
        if (brand.startsWith('3g')) return 'video/3gpp';
        return 'video/mp4';
      }
    }

    if (bytes.length >= 4) {
      if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
      if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
    }
  } catch (error) {
    console.warn('⚠️ Could not sniff base64 header:', error);
  }
  return undefined;
};

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
          const meta = await getContentUriMeta(uri);
          const isVideo = isUriLikelyVideo(uri) || isVideoFromMeta(meta);
          if (!isVideo) {
            const res = await readContentUri(uri);
            if (res && res.data) {
              return { path: uri || null, data: res.data };
            }
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
          const out: Array<{ path: string | null; data?: string | null }> = [];
          for (const u of uris) {
            try {
              const meta = await getContentUriMeta(u);
              const isVideo = isUriLikelyVideo(u) || isVideoFromMeta(meta);
              if (!isVideo) {
                const res = await readContentUri(u);
                out.push({ path: u || null, data: res?.data || null });
              } else {
                out.push({ path: u || null, data: null });
              }
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

  const guessMimeFromBlob = async (blob: Blob) => {
    if (blob.type) return blob.type;
    try {
      const headerBlob = blob.slice(0, 32);
      const headerBase64 = await blobToBase64(headerBlob);
      return guessMimeFromBase64(headerBase64);
    } catch (error) {
      console.warn('⚠️ Could not sniff blob header:', error);
      return undefined;
    }
  };

  // Hilfsfunktion: File zu Data URL
  const THUMBNAIL_MAX_DIMENSION = 480;
  const THUMBNAIL_QUALITY = 0.85;

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

  // Foto-Thumbnail generieren (bis zu 480px Kantenlänge)
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

        const maxSize = THUMBNAIL_MAX_DIMENSION;
        const ratio = Math.max(img.width, img.height) || maxSize;
        const scale = Math.min(1, maxSize / ratio);
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));

        canvas.width = width;
        canvas.height = height;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
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
        }, 'image/jpeg', THUMBNAIL_QUALITY);
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
          const exifData = videoDataUrl.startsWith('data:')
            ? extractExifFromImage(dataUrlToArrayBuffer(videoDataUrl))
            : null;

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
      if (photoUri.startsWith('content://') || photoUri.startsWith('file://')) {
        console.log('📸 Native URI detected, trying direct EXIF extraction from URI...');
        try {
          exifData = await extractExifFromUri(photoUri);
          console.log('   ✅ EXIF extracted from URI:', {
            hasGPS: exifData.latitude != null && exifData.longitude != null,
            latitude: exifData.latitude,
            longitude: exifData.longitude
          });
          logGpsMobi('uri exif', {
            hasGPS: exifData.latitude != null && exifData.longitude != null,
            latitude: exifData.latitude ?? null,
            longitude: exifData.longitude ?? null,
            uri: photoUri
          });
        } catch (err) {
          console.warn('⚠️ Could not extract EXIF from URI:', err);
        }
      }
      
      // Lade Datei als Blob (oder verwende provided base64Data direkt)
      let blob: Blob | undefined;
      let contentMeta: { mimeType?: string; displayName?: string; size?: number } | null = null;
      if (photoUri.startsWith('content://')) {
        try {
          contentMeta = await getContentUriMeta(photoUri);
        } catch (metaError) {
          console.warn('⚠️ Could not read content meta:', metaError);
        }
      }
      const uriExt = normalizeVideoExtension(getExtensionFromUri(photoUri));
      const metaExtForDetection = normalizeVideoExtension(getExtensionFromName(contentMeta?.displayName));
      const metaSaysVideo = Boolean(contentMeta?.mimeType?.startsWith('video/'))
        || videoExtensions.includes(metaExtForDetection)
        || videoExtensions.includes(uriExt);
      const inferredIsVideo = metaSaysVideo || isUriLikelyVideo(photoUri) || isVideoFromMeta(contentMeta);

      // Skip blob loading only for clearly-detected videos on native content:// URIs.
      const shouldLoadBlob = !(Capacitor.getPlatform() !== 'web' && metaSaysVideo && photoUri.startsWith('content://'));
      if (shouldLoadBlob) {
        if (base64Data && !inferredIsVideo) {
          // base64Data is raw base64 without data: prefix
          console.log('📥 Using base64 data provided by FilePicker (preserves EXIF)');
          const mime = guessMimeFromBase64(base64Data) || 'image/jpeg';
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
      }

      const sniffedMime = blob ? await guessMimeFromBlob(blob) : undefined;
      let mimeType = contentMeta?.mimeType || blob?.type || sniffedMime || (inferredIsVideo ? 'video/mp4' : 'image/jpeg');
      const mimeSaysVideo = Boolean(mimeType && mimeType.startsWith('video/'));
      const mimeSaysImage = Boolean(mimeType && mimeType.startsWith('image/'));
      const extSaysVideo = videoExtensions.includes(metaExtForDetection) || videoExtensions.includes(uriExt);
      const extSaysImage = imageExtensions.includes(getExtensionFromName(contentMeta?.displayName).toLowerCase())
        || imageExtensions.includes(getExtensionFromUri(photoUri).toLowerCase());

      // Prefer explicit MIME/ext signals to avoid false-positive video classification.
      let isVideo = mimeSaysVideo || extSaysVideo || (inferredIsVideo && !mimeSaysImage && !extSaysImage);

      console.log('🖼️ Blob loaded:', { type: blob?.type, size: blob?.size, isVideo, mimeType });

      // 2. Falls noch keine EXIF-Daten, versuche aus Blob
      if (!isVideo && blob && (exifData.latitude == null || exifData.longitude == null)) {
        console.log('📸 No GPS from URI, trying to extract from blob...');
        const arrayBuffer = await blob.arrayBuffer();
        arrayBufferForExif = arrayBuffer;
        const blobExifData = await extractExifFromImage(arrayBuffer);
        // Merge EXIF-Daten (blob kann andere Infos haben wie Kamera, etc.)
        exifData = { ...blobExifData, ...exifData };
        if (exifData.latitude == null && blobExifData.latitude != null) {
          exifData.latitude = blobExifData.latitude;
        }
        if (exifData.longitude == null && blobExifData.longitude != null) {
          exifData.longitude = blobExifData.longitude;
        }
        console.log('   - Extracted EXIF from blob:', {
          hasGPS: exifData.latitude != null && exifData.longitude != null,
          latitude: exifData.latitude,
          longitude: exifData.longitude,
          dateTaken: exifData.dateTaken,
          camera: exifData.camera
        });
        logGpsMobi('blob exif', {
          hasGPS: exifData.latitude != null && exifData.longitude != null,
          latitude: exifData.latitude ?? null,
          longitude: exifData.longitude ?? null,
          uri: photoUri
        });

        // 2b. Fallback: Wenn noch immer keine GPS-Daten vorhanden sind und wir eine content:// URI haben,
        // frage das native ContentReader Plugin per Capacitor an, das den ContentResolver nutzt und die
        // Originalbytes als Base64 zurückliefert.
        const metaExt = getExtensionFromName(contentMeta?.displayName);
        const looksLikeImage = (contentMeta?.mimeType ? contentMeta.mimeType.startsWith('image/') : false)
          || mimeType.startsWith('image/')
          || imageExtensions.includes(metaExt);
        const allowContentExifFallback =
          photoUri.startsWith('content://')
          && !isVideo
          && looksLikeImage
          && (contentMeta?.size ? contentMeta.size <= MAX_EXIF_FALLBACK_BYTES : false);

        if ((exifData.latitude == null || exifData.longitude == null) && allowContentExifFallback) {
          try {
            console.log('🔁 Trying native ContentReader fallback for original bytes...');
            const res = await readContentUri(photoUri);
            if (res && res.data) {
              const ab = base64ToArrayBuffer(res.data);
              const fallbackExif = await extractExifFromImage(ab);
              exifData = { ...fallbackExif, ...exifData };
              if (exifData.latitude == null && fallbackExif.latitude != null) {
                exifData.latitude = fallbackExif.latitude;
              }
              if (exifData.longitude == null && fallbackExif.longitude != null) {
                exifData.longitude = fallbackExif.longitude;
              }
              console.log('   - Extracted EXIF from native content bytes:', {
                hasGPS: exifData.latitude != null && exifData.longitude != null,
                latitude: exifData.latitude,
                longitude: exifData.longitude
              });
              logGpsMobi('native content exif', {
                hasGPS: exifData.latitude != null && exifData.longitude != null,
                latitude: exifData.latitude ?? null,
                longitude: exifData.longitude ?? null,
                uri: photoUri
              });
            }
          } catch (nativeErr) {
            console.warn('⚠️ Native ContentReader fallback failed:', nativeErr);
          }
        }

        if ((exifData.latitude == null || exifData.longitude == null) && photoUri.startsWith('content://')) {
          try {
            const nativeGps = await getContentUriGps(photoUri);
            if (
              nativeGps
              && Number.isFinite(nativeGps.latitude)
              && Number.isFinite(nativeGps.longitude)
              && Math.abs(nativeGps.latitude as number) <= 90
              && Math.abs(nativeGps.longitude as number) <= 180
              && !(Math.abs(nativeGps.latitude as number) < 0.000001 && Math.abs(nativeGps.longitude as number) < 0.000001)
            ) {
              exifData.latitude = nativeGps.latitude as number;
              exifData.longitude = nativeGps.longitude as number;
              logGpsMobi('native content gps fallback', {
                latitude: exifData.latitude,
                longitude: exifData.longitude,
                source: nativeGps.source || 'unknown',
                uri: photoUri
              });
            }
          } catch (nativeGpsError) {
            console.warn('⚠️ Native ContentReader GPS fallback failed:', nativeGpsError);
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
        
        if (!hasImageGPS && !manualLocation) {
          const pathHints = [photoUri];
          if (photoUri.startsWith('file://')) {
            pathHints.push(photoUri.replace('file://', ''));
          }

          const filenameHints = [
            contentMeta?.displayName,
            getFilenameFromUri(photoUri),
            filename
          ].filter((entry): entry is string => Boolean(entry && entry.trim()));

          const dbGps = await db.findPhotoGpsByHints(pathHints, filenameHints);
          if (dbGps) {
            exifData.latitude = dbGps.latitude;
            exifData.longitude = dbGps.longitude;
            logGpsMobi('reused DB GPS', {
              latitude: exifData.latitude,
              longitude: exifData.longitude,
              sourcePhotoId: dbGps.photoId,
              uri: photoUri,
              filenameHints
            });
          }
        }

        const hasFinalGps = (exifData.latitude !== undefined && exifData.latitude !== null)
          && (exifData.longitude !== undefined && exifData.longitude !== null);

        if (hasFinalGps) {
          console.log('✅ Using GPS from image EXIF - no fallback needed');
          logGpsMobi('selected image GPS', {
            latitude: exifData.latitude ?? null,
            longitude: exifData.longitude ?? null,
            uri: photoUri
          });
        } else if (!manualLocation) {
          console.log('⚠️ No GPS in image and no manual location provided');
          logGpsMobi('no GPS available', { uri: photoUri });
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
          logGpsMobi('manual GPS override', {
            latitude: exifData.latitude ?? null,
            longitude: exifData.longitude ?? null,
            uri: photoUri
          });
        }
        
        console.log('📊 Final EXIF data:', exifData);
      }

      // 2. Dateiname generieren falls nicht vorhanden
      const inferredExt = normalizeVideoExtension(getExtensionFromUri(photoUri));
      const metaExt = normalizeVideoExtension(getExtensionFromName(contentMeta?.displayName));
      const mimeExt = normalizeVideoExtension(getExtensionFromMime(mimeType)) || 'mp4';
      const normalizedInferredExt = inferredExt.replace(/\./g, '');
      const videoExt = videoExtensions.includes(metaExt) && metaExt
        ? metaExt
        : videoExtensions.includes(normalizedInferredExt) && normalizedInferredExt
        ? normalizedInferredExt
        : videoExtensions.includes(mimeExt)
        ? mimeExt
        : 'mp4';
      const extension = isVideo ? `.${videoExt}` : '.jpg';
      const finalFilename = filename || `${isVideo ? 'video' : 'photo'}_${Date.now()}${extension}`;

      // 3. Foto/Video konvertieren
      // If base64Data was passed in, reuse it (already raw base64); otherwise create it from blob
      let finalBase64: string | undefined;
      let dataUrl: string | undefined;
      const shouldUseProvidedBase64 = base64Data && !isVideo;
      if (blob || shouldUseProvidedBase64) {
        finalBase64 = shouldUseProvidedBase64 ? base64Data || undefined : await blobToBase64(blob as Blob);
        dataUrl = `data:${mimeType};base64,${finalBase64}`;
      }

      // 4. Speichere Datei im Filesystem (nur auf nativen Plattformen)
      const isNative = Capacitor.getPlatform() !== 'web';
      let filePath = '';
      let nativeStoragePath: string | undefined;
      
      let usedNativeCopy = false;
      if (isNative && photoUri.startsWith('content://')) {
        try {
          const targetPath = buildSharedStoragePath('galleries', galleryId.toString(), finalFilename);
          const copiedPath = await copyContentUriToFile(photoUri, targetPath);
          if (copiedPath) {
            filePath = copiedPath;
            nativeStoragePath = copiedPath;
            usedNativeCopy = true;
            if (!mimeType) {
              mimeType = isVideo ? getVideoMimeFromExtension(videoExt) : 'image/jpeg';
            }

            // Re-run EXIF extraction from the copied original file.
            // This is the authoritative source after native copy and should be preferred for GPS.
            if (!isVideo) {
              try {
                const copiedExif = await extractExifFromUri(copiedPath);

                if (isUsableCoordinatePair(copiedExif.latitude ?? null, copiedExif.longitude ?? null)) {
                  exifData.latitude = copiedExif.latitude;
                  exifData.longitude = copiedExif.longitude;
                  logGpsMobi('copied file GPS selected', {
                    latitude: exifData.latitude ?? null,
                    longitude: exifData.longitude ?? null,
                    copiedPath
                  });
                }

                // Keep existing values where copied EXIF has no data, but fill all other metadata from copied file.
                exifData = { ...copiedExif, ...exifData };
              } catch (copyExifError) {
                console.warn('⚠️ EXIF extraction from copied file failed:', copyExifError);
              }
            }
          }
        } catch (copyError) {
          console.warn('⚠️ Native content copy failed, falling back to base64 write:', copyError);
        }
      }

      if (isNative) {
        if (!usedNativeCopy) {
          try {
            // Erstelle Gallery-Ordner explizit VORHER (recursive: true funktioniert nicht auf Android)
            const galleryFolder = buildSharedStoragePath('galleries', galleryId.toString());
            try {
              await Filesystem.mkdir({
                path: galleryFolder,
                directory: getSharedStorageDirectory(),
                recursive: true
              });
            } catch (mkdirError) {
              console.log('📁 Directory already exists or created');
            }

              const result = await Filesystem.writeFile({
                path: buildSharedStoragePath('galleries', galleryId.toString(), finalFilename),
                data: finalBase64 || '',
                directory: getSharedStorageDirectory()
              });
              const nativePath = result.uri;
              filePath = nativePath;
              nativeStoragePath = nativePath;
              console.log('💾 File saved to filesystem:', nativePath);
          } catch (fsError) {
            console.error('⚠️ Filesystem write failed - skipping DB save:', fsError);
            throw new Error(`Filesystem error: ${fsError}`);
          }
        }
      } else {
        // Web: Verwende Data-URL
        filePath = dataUrl || '';
      }

      // 4.5 Width/Height sicherstellen (falls nicht aus EXIF vorhanden)
      if (!isVideo && (!exifData.width || !exifData.height)) {
        try {
          const source = isNative ? filePath : (dataUrl || '');
          if (source) {
            const dimensions = await getImageDimensions(source);
            if (!exifData.width) exifData.width = dimensions.width;
            if (!exifData.height) exifData.height = dimensions.height;
            console.log('📐 Image dimensions extracted:', dimensions);
          }
        } catch (dimError) {
          console.warn('⚠️ Could not extract image dimensions:', dimError);
        }
      }

      // 4.6 Thumbnail generieren und speichern
      let thumbnailPath: string | undefined;
      try {
        if (isVideo) {
          const videoSrc = isNative ? (filePath ? Capacitor.convertFileSrc(filePath) : '') : (dataUrl || '');
          if (videoSrc) {
            const { thumbnailBlob: vidThumb } = await generateVideoThumbnail(videoSrc);
          if (vidThumb) {
            const thumbBase64 = await blobToBase64(vidThumb);
            thumbnailPath = `data:image/jpeg;base64,${thumbBase64}`;
          }
          }
        } else {
          const { thumbnailBlob: photoThumb } = await generatePhotoThumbnail(dataUrl || '');
          const thumbBase64 = await blobToBase64(photoThumb);
          thumbnailPath = `data:image/jpeg;base64,${thumbBase64}`;
        }
      } catch (thumbError) {
        console.warn('⚠️ Could not generate thumbnail:', thumbError);
      }

      // 5. In Datenbank speichern (MIT Thumbnail)
      console.log('💿 Saving to database with EXIF data:');
      console.log('   - Gallery ID:', galleryId);
      console.log('   - Filename:', finalFilename);
      console.log('   - Thumbnail:', thumbnailPath ? 'generated' : 'skipped');
      console.log('   - GPS Latitude:', exifData.latitude);
      console.log('   - GPS Longitude:', exifData.longitude);
      console.log('   - Camera:', exifData.camera);
      console.log('   - Date taken:', exifData.dateTaken);

      if (!filePath) {
        throw new Error('File path missing after save');
      }
      
      const fileSize = blob?.size ?? contentMeta?.size;
      const photoId = await db.createPhoto({
        galleryId,
        filename: finalFilename,
        filepath: filePath,  // Nur der Pfad zur Datei
        storagePath: nativeStoragePath,
        thumbnail: thumbnailPath,
        mimeType,
        isVideo,
        filesize: fileSize,
        ...exifData
      });

      console.log('🧾 Saved media metadata:', JSON.stringify({
        filename: finalFilename,
        filepath: filePath,
        storagePath: nativeStoragePath,
        mimeType,
        isVideo,
        thumbnailStored: thumbnailPath ? 'yes' : 'no'
      }));

      console.log('✅ Media saved successfully with ID:', photoId, '- GPS in DB:', exifData.latitude != null && exifData.longitude != null);
      logGpsMobi('saved media gps', {
        photoId,
        galleryId,
        hasGPS: exifData.latitude != null && exifData.longitude != null,
        latitude: exifData.latitude ?? null,
        longitude: exifData.longitude ?? null,
        filepath: filePath
      });
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
      const pathToDelete = photo.storagePath || photo.filepath;
      if (pathToDelete && !pathToDelete.startsWith('data:')) {
        try {
          await Filesystem.deleteFile({
            path: pathToDelete
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
    const sharedPath = buildSharedStoragePath(path);
    try {
      await Filesystem.mkdir({
        path: sharedPath,
        directory: getSharedStorageDirectory(),
        recursive: true
      });
      console.log('📂 Verzeichnis erstellt:', sharedPath);
    } catch (error: any) {
      if (error.code === 'EEXIST') {
        console.log('📂 Verzeichnis existiert bereits:', sharedPath);
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
      const savedPath = buildSharedStoragePath(targetDirectory, fileName);

      // Schreibe die Datei in das App-Verzeichnis
      await Filesystem.writeFile({
        path: savedPath,
        data: await blobToBase64(blob),
        directory: getSharedStorageDirectory()
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
  const sharedPath = buildSharedStoragePath(path);
  try {
    await Filesystem.mkdir({
      path: sharedPath,
      directory: getSharedStorageDirectory(),
      recursive: true,
    });
  } catch (error: any) {
    if (error.code !== 'EEXIST' && error.code !== 'OS-PLUG-FILE-0010') {
      throw error; // Re-throw if the error is not about the directory already existing
    }
  }
}

export { ensureDirectoryExists };
