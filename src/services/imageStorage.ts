import { Capacitor } from '@capacitor/core';
import { Http } from '@capacitor/http';
import { Directory, Filesystem } from '@capacitor/filesystem';

const REMOTE_IMAGE_RE = /^https?:\/\//i;
const ensureHttpsScheme = (value: string): string => value.replace(/^http:\/\//i, 'https://');
const sanitizeIdentifier = (identifier: number | string): string => {
  const value = String(identifier ?? 'cover').trim();
  const sanitized = value.replace(/[^a-zA-Z0-9_\-]/g, '_');
  return sanitized || 'cover';
};

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.readAsDataURL(blob);
  });
};

export const isRemoteImageUrl = (value?: string): value is string => {
  return Boolean(value && REMOTE_IMAGE_RE.test(value));
};

export const COVER_BASE_PATH = 'books';
export const COVER_PREFIX = 'book_cover_';

export const findLocalCoverImage = async (bookId: number, extraIdentifiers: Array<number | string> = []): Promise<string | null> => {
  try {
    const directory = await Filesystem.readdir({
      directory: Directory.Data,
      path: COVER_BASE_PATH
    });

    const identifiers = [bookId, ...extraIdentifiers]
      .map((identifier) => sanitizeIdentifier(identifier));

    const entries = (directory.files ?? [])
      .map((entry) => (typeof entry === 'string' ? entry : (entry as any).name))
      .filter((fileName) => {
        if (!fileName) return false;
        return identifiers.some((id) => fileName.includes(`${COVER_PREFIX}${id}`));
      });

    if (entries.length === 0) return null;

    entries.sort();
    const latestFile = entries[entries.length - 1];
    const { uri } = await Filesystem.getUri({
      directory: Directory.Data,
      path: `${COVER_BASE_PATH}/${latestFile}`
    });

    return uri;
  } catch (error) {
    return null;
  }
};

const isNativePlatform = () => {
  const platform = Capacitor.getPlatform();
  return platform === 'android' || platform === 'ios';
};

const saveBlobAsCover = async (blob: Blob, fileName: string): Promise<string> => {
  const base64Data = await blobToBase64(blob);
  const savedFile = await Filesystem.writeFile({
    path: fileName,
    data: base64Data,
    directory: Directory.Data,
    recursive: true
  });
  console.log('remote cover filename: ', fileName);
  return savedFile.uri;
};

export const downloadRemoteCoverImage = async (url: string, identifier: number | string): Promise<string | null> => {
  console.log('remote cover url: ', url);
  if (!isRemoteImageUrl(url)) return null;

  const normalizedUrl = ensureHttpsScheme(url);
  const safeId = sanitizeIdentifier(identifier);
  const fileName = `${COVER_BASE_PATH}/${COVER_PREFIX}${safeId}_${Date.now()}.jpg`;

  try {
    if (isNativePlatform()) {
      try {
        const downloadResult = await Http.downloadFile({
          url: normalizedUrl,
          filePath: fileName,
          fileDirectory: Directory.Data
        });

        if (downloadResult.path) {
          const { uri } = await Filesystem.getUri({
            directory: Directory.Data,
            path: fileName
          });
          console.log('remote cover filename: ', fileName);
          return uri;
        }

        if (downloadResult.blob) {
          return await saveBlobAsCover(downloadResult.blob, fileName);
        }

        console.warn('Native HTTP plugin returned no file or blob for', normalizedUrl);
      } catch (pluginError) {
        console.warn('Native HTTP cover download failed, falling back to fetch', pluginError);
      }
    }

    const response = await fetch(normalizedUrl);
    if (!response.ok) {
      console.log('Cover download failed ', normalizedUrl);
      throw new Error(`Cover download failed (${response.status})`);
    }

    const blob = await response.blob();
    return await saveBlobAsCover(blob, fileName);
  } catch (error) {
    console.warn('Could not download cover image', { url: normalizedUrl, identifier, error });
    return null;
  }
};

export const normalizeRemoteCoverUrl = (value?: string): string | undefined => {
  if (!value) return undefined;
  return ensureHttpsScheme(value);
};
