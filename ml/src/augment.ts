import { readFile } from 'node:fs/promises';
import type { ManifestEntry, AugmentedImage } from './types.js';
import type { Transform } from './transforms.js';

/**
 * Generate augmented images for a class to reach the target count.
 * Distributes augmentation evenly across source images and transforms.
 * Deterministic — same inputs always produce the same filenames and transform selections.
 *
 * @param entries - Manifest entries for this class (source images)
 * @param augmentCount - Number of augmented images to generate
 * @param transforms - Available augmentation transforms
 * @param format - Output image format
 */
export async function augmentClass(
  entries: ManifestEntry[],
  augmentCount: number,
  transforms: Transform[],
  format: 'webp' | 'jpeg'
): Promise<{ images: AugmentedImage[]; warnings: string[] }> {
  if (augmentCount <= 0 || entries.length === 0 || transforms.length === 0) {
    return { images: [], warnings: [] };
  }

  // Pre-load all source buffers
  const sourceBuffers: Map<string, Buffer> = new Map();
  const loadWarnings: string[] = [];

  for (const entry of entries) {
    try {
      const buffer = await readFile(entry.photo_path);
      sourceBuffers.set(entry.photo_path, buffer);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      loadWarnings.push(`Failed to read ${entry.photo_path}: ${code ?? 'unknown error'}`);
    }
  }

  if (sourceBuffers.size === 0) {
    return {
      images: [],
      warnings: [...loadWarnings, 'No readable source images — skipping augmentation'],
    };
  }

  const sourceKeys = [...sourceBuffers.keys()];
  const images: AugmentedImage[] = [];
  const warnings = [...loadWarnings];
  const ext = format === 'jpeg' ? 'jpg' : 'webp';

  for (let i = 0; i < augmentCount; i++) {
    const sourceKey = sourceKeys[i % sourceKeys.length]!;
    const sourceBuffer = sourceBuffers.get(sourceKey)!;
    const transform = transforms[i % transforms.length]!;
    const filename = `aug-${i}-${transform.name}.${ext}`;

    try {
      const buffer = await transform.apply(sourceBuffer, format);
      images.push({ filename, buffer });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      warnings.push(`Augmentation failed for ${sourceKey} with ${transform.name}: ${msg}`);
    }
  }

  return { images, warnings };
}
