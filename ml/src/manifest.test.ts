import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { readManifest, groupEntriesByLabel, flattenLabel } from './manifest.js';
import type { Manifest, ManifestEntry } from './types.js';

const testDir = join(tmpdir(), `ml-manifest-test-${randomUUID()}`);

function makeManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    version: 1,
    exported_at: '2026-03-21T00:00:00.000Z',
    stats: { total_photos: 2, items: 2, franchises: 1, low_photo_items: 0 },
    entries: [
      {
        photo_path: '/photos/item1/photo1-original.webp',
        label: 'transformers/commander-stack',
        item_name: 'Commander Stack',
        franchise_slug: 'transformers',
        item_slug: 'commander-stack',
      },
      {
        photo_path: '/photos/item2/photo2-original.webp',
        label: 'transformers/margh',
        item_name: 'Margh',
        franchise_slug: 'transformers',
        item_slug: 'margh',
      },
    ],
    warnings: [],
    ...overrides,
  };
}

beforeAll(async () => {
  await mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe('readManifest', () => {
  it('parses a valid manifest file', async () => {
    const filePath = join(testDir, 'valid.json');
    await writeFile(filePath, JSON.stringify(makeManifest()));

    const result = await readManifest(filePath);

    expect(result.version).toBe(1);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]?.label).toBe('transformers/commander-stack');
  });

  it('throws for non-existent file', async () => {
    await expect(readManifest(join(testDir, 'nope.json'))).rejects.toThrow('not found');
  });

  it('throws for invalid JSON', async () => {
    const filePath = join(testDir, 'bad.json');
    await writeFile(filePath, 'not json at all');

    await expect(readManifest(filePath)).rejects.toThrow('not valid JSON');
  });

  it('throws for unsupported version', async () => {
    const filePath = join(testDir, 'v2.json');
    await writeFile(filePath, JSON.stringify(makeManifest({ version: 2 })));

    await expect(readManifest(filePath)).rejects.toThrow('version 2 is not supported');
  });

  it('throws for empty entries array', async () => {
    const filePath = join(testDir, 'empty.json');
    await writeFile(filePath, JSON.stringify(makeManifest({ entries: [] })));

    await expect(readManifest(filePath)).rejects.toThrow('no entries');
  });

  it('throws for entry missing photo_path', async () => {
    const filePath = join(testDir, 'no-path.json');
    const manifest = makeManifest();
    const entry0 = manifest.entries[0];
    expect(entry0).toBeDefined();
    entry0!.photo_path = '';
    await writeFile(filePath, JSON.stringify(manifest));

    await expect(readManifest(filePath)).rejects.toThrow('index 0 is missing photo_path');
  });

  it('throws for entry missing label', async () => {
    const filePath = join(testDir, 'no-label.json');
    const manifest = makeManifest();
    const entry1 = manifest.entries[1];
    expect(entry1).toBeDefined();
    entry1!.label = '';
    await writeFile(filePath, JSON.stringify(manifest));

    await expect(readManifest(filePath)).rejects.toThrow('index 1 is missing label');
  });
});

describe('groupEntriesByLabel', () => {
  it('groups entries correctly', () => {
    const entries: ManifestEntry[] = [
      {
        photo_path: '/a/1.webp',
        label: 'transformers/commander-stack',
        item_name: 'CS',
        franchise_slug: 'transformers',
        item_slug: 'commander-stack',
      },
      {
        photo_path: '/a/2.webp',
        label: 'transformers/commander-stack',
        item_name: 'CS',
        franchise_slug: 'transformers',
        item_slug: 'commander-stack',
      },
      {
        photo_path: '/b/1.webp',
        label: 'transformers/margh',
        item_name: 'M',
        franchise_slug: 'transformers',
        item_slug: 'margh',
      },
    ];

    const result = groupEntriesByLabel(entries);

    expect(result.size).toBe(2);
    expect(result.get('transformers/commander-stack')).toHaveLength(2);
    expect(result.get('transformers/margh')).toHaveLength(1);
  });

  it('returns empty map for empty entries', () => {
    const result = groupEntriesByLabel([]);
    expect(result.size).toBe(0);
  });
});

describe('flattenLabel', () => {
  it('replaces slashes with double underscores', () => {
    expect(flattenLabel('transformers/commander-stack')).toBe('transformers__commander-stack');
  });

  it('handles labels without slashes', () => {
    expect(flattenLabel('single-label')).toBe('single-label');
  });

  it('handles multiple slashes', () => {
    expect(flattenLabel('a/b/c')).toBe('a__b__c');
  });
});
