import { db } from '@/services/database';
import { writeBlobToSharedStorage } from '@/services/storagePaths';

const COVER_PREFIX = 'edited_cover';

export const storeEditedBookCover = async (bookId: number, blob: Blob): Promise<string> => {
  if (!Number.isFinite(bookId) || bookId <= 0) {
    throw new Error('Invalid book id');
  }

  const normalizedBookId = Math.abs(Math.trunc(bookId));
  const uri = await writeBlobToSharedStorage(blob, {
    folder: 'books',
    prefix: COVER_PREFIX,
    identifier: normalizedBookId
  });

  await db.updateBook(normalizedBookId, { coverImage: uri });
  return uri;
};