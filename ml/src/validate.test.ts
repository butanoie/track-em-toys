import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { validateOutputStructure } from './validate.js';

const testRoot = join(tmpdir(), `ml-validate-test-${randomUUID()}`);

beforeAll(async () => {
  await mkdir(testRoot, { recursive: true });
});

afterAll(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

async function createTestStructure(name: string, classes: Record<string, number>): Promise<string> {
  const dir = join(testRoot, name);
  await mkdir(dir, { recursive: true });

  for (const [cls, count] of Object.entries(classes)) {
    const classDir = join(dir, cls);
    await mkdir(classDir, { recursive: true });
    for (let i = 0; i < count; i++) {
      await writeFile(join(classDir, `photo-${i}.webp`), `image-${i}`);
    }
  }

  return dir;
}

describe('validateOutputStructure', () => {
  it('passes for a valid structure', async () => {
    const dir = await createTestStructure('valid', {
      'transformers__commander-stack': 15,
      transformers__margh: 12,
    });

    const result = await validateOutputStructure(dir, ['transformers__commander-stack', 'transformers__margh']);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.classStats.get('transformers__commander-stack')).toBe(15);
    expect(result.classStats.get('transformers__margh')).toBe(12);
  });

  it('fails for empty class directory', async () => {
    const dir = await createTestStructure('empty-class', {});
    await mkdir(join(dir, 'transformers__empty'), { recursive: true });

    const result = await validateOutputStructure(dir, ['transformers__empty']);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('no images'))).toBe(true);
  });

  it('fails for class below minimum image count', async () => {
    const dir = await createTestStructure('low-count', {
      transformers__few: 5,
    });

    const result = await validateOutputStructure(dir, ['transformers__few']);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('minimum'))).toBe(true);
  });

  it('fails for missing expected class directory', async () => {
    const dir = await createTestStructure('missing-class', {
      transformers__present: 15,
    });

    const result = await validateOutputStructure(dir, ['transformers__present', 'transformers__missing']);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('missing'))).toBe(true);
  });

  it('warns about unexpected class directories', async () => {
    const dir = await createTestStructure('unexpected', {
      transformers__expected: 15,
      transformers__surprise: 15,
    });

    const result = await validateOutputStructure(dir, ['transformers__expected']);

    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes('surprise'))).toBe(true);
  });

  it('warns about non-image files in class directories', async () => {
    const dir = await createTestStructure('non-image', {
      transformers__mixed: 15,
    });
    await writeFile(join(dir, 'transformers__mixed', 'readme.txt'), 'not an image');

    const result = await validateOutputStructure(dir, ['transformers__mixed']);

    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes('Non-image'))).toBe(true);
  });

  it('fails for non-existent output directory', async () => {
    const result = await validateOutputStructure(join(testRoot, 'nope'), ['class-a']);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('does not exist');
  });

  it('ignores .DS_Store files', async () => {
    const dir = await createTestStructure('dsstore', {
      transformers__class: 15,
    });
    await writeFile(join(dir, '.DS_Store'), 'mac junk');
    await writeFile(join(dir, 'transformers__class', '.DS_Store'), 'mac junk');

    const result = await validateOutputStructure(dir, ['transformers__class']);

    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});
