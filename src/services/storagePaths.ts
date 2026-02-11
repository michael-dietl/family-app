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

export const buildSharedStoragePath = (...segments: Array<string | undefined | null>): string => {
  const sanitizedSegments = segments
    .filter((segment): segment is string => Boolean(segment))
    .map(segment => segment!.replace(/^\/+|\/+$/g, ''))
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

export const ensureDirectoryExists = async (directory: Directory, path: string): Promise<void> => {
  await ensureDirectory(directory, path);
};

export const ensureSharedStorageFoldersExist = async (folders: Array<string> = DEFAULT_SHARED_STORAGE_FOLDERS): Promise<void> => {
  const directory = getSharedStorageDirectory();
  const normalizedFolders = Array.from(new Set(folders.filter(Boolean)));
  await Promise.all(normalizedFolders.map((folder) => ensureDirectory(directory, buildSharedStoragePath(folder))));
};
