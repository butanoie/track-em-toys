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
 *     catalog/                     (excluded from ML training — product gallery only)
 *       transformers/
 *         mmc/
 *           r-03-bovis/     (3 images)
 *         fanstoys/
 *           ft-04-scoria/   (1 image)
 *     training-primary/
 *       transformers/
 *         mmc/
 *           r-03-bovis/     (3 images)
 *           r-04-leo-dux/   (2 images)
 *         fanstoys/
 *           ft-04-scoria/   (1 image)
 *     training-secondary/
 *       transformers/
 *         mmc/
 *           r-03-bovis/     (1 image)
 *     test-primary/
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
    'catalog/transformers/fanstoys/ft-04-scoria',
    'training-primary/transformers/mmc/r-03-bovis',
    'training-primary/transformers/mmc/r-04-leo-dux',
    'training-primary/transformers/fanstoys/ft-04-scoria',
    'training-secondary/transformers/mmc/r-03-bovis',
    'test-primary/transformers/mmc/r-03-bovis',
    'test-primary/transformers/mmc/r-04-leo-dux',
    '_unmatched',
  ];

  for (const d of dirs) {
    await mkdir(join(testRoot, d), { recursive: true });
  }

  const files: [string, string][] = [
    // catalog/ — excluded from ML training
    ['catalog/transformers/mmc/r-03-bovis/r-03-bovis-1.jpeg', 'cat1'],
    ['catalog/transformers/mmc/r-03-bovis/r-03-bovis-2.jpeg', 'cat2'],
    ['catalog/transformers/mmc/r-03-bovis/r-03-bovis-3.jpeg', 'cat3'],
    ['catalog/transformers/fanstoys/ft-04-scoria/ft-04-scoria-1.webp', 'cat4'],
    // training-primary/
    ['training-primary/transformers/mmc/r-03-bovis/r-03-bovis-t1.jpeg', 'img1'],
    ['training-primary/transformers/mmc/r-03-bovis/r-03-bovis-t2.jpeg', 'img2'],
    ['training-primary/transformers/mmc/r-03-bovis/r-03-bovis-t3.jpeg', 'img3'],
    ['training-primary/transformers/mmc/r-04-leo-dux/r-04-leo-dux-t1.png', 'img4'],
    ['training-primary/transformers/mmc/r-04-leo-dux/r-04-leo-dux-t2.png', 'img5'],
    ['training-primary/transformers/fanstoys/ft-04-scoria/ft-04-scoria-t1.webp', 'img6'],
    // training-secondary/
    ['training-secondary/transformers/mmc/r-03-bovis/r-03-bovis-t4.jpeg', 'img7'],
    // test-primary/
    ['test-primary/transformers/mmc/r-03-bovis/r-03-bovis-test-1.jpeg', 'img9'],
    ['test-primary/transformers/mmc/r-04-leo-dux/r-04-leo-dux-test-1.png', 'img10'],
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
  it('discovers images from training tiers only (excludes catalog)', async () => {
    const manifest = await scanSourceDir(testRoot);

    expect(manifest.version).toBe(1);
    expect(manifest.stats.total_photos).toBe(7); // 6 training-primary + 1 training-secondary
    expect(manifest.stats.franchises).toBe(1);
    expect(manifest.stats.items).toBe(3);

    // Verify no catalog images
    const catalogEntries = manifest.entries.filter((e) => e.photo_path.includes('/catalog/'));
    expect(catalogEntries).toHaveLength(0);
  });

  it('merges same item across training tiers into the same label', async () => {
    const manifest = await scanSourceDir(testRoot);

    const bovisEntries = manifest.entries.filter((e) => e.label === 'transformers/r-03-bovis');
    expect(bovisEntries).toHaveLength(4); // 3 training-primary + 1 training-secondary
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
    await writeFile(join(testRoot, 'training-primary/transformers/mmc/r-03-bovis/notes.txt'), 'not an image');

    const manifest = await scanSourceDir(testRoot);

    const txtEntry = manifest.entries.find((e) => e.photo_path.endsWith('.txt'));
    expect(txtEntry).toBeUndefined();

    // Clean up
    const { rm: rmFile } = await import('node:fs/promises');
    await rmFile(join(testRoot, 'training-primary/transformers/mmc/r-03-bovis/notes.txt'));
  });

  it('throws when no images are found', async () => {
    const emptyDir = join(testRoot, 'empty-root');
    await mkdir(emptyDir, { recursive: true });

    await expect(scanSourceDir(emptyDir)).rejects.toThrow('No images found');

    await rm(emptyDir, { recursive: true, force: true });
  });

  it('default mode excludes test and catalog tiers', async () => {
    const manifest = await scanSourceDir(testRoot);

    const testEntries = manifest.entries.filter((e) => e.photo_path.includes('test-primary'));
    expect(testEntries).toHaveLength(0);
    const catalogEntries = manifest.entries.filter((e) => e.photo_path.includes('/catalog/'));
    expect(catalogEntries).toHaveLength(0);
    expect(manifest.stats.total_photos).toBe(7); // only training tiers
  });

  it('testSet mode scans only test tiers', async () => {
    const manifest = await scanSourceDir(testRoot, { testSet: true });

    expect(manifest.stats.total_photos).toBe(2);
    expect(manifest.stats.items).toBe(2);
    expect(manifest.stats.franchises).toBe(1);

    const labels = new Set(manifest.entries.map((e) => e.label));
    expect(labels).toEqual(new Set(['transformers/r-03-bovis', 'transformers/r-04-leo-dux']));
  });

  it('testSet mode does not include catalog or training images', async () => {
    const manifest = await scanSourceDir(testRoot, { testSet: true });

    for (const entry of manifest.entries) {
      expect(entry.photo_path).toContain('test-');
      expect(entry.photo_path).not.toContain('/catalog/');
      expect(entry.photo_path).not.toContain('training-');
    }
  });

  it('populates category from tier name', async () => {
    const manifest = await scanSourceDir(testRoot);

    const categories = new Set(manifest.entries.map((e) => e.category));
    expect(categories).toEqual(new Set(['primary', 'secondary']));
  });

  it('category filter scans only the matching tier', async () => {
    const manifest = await scanSourceDir(testRoot, { category: 'primary' });

    expect(manifest.stats.total_photos).toBe(6); // only training-primary
    const categories = new Set(manifest.entries.map((e) => e.category));
    expect(categories).toEqual(new Set(['primary']));

    // No secondary images
    const secondary = manifest.entries.filter((e) => e.photo_path.includes('training-secondary'));
    expect(secondary).toHaveLength(0);
  });

  it('category filter works with testSet', async () => {
    const manifest = await scanSourceDir(testRoot, { testSet: true, category: 'primary' });

    expect(manifest.stats.total_photos).toBe(2); // only test-primary
    for (const entry of manifest.entries) {
      expect(entry.photo_path).toContain('test-primary');
    }
  });

  it('category filter with no matching images throws', async () => {
    // No 'package' tier exists in the test tree
    await expect(scanSourceDir(testRoot, { category: 'package' })).rejects.toThrow('No images found');
  });

  it('handles missing tiers gracefully', async () => {
    // A directory with only training-primary/ (no other tiers) should still work
    const partialRoot = join(testRoot, 'partial');
    await mkdir(join(partialRoot, 'training-primary/transformers/mmc/r-03-bovis'), { recursive: true });
    await writeFile(join(partialRoot, 'training-primary/transformers/mmc/r-03-bovis/img.webp'), 'data');

    const manifest = await scanSourceDir(partialRoot);

    expect(manifest.stats.total_photos).toBe(1);
    expect(manifest.entries[0]!.label).toBe('transformers/r-03-bovis');

    await rm(partialRoot, { recursive: true, force: true });
  });
});
