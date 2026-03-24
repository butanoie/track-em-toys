/**
 * Tests for seed I/O helpers (seed-io.ts).
 * Functions are loaded dynamically to avoid rootDir constraint — seed modules
 * live in db/seed/ (outside src/) but vitest handles cross-root imports fine.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Dynamic import to bypass tsc rootDir constraint (vitest handles it fine)
const { seedIsNewer, dbIsNewer, assembleCharacterMetadata, disassembleCharacterMetadata, loadJson, saveJson } =
  await import('../../db/seed/seed-io.js');

// ─── seedIsNewer ────────────────────────────────────────────────────────────

describe('seedIsNewer', () => {
  it('returns false when seed has no last_modified', () => {
    expect(seedIsNewer(undefined, new Date('2026-03-20'))).toBe(false);
  });

  it('returns true when DB has no updated_at (new record)', () => {
    expect(seedIsNewer('2026-03-20T00:00:00.000Z', null)).toBe(true);
  });

  it('returns true when seed is newer than DB', () => {
    expect(seedIsNewer('2026-03-23T12:00:00.000Z', new Date('2026-03-20T00:00:00.000Z'))).toBe(true);
  });

  it('returns false when DB is newer than seed', () => {
    expect(seedIsNewer('2026-03-20T00:00:00.000Z', new Date('2026-03-23T12:00:00.000Z'))).toBe(false);
  });

  it('returns false when timestamps are equal', () => {
    const ts = '2026-03-23T12:00:00.000Z';
    expect(seedIsNewer(ts, new Date(ts))).toBe(false);
  });
});

// ─── dbIsNewer ──────────────────────────────────────────────────────────────

describe('dbIsNewer', () => {
  it('returns false when DB has no updated_at', () => {
    expect(dbIsNewer(null, '2026-03-20T00:00:00.000Z')).toBe(false);
  });

  it('returns true when seed has no last_modified', () => {
    expect(dbIsNewer(new Date('2026-03-20'), undefined)).toBe(true);
  });

  it('returns true when DB is newer than seed', () => {
    expect(dbIsNewer(new Date('2026-03-23T12:00:00.000Z'), '2026-03-20T00:00:00.000Z')).toBe(true);
  });

  it('returns false when seed is newer than DB', () => {
    expect(dbIsNewer(new Date('2026-03-20T00:00:00.000Z'), '2026-03-23T12:00:00.000Z')).toBe(false);
  });

  it('returns false when timestamps are equal', () => {
    const ts = '2026-03-23T12:00:00.000Z';
    expect(dbIsNewer(new Date(ts), ts)).toBe(false);
  });
});

// ─── assembleCharacterMetadata / disassembleCharacterMetadata ───────────────

describe('assembleCharacterMetadata', () => {
  it('packs notes, series_year, year_released into metadata', () => {
    const char = {
      name: 'Test',
      slug: 'test',
      franchise_slug: 'tf',
      faction_slug: null,
      character_type: null,
      alt_mode: null,
      is_combined_form: false,
      continuity_family_slug: 'g1',
      sub_group_slugs: [],
      notes: 'A note',
      series_year: '1984',
      year_released: 1984,
    };
    const result = assembleCharacterMetadata(char);
    expect(result).toEqual({ notes: 'A note', series_year: '1984', year_released: 1984 });
  });

  it('omits null fields', () => {
    const char = {
      name: 'Test',
      slug: 'test',
      franchise_slug: 'tf',
      faction_slug: null,
      character_type: null,
      alt_mode: null,
      is_combined_form: false,
      continuity_family_slug: 'g1',
      sub_group_slugs: [],
      notes: null,
    };
    const result = assembleCharacterMetadata(char);
    expect(result).toEqual({});
  });
});

describe('disassembleCharacterMetadata', () => {
  it('extracts known fields from JSONB', () => {
    const result = disassembleCharacterMetadata({
      notes: 'Hello',
      series_year: '1984',
      year_released: 1984,
    });
    expect(result).toEqual({ notes: 'Hello', series_year: '1984', year_released: 1984 });
  });

  it('returns nulls for missing fields', () => {
    const result = disassembleCharacterMetadata({});
    expect(result).toEqual({ notes: null, series_year: null, year_released: null });
  });

  it('handles null metadata', () => {
    const result = disassembleCharacterMetadata(null);
    expect(result).toEqual({ notes: null, series_year: null, year_released: null });
  });

  it('ignores fields with wrong types', () => {
    const result = disassembleCharacterMetadata({ notes: 42, series_year: true });
    expect(result).toEqual({ notes: null, series_year: null, year_released: null });
  });
});

// ─── loadJson / saveJson roundtrip ──────────────────────────────────────────

describe('loadJson / saveJson', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-io-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('round-trips JSON with 2-space indentation and trailing newline', () => {
    const data = { _metadata: { total: 1 }, data: [{ slug: 'test', name: 'Test' }] };
    const filePath = path.join(tmpDir, 'test.json');
    saveJson(filePath, data);

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toMatch(/^\{/);
    expect(content).toMatch(/\n$/);
    expect(content).toContain('  "');

    const loaded = loadJson(filePath);
    expect(loaded).toEqual(data);
  });

  it('overwrites existing file atomically', () => {
    const filePath = path.join(tmpDir, 'test.json');
    saveJson(filePath, { v: 1 });
    saveJson(filePath, { v: 2 });
    const loaded = loadJson(filePath) as { v: number };
    expect(loaded.v).toBe(2);
  });
});
