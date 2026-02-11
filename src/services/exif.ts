/**
 * EXIF Service - Zentrale GPS/EXIF Daten-Extraktion
 * 
 * Dieser Service stellt eine einheitliche Schnittstelle für die Extraktion
 * von EXIF-Daten bereit, die von allen Modulen (Gallery, Wine, etc.) genutzt wird.
 * Basiert auf der funktionierenden Implementierung aus dem Wine-Modul.
 */

import * as ExifReader from 'exifreader'; // Corrected import
import * as exifr from 'exifr'; // Added import for exifr library
import { Filesystem, Directory } from '@capacitor/filesystem';
// child_process is only available in Node environments — do not import at top-level

/**
 * GPS-Koordinaten
 */
export interface GPSCoordinates {
  latitude: number | null;
  longitude: number | null;
}

/**
 * Vollständige EXIF-Daten
 */
export interface ExifData {
  latitude?: number | null;
  longitude?: number | null;
  dateTaken?: string;
  camera?: string;
  lens?: string;
  focalLength?: string;
  aperture?: string;
  shutterSpeed?: string;
  iso?: number;
  width?: number;
  height?: number;
  orientation?: number; // 1..8 according to EXIF spec
}

/**
 * Validiert GPS-Koordinaten
 */
function isValidGPS(lat?: number, lng?: number): boolean {
  console.log('🔍 Validating GPS coordinates:', { lat, lng });
  if (lat === undefined || lng === undefined) {
    console.log('⚠️ Validation failed: Coordinates are undefined');
    return false;
  }
  if (isNaN(lat) || isNaN(lng)) {
    console.log('⚠️ Validation failed: Coordinates are NaN');
    return false;
  }
  if (lat < -90 || lat > 90) {
    console.log('⚠️ Validation failed: Latitude out of range (-90 to 90)', { lat });
    return false;
  }
  if (lng < -180 || lng > 180) {
    console.log('⚠️ Validation failed: Longitude out of range (-180 to 180)', { lng });
    return false;
  }
  console.log('✅ GPS coordinates are valid:', { lat, lng });
  return true;
}

/**
 * Extrahiert GPS-Koordinaten aus EXIF-Daten
 * 
 * @param filePath - Bild als Datei-URI
 * @returns GPS-Koordinaten oder undefined
 */
export async function extractGPSFromImage(source: string | ArrayBuffer): Promise<GPSCoordinates | undefined> {
  const logSource = typeof source === 'string' ? source : 'ArrayBuffer';
  try {
    const exifData = await exifr.parse(source, { gps: true });

    if (exifData && exifData.latitude && exifData.longitude) {
      return {
        latitude: exifData.latitude,
        longitude: exifData.longitude,
      };
    }

    console.warn('Keine GPS-Daten in der Originaldatei gefunden:', logSource);
    return undefined;
  } catch (error) {
    console.error('Fehler beim Extrahieren der GPS-Daten aus der Originaldatei:', logSource, error);
    return undefined;
  }
}

/**
 * Extrahiert vollständige EXIF-Daten aus einem Bild
 * 
 * @param arrayBuffer - Bild als ArrayBuffer
 * @returns EXIF-Daten
 */
