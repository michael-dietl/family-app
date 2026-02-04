import { Directory, Filesystem } from '@capacitor/filesystem';

const REMOTE_IMAGE_RE = /^https?:\/\//i;

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

export const findLocalCoverImage = async (bookId: number): Promise<string | null> => {
  try {
    const directory = await Filesystem.readdir({
      directory: Directory.Data,
      path: COVER_BASE_PATH
    });

    const entries = (directory.files ?? [])
      .map((entry) => (typeof entry === 'string' ? entry : (entry as any).name))
      .filter((fileName) => fileName && fileName.includes(`book_cover_${bookId}`));

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

export const downloadRemoteCoverImage = async (url: string, bookId: number): Promise<string | null> => {
  if (!isRemoteImageUrl(url)) return null;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Cover download failed (${response.status})`);
    }

    const blob = await response.blob();
    const base64Data = await blobToBase64(blob);
    const fileName = `books/book_cover_${bookId}_${Date.now()}.jpg`;

    const savedFile = await Filesystem.writeFile({
      path: fileName,
      data: base64Data,
      directory: Directory.Data,
      recursive: true
    });

    return savedFile.uri;
  } catch (error) {
    console.warn('Could not download cover image', { url, bookId, error });
    return null;
  }
};
