import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { writeFile, mkdir, rm, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { prepareOutputDir, copyClass, cleanClassDir } from './copy.js';
import type { AugmentedImage } from './types.js';

const testRoot = join(tmpdir(), `ml-copy-test-${randomUUID()}`);
const sourceDir = join(testRoot, 'source');
const outputDir = join(testRoot, 'output');

beforeAll(async () => {
  await mkdir(sourceDir, { recursive: true });
  await writeFile(join(sourceDir, 'photo1-original.webp'), Buffer.from('fake-photo-1'));
  await writeFile(join(sourceDir, 'photo2-original.webp'), Buffer.from('fake-photo-2'));
});

afterAll(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  // Clean output directory between tests
  await rm(outputDir, { recursive: true, force: true });
});

describe('prepareOutputDir', () => {
  it('creates the output directory', async () => {
    const dir = join(testRoot, 'new-output');
    await prepareOutputDir(dir);

    const entries = await readdir(dir);
    expect(entries).toBeDefined();

    await rm(dir, { recursive: true, force: true });
  });

  it('is idempotent', async () => {
    const dir = join(testRoot, 'idem-output');
    await prepareOutputDir(dir);
    await prepareOutputDir(dir);

    const entries = await readdir(dir);
    expect(entries).toBeDefined();

    await rm(dir, { recursive: true, force: true });
  });
});

describe('cleanClassDir', () => {
  it('removes all files in the directory', async () => {
    const dir = join(testRoot, 'clean-test');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'old-file.webp'), 'old');
    await writeFile(join(dir, 'aug-0-hflip.webp'), 'aug');

    await cleanClassDir(dir);

    const entries = await readdir(dir);
    expect(entries).toHaveLength(0);

    await rm(dir, { recursive: true, force: true });
  });

  it('creates directory if it does not exist', async () => {
    const dir = join(testRoot, 'nonexistent-clean');
    await cleanClassDir(dir);

    const entries = await readdir(dir);
    expect(entries).toHaveLength(0);

    await rm(dir, { recursive: true, force: true });
  });
});

describe('copyClass', () => {
  it('copies originals into a flat label directory', async () => {
    await prepareOutputDir(outputDir);

    const entries = [
      {
        photo_path: join(sourceDir, 'photo1-original.webp'),
        label: 'transformers/margh',
        item_name: 'Margh',
        franchise_slug: 'transformers',
        item_slug: 'margh',
      },
    ];

    const result = await copyClass('transformers/margh', entries, [], outputDir, false);

    expect(result.originalsWritten).toBe(1);
    expect(result.augmentedWritten).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    const classDir = join(outputDir, 'transformers__margh');
    const files = await readdir(classDir);
    expect(files).toContain('photo1-original.webp');
  });

  it('writes augmented images', async () => {
    await prepareOutputDir(outputDir);

    const augmented: AugmentedImage[] = [{ filename: 'aug-0-hflip.webp', buffer: Buffer.from('augmented-data') }];

    const result = await copyClass('transformers/test', [], augmented, outputDir, false);

    expect(result.originalsWritten).toBe(0);
    expect(result.augmentedWritten).toBe(1);

    const classDir = join(outputDir, 'transformers__test');
    const content = await readFile(join(classDir, 'aug-0-hflip.webp'));
    expect(content.toString()).toBe('augmented-data');
  });

  it('records error for missing source file', async () => {
    await prepareOutputDir(outputDir);

    const entries = [
      {
        photo_path: join(sourceDir, 'nonexistent.webp'),
        label: 'transformers/missing',
        item_name: 'Missing',
        franchise_slug: 'transformers',
        item_slug: 'missing',
      },
    ];

    const result = await copyClass('transformers/missing', entries, [], outputDir, false);

    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.reason).toContain('not found');
  });

  it('cleans old files on re-run with clean mode', async () => {
    await prepareOutputDir(outputDir);
    const classDir = join(outputDir, 'transformers__rerun');
    await mkdir(classDir, { recursive: true });
    await writeFile(join(classDir, 'old-file.webp'), 'old');

    const entries = [
      {
        photo_path: join(sourceDir, 'photo1-original.webp'),
        label: 'transformers/rerun',
        item_name: 'Rerun',
        franchise_slug: 'transformers',
        item_slug: 'rerun',
      },
    ];

    await copyClass('transformers/rerun', entries, [], outputDir, false);

    const files = await readdir(classDir);
    expect(files).not.toContain('old-file.webp');
    expect(files).toContain('photo1-original.webp');
  });

  it('preserves old files with --no-clean', async () => {
    await prepareOutputDir(outputDir);
    const classDir = join(outputDir, 'transformers__noclean');
    await mkdir(classDir, { recursive: true });
    await writeFile(join(classDir, 'old-file.webp'), 'old');

    const entries = [
      {
        photo_path: join(sourceDir, 'photo1-original.webp'),
        label: 'transformers/noclean',
        item_name: 'NoClean',
        franchise_slug: 'transformers',
        item_slug: 'noclean',
      },
    ];

    await copyClass('transformers/noclean', entries, [], outputDir, true);

    const files = await readdir(classDir);
    expect(files).toContain('old-file.webp');
    expect(files).toContain('photo1-original.webp');
  });
});
