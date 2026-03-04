import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

const DEFAULT_SHARED_STORAGE_FOLDERS = ['books', 'galleries', 'wines', 'todos', 'databases'];

export const getSharedStorageDirectory = (): Directory => {
  const platform = Capacitor.getPlatform();
  if (platform === 'android') {
    return Directory.External;
  }
  if (platform === 'ios') {
    return Directory.Documents;
  }
  return Directory.Documents;
};

const normalizePath = (path: string) => path.replace(/^\/+|\/+$/g, '');

export const buildSharedStoragePath = (...segments: Array<string | undefined | null>): string => {
  const sanitizedSegments = segments
    .filter((segment): segment is string => Boolean(segment))
    .map(segment => normalizePath(segment!))
    .filter(Boolean);
  return sanitizedSegments.join('/');
};

export const getSharedStorageRelativePath = (uri?: string): string | null => {
  if (!uri) return null;
  const cleaned = uri.replace(/^file:\/\//i, '');
  const normalized = cleaned.replace(/\\/g, '/');
  for (const folder of DEFAULT_SHARED_STORAGE_FOLDERS) {
    const marker = `/${folder}/`;
    const idx = normalized.indexOf(marker);
    if (idx !== -1) {
      return normalized.substring(idx + 1);
    }
  }
  return null;
};

const ensureDirectory = async (directory: Directory, path: string) => {
  try {
    await Filesystem.mkdir({ directory, path, recursive: true });
  } catch (error) {
    const message = typeof error === 'object' && error ? (error as any).message ?? String(error) : String(error);
    if (message && message.toLowerCase().includes('already exists')) {
      return;
    }
    console.warn('Could not ensure shared storage directory', path, error);
  }
};

const directoryExists = async (directory: Directory, path: string): Promise<boolean> => {
  try {
    await Filesystem.stat({ directory, path });
    return true;
  } catch (error) {
    const message = typeof error === 'object' && error ? (error as any).message ?? String(error) : String(error);
    if (message.toLowerCase().includes('not found')) {
      return false;
    }
    return false;
  }
};

export const ensureDirectoryExists = async (directory: Directory, path: string): Promise<void> => {
  if (await directoryExists(directory, path)) return;
  await ensureDirectory(directory, path);
};

export const ensureSharedStorageFoldersExist = async (folders: Array<string> = DEFAULT_SHARED_STORAGE_FOLDERS): Promise<void> => {
  const directory = getSharedStorageDirectory();
  const normalizedFolders = Array.from(new Set(folders.filter(Boolean)));
  await Promise.all(normalizedFolders.map((folder) => ensureDirectory(directory, buildSharedStoragePath(folder))));
};

const sanitizeIdentifier = (value?: number | string): string => {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '');
};

const convertBlobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
};

const detectExtension = (mimeType?: string): string => {
  if (!mimeType) return 'jpg';
  const normalized = mimeType.toLowerCase().trim();
  if (!normalized.startsWith('image/')) return 'jpg';
  const candidate = normalized.replace('image/', '').replace(/[^a-z0-9]/g, '');
  if (!candidate) return 'jpg';
  if (candidate === 'jpeg' || candidate === 'pjpeg') return 'jpg';
  return candidate;
};

export interface SharedStorageWriteOptions {
  folder: string;
  prefix?: string;
  identifier?: number | string;
  extension?: string;
}

export const writeBlobToSharedStorage = async (blob: Blob, options: SharedStorageWriteOptions): Promise<string> => {
  const prefix = options.prefix ? sanitizeIdentifier(options.prefix) : 'file';
  const identifierPart = options.identifier ? `${sanitizeIdentifier(options.identifier)}_` : '';
  const extension = options.extension || detectExtension(blob.type);
  const fileName = `${prefix}_${identifierPart}${Date.now()}.${extension}`;
  const relativePath = buildSharedStoragePath(options.folder, fileName);
  const directory = getSharedStorageDirectory();

  await ensureDirectoryExists(directory, options.folder);
  const data = await convertBlobToBase64(blob);
  const result = await Filesystem.writeFile({
    directory,
    path: relativePath,
    data,
    recursive: true
  });

  return result.uri;
};
