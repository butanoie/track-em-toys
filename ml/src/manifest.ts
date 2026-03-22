import { readFile } from 'node:fs/promises';
import type { Manifest, ManifestEntry } from './types.js';

const SUPPORTED_VERSION = 1;

/**
 * Read and validate a manifest JSON file produced by the ML export endpoint.
 *
 * @param manifestPath - Absolute path to the manifest JSON file
 */
export async function readManifest(manifestPath: string): Promise<Manifest> {
  let raw: string;
  try {
    raw = await readFile(manifestPath, 'utf-8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new Error(`Manifest file not found: ${manifestPath}`, { cause: err });
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`Manifest is not valid JSON: ${manifestPath}`);
  }

  const manifest = parsed as Record<string, unknown>;

  if (typeof manifest.version !== 'number' || manifest.version !== SUPPORTED_VERSION) {
    throw new Error(`Manifest version ${String(manifest.version)} is not supported (expected ${SUPPORTED_VERSION})`);
  }

  if (!Array.isArray(manifest.entries)) {
    throw new Error('Manifest is missing entries array');
  }

  if (manifest.entries.length === 0) {
    throw new Error('Manifest has no entries — nothing to export');
  }

  for (let i = 0; i < manifest.entries.length; i++) {
    const entry = manifest.entries[i] as Record<string, unknown>;
    if (typeof entry.photo_path !== 'string' || entry.photo_path.length === 0) {
      throw new Error(`Entry at index ${i} is missing photo_path`);
    }
    if (typeof entry.label !== 'string' || entry.label.length === 0) {
      throw new Error(`Entry at index ${i} is missing label`);
    }
  }

  return manifest as unknown as Manifest;
}

/**
 * Group manifest entries by their label.
 *
 * @param entries - Flat array of manifest entries
 */
export function groupEntriesByLabel(entries: ManifestEntry[]): Map<string, ManifestEntry[]> {
  const grouped = new Map<string, ManifestEntry[]>();
  for (const entry of entries) {
    const existing = grouped.get(entry.label);
    if (existing) {
      existing.push(entry);
    } else {
      grouped.set(entry.label, [entry]);
    }
  }
  return grouped;
}

/**
 * Convert a manifest label (franchise_slug/item_slug) to a flat directory name.
 * Create ML requires single-level directories — nested paths are not supported.
 *
 * @param label - Manifest label (e.g., "transformers/optimus-prime")
 */
export function flattenLabel(label: string): string {
  return label.replace(/\//g, '__');
}
