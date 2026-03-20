import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const SIZES = ['thumb', 'gallery', 'original'] as const;
export type PhotoSize = (typeof SIZES)[number];

export function photoDir(storagePath: string, itemId: string): string {
  return join(storagePath, itemId);
}

export function photoPath(storagePath: string, itemId: string, photoId: string, size: PhotoSize): string {
  return join(storagePath, itemId, `${photoId}-${size}.webp`);
}

/** Build the relative URL stored in the database (gallery size). */
export function photoRelativeUrl(itemId: string, photoId: string): string {
  return `${itemId}/${photoId}-gallery.webp`;
}

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function writePhoto(filePath: string, buffer: Buffer): Promise<void> {
  await writeFile(filePath, buffer);
}

/** Delete all size variants for a photo. Swallows ENOENT (idempotent delete). */
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
