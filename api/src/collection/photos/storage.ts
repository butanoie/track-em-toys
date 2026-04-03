import { rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { ensureDir, writePhoto } from '../../catalog/photos/storage.js';

export { ensureDir, writePhoto };

const SIZES = ['thumb', 'original'] as const;
export type PhotoSize = (typeof SIZES)[number];

/**
 * Build the directory path for a collection item's photos.
 *
 * Layout: PHOTO_STORAGE_PATH/collection/{userId}/{collectionItemId}/
 *
 * @param storagePath - Root photo storage directory
 * @param userId - User UUID
 * @param collectionItemId - Collection item UUID
 */
export function collectionPhotoDir(storagePath: string, userId: string, collectionItemId: string): string {
  return join(storagePath, 'collection', userId, collectionItemId);
}

/**
 * Build the full file path for a specific photo size variant.
 *
 * @param storagePath - Root photo storage directory
 * @param userId - User UUID
 * @param collectionItemId - Collection item UUID
 * @param photoId - Photo UUID
 * @param size - Photo size variant (thumb, original)
 */
export function collectionPhotoPath(
  storagePath: string,
  userId: string,
  collectionItemId: string,
  photoId: string,
  size: PhotoSize
): string {
  return join(storagePath, 'collection', userId, collectionItemId, `${photoId}-${size}.webp`);
}

/**
 * Build the relative URL stored in the database (original size).
 *
 * @param userId - User UUID
 * @param collectionItemId - Collection item UUID
 * @param photoId - Photo UUID
 */
export function collectionPhotoRelativeUrl(userId: string, collectionItemId: string, photoId: string): string {
  return `collection/${userId}/${collectionItemId}/${photoId}-original.webp`;
}

/**
 * Delete all size variants for a collection photo. Swallows ENOENT (idempotent).
 *
 * @param storagePath - Root photo storage directory
 * @param userId - User UUID
 * @param collectionItemId - Collection item UUID
 * @param photoId - Photo UUID
 */
export async function deleteCollectionPhotoFiles(
  storagePath: string,
  userId: string,
  collectionItemId: string,
  photoId: string
): Promise<void> {
  for (const size of SIZES) {
    const filePath = collectionPhotoPath(storagePath, userId, collectionItemId, photoId, size);
    try {
      await unlink(filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}

/**
 * Recursively delete a user's entire collection photo directory.
 * Used during GDPR purge after the DB transaction commits.
 * Swallows ENOENT (directory may not exist if user never uploaded photos).
 *
 * @param storagePath - Root photo storage directory
 * @param userId - User UUID
 */
export async function deleteUserPhotoDirectory(storagePath: string, userId: string): Promise<void> {
  const dirPath = join(storagePath, 'collection', userId);
  await rm(dirPath, { recursive: true, force: true });
}
