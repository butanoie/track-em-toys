import { readdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { ValidationResult } from './types.js';

const IMAGE_EXTENSIONS = new Set(['.webp', '.jpg', '.jpeg', '.png', '.heic']);
const MIN_IMAGES_PER_CLASS = 10;

/**
 * Validate that the output directory matches Create ML's expected folder-per-class structure.
 * Each subdirectory is a class containing only image files. No nesting beyond one level.
 *
 * @param outputDir - Absolute path to the output directory
 * @param expectedLabels - Flat labels expected from the manifest
 */
export async function validateOutputStructure(outputDir: string, expectedLabels: string[]): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const classStats = new Map<string, number>();

  let topEntries: string[];
  try {
    topEntries = await readdir(outputDir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return { valid: false, errors: [`Output directory does not exist: ${outputDir}`], warnings, classStats };
    }
    throw err;
  }

  const expectedSet = new Set(expectedLabels);
  const foundSet = new Set<string>();

  for (const entry of topEntries) {
    const entryPath = join(outputDir, entry);
    const entryStat = await stat(entryPath);

    if (!entryStat.isDirectory()) {
      if (entry !== '.DS_Store') {
        warnings.push(`Unexpected file at output root: ${entry}`);
      }
      continue;
    }

    foundSet.add(entry);

    // Check directory contents — single pass
    const files = await readdir(entryPath);
    const imageFiles: string[] = [];
    const nonImageFiles: string[] = [];

    for (const f of files) {
      if (f === '.DS_Store') continue;
      const ext = extname(f).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext)) {
        imageFiles.push(f);
      } else {
        nonImageFiles.push(f);
      }
    }

    if (nonImageFiles.length > 0) {
      warnings.push(`Non-image files in class "${entry}": ${nonImageFiles.join(', ')}`);
    }

    if (imageFiles.length === 0) {
      errors.push(`Class directory "${entry}" contains no images`);
    } else if (imageFiles.length < MIN_IMAGES_PER_CLASS) {
      errors.push(
        `Class "${entry}" has ${imageFiles.length} images (minimum ${MIN_IMAGES_PER_CLASS} required for Create ML)`
      );
    }

    classStats.set(entry, imageFiles.length);

    if (!expectedSet.has(entry)) {
      warnings.push(`Unexpected class directory not in manifest: ${entry}`);
    }
  }

  // Check for missing expected classes
  for (const label of expectedLabels) {
    if (!foundSet.has(label)) {
      errors.push(`Expected class directory missing: ${label}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings, classStats };
}
