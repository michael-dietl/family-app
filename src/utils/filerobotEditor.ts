import FilerobotImageEditor from 'filerobot-image-editor';
import { FilerobotImageEditorConfig, TABS, TOOLS } from 'react-filerobot-image-editor';

const LANGUAGE_OVERRIDES: Record<string, string> = {
  en: 'en',
  de: 'de',
  fr: 'fr',
  it: 'it',
  pt: 'pt',
  es: 'es',
  nl: 'nl',
  pl: 'pl',
  ro: 'ro',
  bar: 'de',
};

const DEFAULT_MIME = 'image/jpeg';

const DEFAULT_TABS = [
  TABS.ADJUST,
  TABS.FINETUNE,
  TABS.FILTERS,
  TABS.ANNOTATE,
  TABS.RESIZE,
];

type SavedImageData = {
  imageBase64?: string;
  imageCanvas?: HTMLCanvasElement;
  mimeType?: string;
};

export type ImagePayload = {
  base64: string;
  dataUrl: string;
  mimeType: string;
};

const getNormalizedLocale = (locale?: string) => locale?.split('-')[0].toLowerCase() || 'en';

export const getFilerobotLanguage = (locale?: string): string => {
  const normalized = getNormalizedLocale(locale);
  return LANGUAGE_OVERRIDES[normalized] || 'en';
};

export const getDevicePixelRatio = (): number => {
  if (typeof window === 'undefined') return 1;
  return window.devicePixelRatio || 1;
};

let filerobotStylesLoaded = false;
let filerobotStyleContent: string | null = null;
let filerobotStyleElement: HTMLStyleElement | null = null;
let filerobotStyleUsers = 0;

const ensureStyleElement = async () => {
  if (typeof document === 'undefined') return;
  if (!filerobotStyleContent) {
    const module = await import('@/styles/filerobot-style.css?raw');
    filerobotStyleContent = module.default;
  }

  if (!filerobotStyleElement) {
    filerobotStyleElement = document.createElement('style');
    filerobotStyleElement.dataset.editor = 'filerobot';
  }

  if (!filerobotStyleElement.isConnected) {
    filerobotStyleElement.textContent = filerobotStyleContent || '';
    document.head.appendChild(filerobotStyleElement);
  } else if (filerobotStyleElement.textContent !== filerobotStyleContent) {
    filerobotStyleElement.textContent = filerobotStyleContent || '';
  }
};

export const loadFilerobotStyles = async () => {
  if (typeof document === 'undefined') return;
  filerobotStyleUsers += 1;
  try {
    await ensureStyleElement();
    filerobotStylesLoaded = true;
  } catch (error) {
    filerobotStyleUsers = Math.max(0, filerobotStyleUsers - 1);
    throw error;
  }
};

export const unloadFilerobotStyles = () => {
  if (filerobotStyleUsers <= 0) return;
  filerobotStyleUsers -= 1;
  if (filerobotStyleUsers === 0 && filerobotStyleElement?.isConnected) {
    filerobotStyleElement.remove();
    filerobotStylesLoaded = false;
  }
};


export const buildFilerobotConfig = (
  source: string,
  language: string,
  overrides: Partial<FilerobotImageEditorConfig> = {}
): FilerobotImageEditorConfig => {
  const { tabsIds, ...restOverrides } = overrides;

  const config: FilerobotImageEditorConfig = {
    source,
    language,
    tabsIds: tabsIds ?? DEFAULT_TABS,
    defaultTabId: TABS.ADJUST,
    defaultToolId: TOOLS.CROP,
    Crop: {
      ratio: 'custom',
      presetsItems: [
        { titleKey: 'custom', ratio: 'custom' },
        { titleKey: 'original', ratio: 'original', noEffect: true }
      ]
    },
    removeSaveButton: true,
    disableSaveIfNoChanges: false,
    observePluginContainerSize: true,
    savingPixelRatio: getDevicePixelRatio(),
    previewPixelRatio: getDevicePixelRatio(),
    backgroundColor: '#1e1e1e',
    noCrossOrigin: true,
    ...restOverrides,
  };

  // ⭐ WICHTIGER FIX – sanft gemerged, zerstört nichts
  if (overrides.Rotate) {
    (config as any).Rotate = {
      ...(config as any).Rotate,
      ...overrides.Rotate,
    };
  }

  if (overrides.Crop) {
    (config as any).Crop = {
      ...(config as any).Crop,
      ...overrides.Crop
    };
  }

  return config;
};

const buildDataUrl = (mimeType: string, base64: string) => `data:${mimeType};base64,${base64}`;

const sanitizeBase64 = (base64: string): string => {
  const trimmed = base64.trim().replace(/[\r\n\s]/g, '');
  if (!trimmed) return trimmed;
  const normalized = trimmed.replace(/-/g, '+').replace(/_/g, '/');
  const stripped = normalized.replace(/[^A-Za-z0-9+/=]/g, '');
  const padding = stripped.length % 4;
  if (padding === 0) return stripped;
  return stripped + '='.repeat(4 - padding);
};

const getBase64Payload = (imageData: SavedImageData, fallbackMime = DEFAULT_MIME): ImagePayload => {
  const mimeType = imageData.mimeType || fallbackMime;

  if (imageData.imageCanvas) {
    const dataUrl = imageData.imageCanvas.toDataURL(mimeType);
    const base64 = dataUrl.split(',')[1];
    return {
      base64,
      mimeType,
      dataUrl,
    };
  }

  if (imageData.imageBase64) {
    const cleaned = sanitizeBase64(imageData.imageBase64);
    return {
      base64: cleaned,
      mimeType,
      dataUrl: buildDataUrl(mimeType, cleaned),
    };
  }

  throw new Error('Filerobot returned no image data.');
};

export const getImagePayload = (imageData: SavedImageData, fallbackMime = DEFAULT_MIME): ImagePayload => {
  return getBase64Payload(imageData, fallbackMime);
};

const decodeBase64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const cleaned = sanitizeBase64(base64);
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(cleaned);
    const buffer = new ArrayBuffer(binary.length);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return buffer;
  }

  if (typeof globalThis.Buffer !== 'undefined') {
    const buffer = globalThis.Buffer.from(cleaned, 'base64');
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  }

  throw new Error('No base64 decoder available');
};

export const convertSavedImageDataToBlob = async (
  imageData: SavedImageData,
  fallbackMime = DEFAULT_MIME
): Promise<Blob> => {
  const mimeType = imageData.mimeType || fallbackMime;
  if (imageData.imageCanvas && typeof imageData.imageCanvas.toBlob === 'function') {
    return new Promise((resolve, reject) => {
      imageData.imageCanvas!.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas toBlob returned null'));
        }
      }, mimeType);
    });
  }

  const payload = getBase64Payload(imageData, fallbackMime);
  try {
    const response = await fetch(payload.dataUrl);
    return await response.blob();
  } catch (error) {
    const arrayBuffer = decodeBase64ToArrayBuffer(payload.base64);
    return new Blob([arrayBuffer], { type: payload.mimeType });
  }
};

export const base64ToBlob = (base64: string, mimeType = DEFAULT_MIME): Blob => {
  const arrayBuffer = decodeBase64ToArrayBuffer(base64);
  return new Blob([arrayBuffer], { type: mimeType });
};