export async function extractExifFromImage(arrayBuffer: ArrayBuffer): Promise<ExifData> {
  const exifData: ExifData = {};

  try {
    // ========================================
    // TEST: ExifReader vs exifr Vergleich
    // ========================================
    console.log('🧪 EXIF LIBRARY COMPARISON TEST');
    
    // Test 1: ExifReader (aktuell)
    console.log('📚 Testing ExifReader...');
    const tags = ExifReader.load(arrayBuffer, { expanded: true });
    console.log('   - Has GPS section:', !!tags.gps);
    if (tags.gps) {
      console.log('   - GPS object:', JSON.stringify(tags.gps, null, 2));
    }
    
    // Test 2: exifr (alternative)
    console.log('📚 Testing exifr...');
    try {
      const exifrOutput = await exifr.parse(arrayBuffer, {
        gps: true,
        tiff: true,
        exif: true,
        xmp: false,
        iptc: false,
        icc: false
      });
      console.log('   - Full exifr output:', JSON.stringify(exifrOutput, null, 2));
      console.log('   - Has latitude:', exifrOutput?.latitude);
      console.log('   - Has longitude:', exifrOutput?.longitude);
    } catch (exifrError) {
      console.error('   ❌ exifr failed:', exifrError);
    }
    
    console.log('🧪 END COMPARISON TEST');
    // ========================================

    console.log('📸 EXIF tags loaded, has GPS section:', !!tags.gps);
    
    // ALLE EXIF Tags loggen für Debugging
    console.log('🔍 ALL EXIF TAGS:', JSON.stringify(Object.keys(tags)));
    if (tags.gps) {
      console.log('🔍 GPS OBJECT FULL:', JSON.stringify(tags.gps, null, 2));
    }

    // GPS-Daten
    const gps = tags.gps;
    if (gps && (gps.Latitude !== undefined && gps.Latitude !== null) && 
               (gps.Longitude !== undefined && gps.Longitude !== null)) {
      console.log('   - Raw GPS from tags:', JSON.stringify({
        Latitude: gps.Latitude,
        LatitudeType: typeof gps.Latitude,
        Longitude: gps.Longitude,
        LongitudeType: typeof gps.Longitude
      }));
      
      const latitude = typeof gps.Latitude === 'number' ? gps.Latitude : undefined;
      const longitude = typeof gps.Longitude === 'number' ? gps.Longitude : undefined;
      
      console.log('   - After type check:', JSON.stringify({ latitude, longitude }));
      
      if (isValidGPS(latitude, longitude)) {
        exifData.latitude = latitude;
        exifData.longitude = longitude;
        console.log('   ✅ GPS coordinates stored:', JSON.stringify({ latitude, longitude }));
      } else {
        console.log('   ⚠️ GPS validation failed:', JSON.stringify({ latitude, longitude }));
      }
    } else {
      console.log('   ⚠️ No GPS in tags or invalid GPS data, gps object:', JSON.stringify({
        hasGps: !!gps,
        hasLatitude: gps ? (gps.Latitude !== undefined && gps.Latitude !== null) : false,
        hasLongitude: gps ? (gps.Longitude !== undefined && gps.Longitude !== null) : false,
        gpsKeys: gps ? Object.keys(gps) : []
      }));
    }

    // Datum
    if (tags.exif?.DateTimeOriginal) {
      exifData.dateTaken = tags.exif.DateTimeOriginal.description || tags.exif.DateTimeOriginal.value?.[0];
    }

    // Kamera-Informationen
    if (tags.exif?.Make && tags.exif?.Model) {
      const make = tags.exif.Make.description || tags.exif.Make.value?.[0];
      const model = tags.exif.Model.description || tags.exif.Model.value?.[0];
      exifData.camera = `${make} ${model}`.trim();
    }

    // Objektiv
    if (tags.exif?.LensModel) {
      exifData.lens = tags.exif.LensModel.description || tags.exif.LensModel.value?.[0];
    }

    // Brennweite
    if (tags.exif?.FocalLength) {
      exifData.focalLength = tags.exif.FocalLength.description || `${tags.exif.FocalLength.value?.[0]}mm`;
    }

    // Blende
    if (tags.exif?.FNumber) {
      exifData.aperture = tags.exif.FNumber.description || `f/${tags.exif.FNumber.value?.[0]}`;
    }

    // Verschlusszeit
    if (tags.exif?.ExposureTime) {
      const exposureValue = tags.exif.ExposureTime.description || tags.exif.ExposureTime.value?.[0];
      exifData.shutterSpeed = typeof exposureValue === 'string' ? exposureValue : String(exposureValue);
    }

    // ISO
    if (tags.exif?.ISOSpeedRatings) {
      const isoValue = tags.exif.ISOSpeedRatings.value;
      exifData.iso = Array.isArray(isoValue) ? isoValue[0] : isoValue;
    }

    // Bildgröße
    if (tags.file?.['Image Width'] && tags.file?.['Image Height']) {
      exifData.width = tags.file['Image Width'].value;
      exifData.height = tags.file['Image Height'].value;
    }

    // Orientation (falls vorhanden) - Werte 1..8
    if (tags.exif && tags.exif.Orientation) {
      // tags.exif.Orientation.value can be a number or an array; handle both safely for TS
      let oriCandidate: any = undefined;
      if (tags.exif.Orientation.description) oriCandidate = tags.exif.Orientation.description;
      if (oriCandidate === undefined) {
        const val = (tags.exif.Orientation as any).value;
        if (Array.isArray(val)) oriCandidate = val[0];
        else if (val !== undefined) oriCandidate = val;
      }
      const orientationNum = typeof oriCandidate === 'number' ? oriCandidate : parseInt(String(oriCandidate), 10);
      if (!isNaN(orientationNum)) {
        exifData.orientation = orientationNum;
        console.log('   - EXIF orientation detected:', orientationNum);
      }
    }

    // If orientation indicates a 90/270 degree rotation, swap width/height
    if (exifData.orientation && (exifData.orientation === 5 || exifData.orientation === 6 || exifData.orientation === 7 || exifData.orientation === 8)) {
      if (exifData.width && exifData.height) {
        const w = exifData.width;
        exifData.width = exifData.height;
        exifData.height = w;
        console.log('   - Swapped width/height due to EXIF orientation:', exifData.width, exifData.height);
      }
    }

    console.log('✅ EXIF data extracted:', exifData);
  } catch (error) {
    console.warn('⚠️ Could not extract EXIF data:', error);
  }

  return exifData;
}

