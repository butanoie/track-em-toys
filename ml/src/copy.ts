import { mkdir, copyFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join, basename } from 'node:path';
import type { ManifestEntry, AugmentedImage, CopyResult, CopyError } from './types.js';
import { flattenLabel } from './manifest.js';

/**
 * Create the root output directory if it doesn't exist.
 *
 * @param outputDir - Absolute path to the output directory
 */
export async function prepareOutputDir(outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true });
}

/**
 * Clean all files from a class directory to prevent orphans on re-run.
 * Creates the directory if it doesn't exist.
 *
 * @param classDir - Absolute path to the class directory
 */
export async function cleanClassDir(classDir: string): Promise<void> {
  try {
    const files = await readdir(classDir);
    await Promise.all(files.map((f) => rm(join(classDir, f), { recursive: true, force: true })));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  await mkdir(classDir, { recursive: true });
}

/**
 * Copy source photos and write augmented images into a class directory.
 *
 * @param label - Manifest label (e.g., "transformers/optimus-prime")
 * @param entries - Manifest entries for this class
 * @param augmented - Augmented image buffers with filenames
 * @param outputDir - Root output directory
 * @param noClean - If true, skip cleaning the class directory
 */
export async function copyClass(
  label: string,
  entries: ManifestEntry[],
  augmented: AugmentedImage[],
  outputDir: string,
  noClean: boolean
): Promise<CopyResult> {
  const flatLabel = flattenLabel(label);
  const classDir = join(outputDir, flatLabel);

  if (noClean) {
    await mkdir(classDir, { recursive: true });
  } else {
    await cleanClassDir(classDir);
  }

  let originalsWritten = 0;
  let augmentedWritten = 0;
  let skipped = 0;
  const errors: CopyError[] = [];

  // Copy originals
  for (const entry of entries) {
    const destFilename = basename(entry.photo_path);
    const destPath = join(classDir, destFilename);

    try {
      await copyFile(entry.photo_path, destPath);
      originalsWritten++;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        errors.push({ photo_path: entry.photo_path, reason: 'Source file not found' });
        skipped++;
      } else {
        throw err;
      }
    }
  }

  // Write augmented images
  for (const aug of augmented) {
    const destPath = join(classDir, aug.filename);
    try {
      await writeFile(destPath, aug.buffer);
      augmentedWritten++;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      errors.push({ photo_path: aug.filename, reason: `Augmented write failed: ${code ?? 'unknown'}` });
      skipped++;
    }
  }

  return { originalsWritten, augmentedWritten, skipped, errors };
}
