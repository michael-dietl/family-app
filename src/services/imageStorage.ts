import { Capacitor } from '@capacitor/core';
import { buildSharedStoragePath, getSharedStorageDirectory } from '@/services/storagePaths';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { CoverService } from '@/services/CoverService';

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

const isNativePlatform = () => {
  const platform = Capacitor.getPlatform();
  return platform === 'android' || platform === 'ios';
};

const saveBlobAsCover = async (blob: Blob, relativePath: string): Promise<string> => {
  const base64Data = await blobToBase64(blob);
  try {
    await Filesystem.mkdir({
      directory: getSharedStorageDirectory(),
      path: buildSharedStoragePath(COVER_BASE_PATH),
      recursive: true
    });
  } catch (e) {
    console.log('Directory already exists or created');
  }
  const savedFile = await Filesystem.writeFile({
    path: relativePath,
    data: base64Data,
    directory: getSharedStorageDirectory(),
    recursive: true
  });
  console.log('remote cover filename: ', relativePath);
  return savedFile.uri;
};

export const downloadRemoteCoverImage = async (url: string, identifier: number | string): Promise<string | null> => {
  console.log('downloadRemoteCoverImage called with', { url, identifier });
  const normalizedUrl = normalizeRemoteCoverUrl(url);
  if (!normalizedUrl) {
    console.warn('downloadRemoteCoverImage: could not normalize URL', { url });
    return null;
  }
  console.log('remote cover url: ', normalizedUrl);
  const safeId = sanitizeIdentifier(identifier);
  const relativeFilePath = getSharedStorageDirectory() + `/books/` + `${COVER_PREFIX}${safeId}_${Date.now()}.jpg`
  //buildSharedStoragePath(COVER_BASE_PATH, `${COVER_PREFIX}${safeId}_${Date.now()}.jpg`);
  console.log("Relative Path - " + relativeFilePath);

  try {
    await Filesystem.mkdir({
        directory: getSharedStorageDirectory(),
        path: buildSharedStoragePath(COVER_BASE_PATH),
        recursive: true
      });
  } catch (e) {
    console.log('Directory already exists or created');
  }

  try {
    if (isNativePlatform()) {
      try {
        //downloadGoogleBooksCover(normalizedUrl);
        const f = `${COVER_PREFIX}${safeId}_${Date.now()}.jpg`;

        const coverService = new CoverService();

        const url = await coverService.getCover(String(identifier));

        // im UI anzeigen
        console.log('HTTP' + url);

        //await wgetCover(normalizedUrl, f);

        /*
        const downloadResult = await Http.downloadFile({
          headers: { 'User-Agent': 'Mozilla/5.0' },
          url: normalizedUrl,
          filePath: relativeFilePath,
          fileDirectory: buildSharedStoragePath(COVER_BASE_PATH, "")
        });

        if (downloadResult.path) {
          const { uri } = await Filesystem.getUri({
            directory: getSharedStorageDirectory(),
            path: relativeFilePath
          });
          console.log('remote cover filename: ', relativeFilePath);
          return uri;
        }

        if (downloadResult.blob) {
          return await saveBlobAsCover(downloadResult.blob, relativeFilePath);
        }
*/
        console.warn('Native HTTP plugin returned no file or blob for', normalizedUrl);
      } catch (pluginError) {
        console.warn('Native HTTP cover download failed, falling back to fetch', pluginError);
      }
    }

    return null;
  }

  catch (error) {
    console.error('Failed to download remote cover image:', error);
    return null;        
  }

 async function loadCover(isbn: string): Promise<Blob> {
  const url = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Cover not found");
  }

  return await response.blob();
}

async function saveCoverToDisk(isbn: string, blob: Blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
  );

  await Filesystem.writeFile({
    path: `covers/${isbn}.jpg`,
    data: base64,
    directory: Directory.Data,
  });
}        

};  