/**
 * Extrahiert EXIF-Daten aus einer Datei-URI
 * 
 * @param fileUri - Capacitor Filesystem URI
 * @returns EXIF-Daten
 */
export async function extractExifFromUri(fileUri: string): Promise<ExifData> {
  try {
    console.log('📖 Reading file from URI:', fileUri);
    
    // WICHTIG: Für content:// URIs müssen wir Capacitor.convertFileSrc() verwenden
    // um eine WebView-kompatible URL zu erhalten, die EXIF-Daten erhält
    let arrayBuffer: ArrayBuffer;
    
    if (fileUri.startsWith('content://') || fileUri.startsWith('file://')) {
      console.log('📱 Native URI detected, converting to WebView URL...');
      const { Capacitor } = await import('@capacitor/core');
      const webViewPath = Capacitor.convertFileSrc(fileUri);
      console.log('   🔄 Converted to:', webViewPath);
      
      const response = await fetch(webViewPath);
      const blob = await response.blob();
      console.log('📦 Blob loaded:', { type: blob.type, size: blob.size });
      arrayBuffer = await blob.arrayBuffer();
    } else {
      console.log('🌐 Standard URL, loading via fetch...');
      const response = await fetch(fileUri);
      const blob = await response.blob();
      arrayBuffer = await blob.arrayBuffer();
    }

    const exifResult = await extractExifFromImage(arrayBuffer);
    console.log('   ✅ EXIF extraction result:', {
      hasGPS: !!(exifResult.latitude && exifResult.longitude),
      latitude: exifResult.latitude,
      longitude: exifResult.longitude
    });
    return exifResult;
  } catch (error) {
    console.warn('⚠️ Could not extract EXIF from URI:', error);
    return {};
  }
}

/**
 * Extrahiert GPS-Koordinaten aus einer Datei-URI
 * 
 * @param fileUri - Capacitor Filesystem URI
 * @returns GPS-Koordinaten oder undefined
 */
export async function extractGPSFromUri(fileUri: string): Promise<GPSCoordinates | undefined> {
  try {
    const fileData = await Filesystem.readFile({
      path: fileUri
    });

    const base64Data = typeof fileData.data === 'string' ? fileData.data : '';
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return await extractGPSFromImage(bytes.buffer);
  } catch (error) {
    console.warn('⚠️ Could not extract GPS from URI:', error);
    return undefined;
  }
}

