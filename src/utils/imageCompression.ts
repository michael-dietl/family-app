import Pica from 'pica';
import * as piexif from 'piexifjs';

interface ResizeImageOptions {
  targetLongEdge?: number;
  quality?: number;
}

const JPEG_MIME = 'image/jpeg';
const JPG_MIME = 'image/jpg';
const isJpegBlob = (blob: Blob) => {
  if (!blob?.type) return false;
  const mime = blob.type.toLowerCase();
  return mime === JPEG_MIME || mime === JPG_MIME;
};

const blobToDataURL = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = () => reject(new Error('Could not convert blob to DataURL'));
    reader.readAsDataURL(blob);
  });

const dataURLToBlob = (dataURL: string): Blob => {
  const [header, base64] = dataURL.split(',');
  const mimeMatch = /data:(.*);base64/.exec(header);
  const mimeType = mimeMatch?.[1] ?? JPEG_MIME;
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: mimeType });
};

export const loadImageElementFromBlob = (blob: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('DOM is not available')); // Should not happen inside the app
      return;
    }
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };
    img.src = url;
  });

const sanitizeQuality = (value: number | undefined) => {
  const normalized = Number.isFinite(value ?? NaN) ? value! : 0.85;
  if (normalized <= 0) return 0.2;
  if (normalized > 1) return 1;
  return normalized;
};

const createCanvas = (width: number, height: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  return canvas;
};

/**
 * Resizes a JPEG blob while keeping the EXIF payload intact and re-encoding it at a controlled quality.
 */
export async function resizeImagePreservingExif(
  source: Blob,
  { targetLongEdge = 3000, quality }: ResizeImageOptions = {}
): Promise<Blob> {
  if (typeof document === 'undefined') {
    return source;
  }
  if (!isJpegBlob(source)) {
    return source;
  }

  const sanitizedQuality = sanitizeQuality(quality);
  let exifPayload: string | null = null;

  try {
    const originalDataUrl = await blobToDataURL(source);
    const originalExif = piexif.load(originalDataUrl);
    exifPayload = piexif.dump(originalExif);
  } catch (error) {
    console.info('[image-compression] Could not preserve EXIF metadata', error);
  }

  const img = await loadImageElementFromBlob(source);
  const effectiveLimit = Math.max(1, targetLongEdge);
  const scale = Math.min(1, effectiveLimit / Math.max(img.width || 1, img.height || 1));
  const targetWidth = Math.max(1, Math.round(img.width * scale));
  const targetHeight = Math.max(1, Math.round(img.height * scale));

  const srcCanvas = createCanvas(img.width, img.height);
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) {
    throw new Error('Could not obtain canvas context for resizing');
  }
  srcCtx.drawImage(img, 0, 0);

  const dstCanvas = createCanvas(targetWidth, targetHeight);
  const pica = new Pica({ features: ['wasm', 'ww', 'cib', 'js'] });
  await pica.resize(srcCanvas, dstCanvas);

  const resizedBlob = await pica.toBlob(dstCanvas, 'image/jpeg', sanitizedQuality);
  if (!resizedBlob) {
    throw new Error('Image resize produced no output');
  }

  if (!exifPayload) {
    return resizedBlob;
  }

  const resizedDataUrl = await blobToDataURL(resizedBlob);
  const withExif = piexif.insert(exifPayload, resizedDataUrl);
  return dataURLToBlob(withExif);
}

export const getBlobLongEdge = async (blob: Blob): Promise<number> => {
  const img = await loadImageElementFromBlob(blob);
  return Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);
};
