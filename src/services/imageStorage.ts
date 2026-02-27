import { buildSharedStoragePath, ensureDirectoryExists, getSharedStorageDirectory, getSharedStorageRelativePath } from '@/services/storagePaths';
import { Filesystem } from '@capacitor/filesystem';

const REMOTE_IMAGE_RE = /^(?:https?:)?\/\//i;
const ensureHttpsScheme = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
};
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

const isRemoteCandidate = (value?: string): value is string => {
  if (!value) return false;
  return REMOTE_IMAGE_RE.test(value.trim());
};

export const isRemoteImageUrl = (value?: string): value is string => {
  return isRemoteCandidate(value);
};

export const normalizeRemoteCoverUrl = (value?: string): string | undefined => {
  if (!isRemoteCandidate(value)) return undefined;
  return ensureHttpsScheme(value!.trim());
};

export const COVER_BASE_PATH = 'books';
export const COVER_PREFIX = 'book_cover_';

const detectMimeTypeFromPath = (path?: string): string => {
  if (!path) return 'image/jpeg';
  const normalized = path.toLowerCase();
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.gif')) return 'image/gif';
  if (normalized.endsWith('.bmp')) return 'image/bmp';
  return 'image/jpeg';
};

export const readSharedStorageFileAsDataUrl = async (nativePath?: string): Promise<string | null> => {
  if (!nativePath || !nativePath.startsWith('file://')) return null;
  const relativePath = getSharedStorageRelativePath(nativePath);
  if (!relativePath) return null;

  try {
    const file = await Filesystem.readFile({
      directory: getSharedStorageDirectory(),
      path: relativePath
    });
    if (!file.data) return null;
    const mimeType = detectMimeTypeFromPath(relativePath);
    return `data:${mimeType};base64,${file.data}`;
  } catch (error) {
    console.warn('Could not read shared storage file for editor preview', nativePath, error);
    return null;
  }
};

export const findLocalCoverImage = async (bookId: number, extraIdentifiers: Array<number | string> = []): Promise<string | null> => {
  try {
    const directory = await Filesystem.readdir({
      directory: getSharedStorageDirectory(),
      path: buildSharedStoragePath(COVER_BASE_PATH)
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
    const relativeLatestPath = buildSharedStoragePath(COVER_BASE_PATH, latestFile);
    const { uri } = await Filesystem.getUri({
      directory: getSharedStorageDirectory(),
      path: relativeLatestPath
    });

    return uri;
  } catch (error) {
    return null;
  }
};

export const downloadRemoteCoverImage = async (url: string, identifier: number | string): Promise<string | null> => {
  const normalizedUrl = normalizeRemoteCoverUrl(url);
  if (!normalizedUrl) {
    console.warn('downloadRemoteCoverImage: could not normalize URL', { url });
    return null;
  }
  const safeId = sanitizeIdentifier(identifier);

  try {
    const response = await fetch(normalizedUrl, { redirect: 'follow' });
    if (!response.ok) {
      console.warn('downloadRemoteCoverImage: HTTP error', response.status, normalizedUrl);
      return null;
    }

    const contentType = response.headers.get('Content-Type') || '';
    if (!contentType.startsWith('image/')) {
      console.warn('downloadRemoteCoverImage: response is not an image', { contentType, url: normalizedUrl });
      return null;
    }

    const blob = await response.blob();
    if (!blob || blob.size === 0) {
      console.warn('downloadRemoteCoverImage: downloaded image is empty', normalizedUrl);
      return null;
    }

    const base64Data = await blobToBase64(blob);
    const fileName = `${COVER_PREFIX}${safeId}_${Date.now()}.jpg`;
    const relativePath = buildSharedStoragePath(COVER_BASE_PATH, fileName);
    const directory = getSharedStorageDirectory();
    await ensureDirectoryExists(directory, COVER_BASE_PATH);

    const result = await Filesystem.writeFile({
      path: relativePath,
      data: base64Data,
      directory,
      recursive: true
    });

    return result.uri;
  } catch (error) {
    console.error('Failed to download remote cover image:', error);
    return null;
  }
};
