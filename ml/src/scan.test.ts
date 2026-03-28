import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { scanSourceDir } from './scan.js';

const testRoot = join(tmpdir(), `ml-scan-test-${randomUUID()}`);

/**
 * Build a realistic seed-images directory tree:
 *   testRoot/
 *     catalog/
 *       transformers/
 *         mmc/
 *           r-03-bovis/     (3 images)
 *           r-04-leo-dux/   (2 images)
 *         fanstoys/
 *           ft-04-scoria/   (1 image)
 *     training-only/
 *       transformers/
 *         mmc/
 *           r-03-bovis/     (2 images — merges with catalog tier)
 *     training-test/
 *       transformers/
 *         mmc/
 *           r-03-bovis/     (1 image — held-out test set)
 *           r-04-leo-dux/   (1 image)
 *     _unmatched/
 *       stray-file.jpg
 */
async function buildTree(): Promise<void> {
  const dirs = [
    'catalog/transformers/mmc/r-03-bovis',
    'catalog/transformers/mmc/r-04-leo-dux',
    'catalog/transformers/fanstoys/ft-04-scoria',
    'training-only/transformers/mmc/r-03-bovis',
    'training-test/transformers/mmc/r-03-bovis',
    'training-test/transformers/mmc/r-04-leo-dux',
    '_unmatched',
  ];

  for (const d of dirs) {
    await mkdir(join(testRoot, d), { recursive: true });
  }

  const files: [string, string][] = [
    ['catalog/transformers/mmc/r-03-bovis/r-03-bovis-1.jpeg', 'img1'],
    ['catalog/transformers/mmc/r-03-bovis/r-03-bovis-2.jpeg', 'img2'],
    ['catalog/transformers/mmc/r-03-bovis/r-03-bovis-3.jpeg', 'img3'],
    ['catalog/transformers/mmc/r-04-leo-dux/r-04-leo-dux-1.png', 'img4'],
    ['catalog/transformers/mmc/r-04-leo-dux/r-04-leo-dux-2.png', 'img5'],
    ['catalog/transformers/fanstoys/ft-04-scoria/ft-04-scoria-1.webp', 'img6'],
    ['training-only/transformers/mmc/r-03-bovis/r-03-bovis-4.jpeg', 'img7'],
    ['training-only/transformers/mmc/r-03-bovis/r-03-bovis-5.jpeg', 'img8'],
    ['training-test/transformers/mmc/r-03-bovis/r-03-bovis-test-1.jpeg', 'img9'],
    ['training-test/transformers/mmc/r-04-leo-dux/r-04-leo-dux-test-1.png', 'img10'],
    ['_unmatched/stray-file.jpg', 'stray'],
  ];

  for (const [path, content] of files) {
    await writeFile(join(testRoot, path), content);
  }
}

beforeAll(async () => {
  await buildTree();
});

afterAll(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

describe('scanSourceDir', () => {
  it('discovers images from both catalog and training-only tiers', async () => {
    const manifest = await scanSourceDir(testRoot);

    expect(manifest.version).toBe(1);
    expect(manifest.stats.total_photos).toBe(8);
    expect(manifest.stats.franchises).toBe(1);
    expect(manifest.stats.items).toBe(3);
  });

  it('merges same item across tiers into the same label', async () => {
    const manifest = await scanSourceDir(testRoot);

    const bovisEntries = manifest.entries.filter((e) => e.label === 'transformers/r-03-bovis');
    expect(bovisEntries).toHaveLength(5); // 3 catalog + 2 training-only
  });

  it('produces correct label format', async () => {
    const manifest = await scanSourceDir(testRoot);

    const labels = new Set(manifest.entries.map((e) => e.label));
    expect(labels).toEqual(
      new Set(['transformers/r-03-bovis', 'transformers/r-04-leo-dux', 'transformers/ft-04-scoria'])
    );
  });

  it('sets photo_path to absolute file paths', async () => {
    const manifest = await scanSourceDir(testRoot);

    for (const entry of manifest.entries) {
      expect(entry.photo_path).toContain(testRoot);
      expect(entry.photo_path).toMatch(/\.(jpeg|jpg|png|webp|heic)$/);
    }
  });

  it('populates franchise_slug and item_slug correctly', async () => {
    const manifest = await scanSourceDir(testRoot);

    const scoria = manifest.entries.find((e) => e.item_slug === 'ft-04-scoria');
    expect(scoria).toBeDefined();
    expect(scoria!.franchise_slug).toBe('transformers');
    expect(scoria!.item_name).toBe('ft-04-scoria');
  });

  it('skips _unmatched directories', async () => {
    const manifest = await scanSourceDir(testRoot);

    const stray = manifest.entries.find((e) => e.photo_path.includes('_unmatched'));
    expect(stray).toBeUndefined();
  });

  it('skips non-image files', async () => {
    // Add a non-image file to a valid item directory
    await writeFile(join(testRoot, 'catalog/transformers/mmc/r-03-bovis/notes.txt'), 'not an image');

    const manifest = await scanSourceDir(testRoot);

    const txtEntry = manifest.entries.find((e) => e.photo_path.endsWith('.txt'));
    expect(txtEntry).toBeUndefined();

    // Clean up
    const { rm: rmFile } = await import('node:fs/promises');
    await rmFile(join(testRoot, 'catalog/transformers/mmc/r-03-bovis/notes.txt'));
  });

  it('throws when no images are found', async () => {
    const emptyDir = join(testRoot, 'empty-root');
    await mkdir(emptyDir, { recursive: true });

    await expect(scanSourceDir(emptyDir)).rejects.toThrow('No images found');

    await rm(emptyDir, { recursive: true, force: true });
  });

  it('default mode excludes training-test tier', async () => {
    const manifest = await scanSourceDir(testRoot);

    const testEntries = manifest.entries.filter((e) => e.photo_path.includes('training-test'));
    expect(testEntries).toHaveLength(0);
    expect(manifest.stats.total_photos).toBe(8); // only catalog + training-only
  });

  it('testSet mode scans only training-test tier', async () => {
    const manifest = await scanSourceDir(testRoot, true);

    expect(manifest.stats.total_photos).toBe(2);
    expect(manifest.stats.items).toBe(2);
    expect(manifest.stats.franchises).toBe(1);

    const labels = new Set(manifest.entries.map((e) => e.label));
    expect(labels).toEqual(new Set(['transformers/r-03-bovis', 'transformers/r-04-leo-dux']));
  });

  it('testSet mode does not include catalog or training-only images', async () => {
    const manifest = await scanSourceDir(testRoot, true);

    for (const entry of manifest.entries) {
      expect(entry.photo_path).toContain('training-test');
      expect(entry.photo_path).not.toContain('catalog/');
      expect(entry.photo_path).not.toContain('training-only/');
    }
  });

  it('handles missing tiers gracefully', async () => {
    // A directory with only catalog/ (no training-only/) should still work
    const partialRoot = join(testRoot, 'partial');
    await mkdir(join(partialRoot, 'catalog/transformers/mmc/r-03-bovis'), { recursive: true });
    await writeFile(join(partialRoot, 'catalog/transformers/mmc/r-03-bovis/img.webp'), 'data');

    const manifest = await scanSourceDir(partialRoot);

    expect(manifest.stats.total_photos).toBe(1);
    expect(manifest.entries[0]!.label).toBe('transformers/r-03-bovis');

    await rm(partialRoot, { recursive: true, force: true });
  });
});
