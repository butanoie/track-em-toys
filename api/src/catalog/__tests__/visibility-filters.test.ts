import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Regression tests locking the `visibility = 'public'` filter into every
 * public-catalog photo query. Training-only photos (intent = training_only
 * contributions, or curator-demoted approvals) MUST NOT leak into the public
 * catalog via item list thumbnails, item detail photo galleries, manufacturer
 * item thumbnails, or search result thumbnails.
 *
 * If one of these tests fails, do NOT "fix" the test — add the missing
 * `visibility = 'public'` filter to the offending query. A failing test here
 * represents a privacy leak: a contributor who chose training_only intent
 * would see their photo appear publicly, violating the contract documented
 * in `docs/plans/Photo_Contribution_Visibility_Plan.md`.
 *
 * The ML-export query (`catalog/ml-export/queries.ts`) is deliberately
 * EXCLUDED from these checks — it has its own invariant test asserting the
 * OPPOSITE (no visibility filter), because ML training must see all approved
 * photos regardless of visibility.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOG_DIR = resolve(HERE, '..');

function read(rel: string): string {
  return readFileSync(resolve(CATALOG_DIR, rel), 'utf8');
}

/**
 * Extract every `item_photos` query block (identified by a `status = 'approved'`
 * line) and return the surrounding context (±4 lines) so we can assert that
 * each block also contains the visibility filter nearby.
 *
 * @param src - The source file contents to scan
 */
function approvedBlocks(src: string): string[] {
  const lines = src.split('\n');
  const blocks: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/status\s*=\s*'approved'/.test(lines[i]!)) {
      const start = Math.max(0, i - 4);
      const end = Math.min(lines.length, i + 5);
      blocks.push(lines.slice(start, end).join('\n'));
    }
  }
  return blocks;
}

describe('catalog visibility filters — public catalog must exclude training_only photos', () => {
  it('items/queries.ts — every approved-photo block includes visibility = public', () => {
    const src = read('items/queries.ts');
    const blocks = approvedBlocks(src);
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block).toMatch(/visibility\s*=\s*'public'/);
    }
  });

  it('manufacturers/queries.ts — every approved-photo block includes visibility = public', () => {
    const src = read('manufacturers/queries.ts');
    const blocks = approvedBlocks(src);
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block).toMatch(/visibility\s*=\s*'public'/);
    }
  });

  it('search/queries.ts — every approved-photo block includes visibility = public', () => {
    const src = read('search/queries.ts');
    const blocks = approvedBlocks(src);
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block).toMatch(/visibility\s*=\s*'public'/);
    }
  });
});
