import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const SIZES = ['thumb', 'gallery', 'original'] as const;
export type PhotoSize = (typeof SIZES)[number];

/**
 * Build the directory path for an item's photos.
 *
 * @param storagePath - Root photo storage directory
 * @param itemId - Item UUID
 */
export function photoDir(storagePath: string, itemId: string): string {
  return join(storagePath, itemId);
}

/**
 * Build the full file path for a specific photo size variant.
 *
 * @param storagePath - Root photo storage directory
 * @param itemId - Item UUID
 * @param photoId - Photo UUID
 * @param size - Photo size variant (thumb, gallery, original)
 */
export function photoPath(storagePath: string, itemId: string, photoId: string, size: PhotoSize): string {
  return join(storagePath, itemId, `${photoId}-${size}.webp`);
}

/**
 * Build the relative URL stored in the database (gallery size).
 *
 * @param itemId - Item UUID
 * @param photoId - Photo UUID
 */
export function photoRelativeUrl(itemId: string, photoId: string): string {
  return `${itemId}/${photoId}-gallery.webp`;
}

/**
 * Create a directory (recursive), no-op if it already exists.
 *
 * @param dirPath - Directory path to create
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

/**
 * Write a photo buffer to disk.
 *
 * @param filePath - Destination file path
 * @param buffer - Image data to write
 */
export async function writePhoto(filePath: string, buffer: Buffer): Promise<void> {
  await writeFile(filePath, buffer);
}

/**
 * Delete all size variants for a photo. Swallows ENOENT (idempotent delete).
 *
 * @param storagePath - Root photo storage directory
 * @param itemId - Item UUID
 * @param photoId - Photo UUID
 */
export async function deletePhotoFiles(storagePath: string, itemId: string, photoId: string): Promise<void> {
  for (const size of SIZES) {
    const filePath = photoPath(storagePath, itemId, photoId, size);
    try {
      await unlink(filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}
