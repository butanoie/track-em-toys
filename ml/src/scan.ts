import { readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import type { Manifest, ManifestEntry } from './types.js';

const IMAGE_EXTENSIONS = new Set(['.webp', '.jpg', '.jpeg', '.png', '.heic']);
const TRAINING_TIERS = ['catalog', 'training-only'] as const;
const TEST_TIERS = ['training-test'] as const;
const SKIP_DIRS = new Set(['_unmatched', '.DS_Store']);

/**
 * Scan a seed-images directory tree and produce a Manifest compatible with the
 * existing prepare-data pipeline.
 *
 * Expected structure:
 *   {sourceDir}/{tier}/{franchise}/{manufacturer}/{item}/{image-files}
 *
 * By default, scans "catalog" and "training-only" tiers and merges them.
 * When `testSet` is true, scans only the "training-test" tier (held-out evaluation data).
 *
 * Directories named "_unmatched" are skipped at any level.
 *
 * @param sourceDir - Root directory (e.g., /Volumes/WD 6TB/track-em-toys/test-images)
 * @param testSet - If true, scan only the "training-test" tier
 */
export async function scanSourceDir(sourceDir: string, testSet = false): Promise<Manifest> {
  const entries: ManifestEntry[] = [];
  const franchises = new Set<string>();
  const items = new Set<string>();

  const tiers = testSet ? TEST_TIERS : TRAINING_TIERS;

  for (const tier of tiers) {
    const tierPath = join(sourceDir, tier);

    let franchiseDirs: string[];
    try {
      franchiseDirs = await readdir(tierPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }

    for (const franchise of franchiseDirs) {
      if (SKIP_DIRS.has(franchise)) continue;
      const franchisePath = join(tierPath, franchise);
      if (!(await isDirectory(franchisePath))) continue;

      const manufacturerDirs = await readdir(franchisePath);

      for (const manufacturer of manufacturerDirs) {
        if (SKIP_DIRS.has(manufacturer)) continue;
        const manufacturerPath = join(franchisePath, manufacturer);
        if (!(await isDirectory(manufacturerPath))) continue;

        const itemDirs = await readdir(manufacturerPath);

        for (const item of itemDirs) {
          if (SKIP_DIRS.has(item)) continue;
          const itemPath = join(manufacturerPath, item);
          if (!(await isDirectory(itemPath))) continue;

          const files = await readdir(itemPath);
          const imageFiles = files.filter((f) => {
            const ext = extname(f).toLowerCase();
            return IMAGE_EXTENSIONS.has(ext);
          });

          for (const file of imageFiles) {
            const label = `${franchise}/${item}`;
            entries.push({
              photo_path: join(itemPath, file),
              label,
              item_name: item,
              franchise_slug: franchise,
              item_slug: item,
            });
          }

          if (imageFiles.length > 0) {
            franchises.add(franchise);
            items.add(`${franchise}/${item}`);
          }
        }
      }
    }
  }

  if (entries.length === 0) {
    throw new Error(`No images found in source directory: ${sourceDir}`);
  }

  return {
    version: 1,
    exported_at: new Date().toISOString(),
    stats: {
      total_photos: entries.length,
      items: items.size,
      franchises: franchises.size,
      low_photo_items: 0, // computed by balance analysis downstream
    },
    entries,
    warnings: [],
  };
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}