/**
 * Hilfsfunktion: Parst GPS-String aus Camera API
 * Format: "48/1,3/1,25217640/1000000" -> Dezimalgrad
 * 
 * @param gpsString - GPS-String im Camera API Format
 * @param ref - Referenz (N/S für Latitude, E/W für Longitude)
 * @returns Dezimalgrad oder undefined
 */
export function parseGPSStringFromCamera(gpsString: string, ref: string): number | undefined {
  try {
    const parts = gpsString.split(',');
    if (parts.length !== 3) return undefined;

    const parseFraction = (fraction: string): number => {
      const [numerator, denominator] = fraction.split('/').map(Number);
      return denominator ? numerator / denominator : numerator;
    };

    const degrees = parseFraction(parts[0]);
    const minutes = parseFraction(parts[1]);
    const seconds = parseFraction(parts[2]);

    let decimal = degrees + (minutes / 60) + (seconds / 3600);

    // Südliche Breite oder westliche Länge sind negativ
    if (ref === 'S' || ref === 'W') {
      decimal = -decimal;
    }

    return decimal;
  } catch (error) {
    console.warn('⚠️ Could not parse GPS string:', gpsString, error);
    return undefined;
  }
}

/**
 * Extrahiert GPS aus Camera API EXIF-Daten
 * 
 * @param exifData - EXIF-Daten von Camera.getPhoto()
 * @returns GPS-Koordinaten oder undefined
 */
export function extractGPSFromCameraExif(exifData: any): GPSCoordinates | undefined {
  try {
    console.log('🔧 EXIF Service - extractGPSFromCameraExif called');
    console.log('   - Input exifData:', JSON.stringify(exifData, null, 2));
    
    if (!exifData.GPSLatitude || !exifData.GPSLongitude) {
      console.log('   ⚠️ No GPS data in Camera EXIF');
      return undefined;
    }

    console.log('   - Parsing latitude:', exifData.GPSLatitude, exifData.GPSLatitudeRef);
    const latitude = parseGPSStringFromCamera(
      exifData.GPSLatitude,
      exifData.GPSLatitudeRef || 'N'
    );
    
    console.log('   - Parsing longitude:', exifData.GPSLongitude, exifData.GPSLongitudeRef);
    const longitude = parseGPSStringFromCamera(
      exifData.GPSLongitude,
      exifData.GPSLongitudeRef || 'E'
    );

    console.log('   - Parsed values:', { latitude, longitude });
    
    if (!isValidGPS(latitude, longitude)) {
      console.log('   ⚠️ GPS validation failed');
      return undefined;
    }

    console.log('   ✅ GPS extracted successfully:', { latitude, longitude });
    return { latitude: latitude!, longitude: longitude! };
  } catch (error) {
    console.warn('⚠️ Could not extract GPS from Camera EXIF:', error);
    return undefined;
  }
}

export async function extractGPSFromSpecificPath(filePath: string): Promise<void> {
  try {
    if (typeof window === 'undefined') {
      const cp = await import('child_process');
      cp.exec(`exiftool -gpslatitude -gpslongitude "${filePath}"`, (error: Error | null, stdout: string, stderr: string) => {
        if (error) {
          console.error('❌ Fehler beim Ausführen von exiftool');
          return;
        }
        if (stderr) {
          console.error('⚠️ exiftool Warnung', stderr);
          return;
        }
        console.log('📍 GPS-Daten aus exiftool:', stdout);
      });
    } else {
      console.warn('exiftool nicht verfügbar in Web/Capacitor-Umgebung');
    }
  } catch (err) {
    console.error('❌ Fehler beim Lesen der Datei');
  }
}

// Beispielaufruf (Dateiname anpassen)
// extractGPSWithExifToolOnDevice('example.jpg');
// extractGPSFromSpecificPath('/sdcard/SdCardBackUp/DCIM/Camera/20240331_132252.jpg');
