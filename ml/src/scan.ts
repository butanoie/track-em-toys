import { readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import type { ImageCategory, Manifest, ManifestEntry } from './types.js';

const IMAGE_EXTENSIONS = new Set(['.webp', '.jpg', '.jpeg', '.png', '.heic']);
// Canonical tier list in track-em-toys-data/lib/tiers.ts — keep in sync
// Note: catalog/ is excluded — it's for the product gallery DB, not ML training.
// Use C-Copy in the review tool to copy catalog images into training tiers if needed.
const TRAINING_TIERS = ['training-primary', 'training-secondary', 'training-package', 'training-accessories'] as const;
const TEST_TIERS = ['test-primary', 'test-secondary', 'test-package', 'test-accessories'] as const;
const SKIP_DIRS = new Set(['_unmatched', '.DS_Store']);

export interface ScanOptions {
  /** Scan only held-out test tiers instead of training tiers. */
  testSet?: boolean;
  /** Filter to a single image category (e.g., 'primary'). Only scans the matching tier. */
  category?: ImageCategory;
}

/**
 * Scan a seed-images directory tree and produce a Manifest compatible with the
 * existing prepare-data pipeline.
 *
 * Expected structure:
 *   {sourceDir}/{tier}/{franchise}/{manufacturer}/{item}/{image-files}
 *
 * By default, scans all training tiers (training-primary, training-secondary,
 * training-package, training-accessories) and merges them.
 * When `testSet` is true, scans only the test tiers (held-out evaluation data).
 * When `category` is set, scans only the matching tier (e.g., 'primary' → 'training-primary').
 * Note: catalog/ tier is excluded — it feeds the product gallery DB, not ML training.
 *
 * Directories named "_unmatched" are skipped at any level.
 *
 * @param sourceDir - Root directory (e.g., /Volumes/WD 6TB/track-em-toys/test-images)
 * @param options - Scan options (testSet, category)
 */
export async function scanSourceDir(sourceDir: string, options: ScanOptions = {}): Promise<Manifest> {
  const entries: ManifestEntry[] = [];
  const franchises = new Set<string>();
  const items = new Set<string>();

  const allTiers = options.testSet ? TEST_TIERS : TRAINING_TIERS;
  const tiers = options.category ? allTiers.filter((t) => t.endsWith(`-${options.category}`)) : allTiers;

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

          // Derive category from tier name (e.g., 'training-primary' → 'primary')
          const category =
            tier.indexOf('-') >= 0 ? (tier.slice(tier.indexOf('-') + 1) as ManifestEntry['category']) : undefined;

          for (const file of imageFiles) {
            const label = `${franchise}/${item}`;
            entries.push({
              photo_path: join(itemPath, file),
              label,
              item_name: item,
              franchise_slug: franchise,
              item_slug: item,
              category,
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
