import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { augmentClass } from './augment.js';
import type { ManifestEntry } from './types.js';
import type { Transform } from './transforms.js';

const testDir = join(tmpdir(), `ml-augment-test-${randomUUID()}`);
let testImageBuffer: Buffer;

const mockTransform: Transform = {
  name: 'mock-flip',
  apply: async (input, format) => {
    const pipeline = sharp(input).flop();
    if (format === 'jpeg') return pipeline.jpeg().toBuffer();
    return pipeline.webp().toBuffer();
  },
};

const mockTransform2: Transform = {
  name: 'mock-bright',
  apply: async (input, format) => {
    const pipeline = sharp(input).modulate({ brightness: 1.1 });
    if (format === 'jpeg') return pipeline.jpeg().toBuffer();
    return pipeline.webp().toBuffer();
  },
};

function makeEntry(photoPath: string): ManifestEntry {
  return {
    photo_path: photoPath,
    label: 'transformers/test-item',
    item_name: 'Test Item',
    franchise_slug: 'transformers',
    item_slug: 'test-item',
  };
}

beforeAll(async () => {
  await mkdir(testDir, { recursive: true });

  testImageBuffer = await sharp({
    create: { width: 20, height: 20, channels: 3, background: { r: 100, g: 100, b: 100 } },
  })
    .webp({ quality: 85 })
    .toBuffer();

  // Write test source images
  await writeFile(join(testDir, 'photo1.webp'), testImageBuffer);
  await writeFile(join(testDir, 'photo2.webp'), testImageBuffer);
  await writeFile(join(testDir, 'photo3.webp'), testImageBuffer);
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe('augmentClass', () => {
  it('produces the correct number of augmented images', async () => {
    const entries = [makeEntry(join(testDir, 'photo1.webp')), makeEntry(join(testDir, 'photo2.webp'))];

    const { images, warnings } = await augmentClass(entries, 5, [mockTransform, mockTransform2], 'webp');

    expect(images).toHaveLength(5);
    expect(warnings).toHaveLength(0);
  });

  it('returns empty for augmentCount 0', async () => {
    const entries = [makeEntry(join(testDir, 'photo1.webp'))];

    const { images } = await augmentClass(entries, 0, [mockTransform], 'webp');

    expect(images).toHaveLength(0);
  });

  it('returns empty for empty entries', async () => {
    const { images } = await augmentClass([], 10, [mockTransform], 'webp');

    expect(images).toHaveLength(0);
  });

  it('returns empty for empty transforms', async () => {
    const entries = [makeEntry(join(testDir, 'photo1.webp'))];

    const { images } = await augmentClass(entries, 10, [], 'webp');

    expect(images).toHaveLength(0);
  });

  it('generates deterministic filenames with aug- prefix', async () => {
    const entries = [makeEntry(join(testDir, 'photo1.webp'))];

    const { images } = await augmentClass(entries, 3, [mockTransform, mockTransform2], 'webp');

    expect(images[0]?.filename).toBe('aug-0-mock-flip.webp');
    expect(images[1]?.filename).toBe('aug-1-mock-bright.webp');
    expect(images[2]?.filename).toBe('aug-2-mock-flip.webp');
  });

  it('generates jpeg filenames when format is jpeg', async () => {
    const entries = [makeEntry(join(testDir, 'photo1.webp'))];

    const { images } = await augmentClass(entries, 1, [mockTransform], 'jpeg');

    expect(images[0]?.filename).toBe('aug-0-mock-flip.jpg');
  });

  it('distributes across sources and transforms evenly', async () => {
    const entries = [
      makeEntry(join(testDir, 'photo1.webp')),
      makeEntry(join(testDir, 'photo2.webp')),
      makeEntry(join(testDir, 'photo3.webp')),
    ];

    const { images } = await augmentClass(entries, 6, [mockTransform, mockTransform2], 'webp');

    expect(images).toHaveLength(6);
    // Transform cycling: 0=flip, 1=bright, 2=flip, 3=bright, 4=flip, 5=bright
    expect(images[0]?.filename).toContain('mock-flip');
    expect(images[1]?.filename).toContain('mock-bright');
    expect(images[2]?.filename).toContain('mock-flip');
  });

  it('warns and skips when source file is missing', async () => {
    const entries = [makeEntry(join(testDir, 'photo1.webp')), makeEntry(join(testDir, 'nonexistent.webp'))];

    const { images, warnings } = await augmentClass(entries, 3, [mockTransform], 'webp');

    // 1 source loaded, 1 skipped — augments from the 1 loaded source
    expect(images.length).toBeGreaterThan(0);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('nonexistent.webp');
  });

  it('produces deterministic output on repeated runs', async () => {
    const entries = [makeEntry(join(testDir, 'photo1.webp'))];

    const run1 = await augmentClass(entries, 2, [mockTransform], 'webp');
    const run2 = await augmentClass(entries, 2, [mockTransform], 'webp');

    expect(run1.images.map((i) => i.filename)).toEqual(run2.images.map((i) => i.filename));
  });
});
