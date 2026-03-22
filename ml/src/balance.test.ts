import { describe, it, expect, vi } from 'vitest';
import { analyzeBalance, printBalanceReport } from './balance.js';
import type { ManifestEntry } from './types.js';

function makeEntries(label: string, count: number): ManifestEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    photo_path: `/photos/${label}/${i}.webp`,
    label,
    item_name: label,
    franchise_slug: 'transformers',
    item_slug: label.split('/')[1] ?? label,
  }));
}

function makeGrouped(classes: Record<string, number>): Map<string, ManifestEntry[]> {
  const grouped = new Map<string, ManifestEntry[]>();
  for (const [label, count] of Object.entries(classes)) {
    grouped.set(label, makeEntries(label, count));
  }
  return grouped;
}

describe('analyzeBalance', () => {
  it('computes augment counts for classes below target', () => {
    const grouped = makeGrouped({
      'transformers/commander-stack': 18,
      'transformers/margh': 19,
    });

    const report = analyzeBalance(grouped, 100);

    expect(report.classes).toHaveLength(2);

    const cs = report.classes.find((c) => c.label === 'transformers/commander-stack');
    expect(cs).toBeDefined();
    expect(cs!.sourceCount).toBe(18);
    expect(cs!.augmentCount).toBe(82);
    expect(cs!.targetCount).toBe(100);

    const m = report.classes.find((c) => c.label === 'transformers/margh');
    expect(m).toBeDefined();
    expect(m!.sourceCount).toBe(19);
    expect(m!.augmentCount).toBe(81);
  });

  it('sets augmentCount to 0 when class exceeds target', () => {
    const grouped = makeGrouped({ 'transformers/big-class': 150 });

    const report = analyzeBalance(grouped, 100);

    expect(report.classes[0]?.augmentCount).toBe(0);
    expect(report.classes[0]?.targetCount).toBe(150);
  });

  it('computes min/max/mean correctly', () => {
    const grouped = makeGrouped({
      'transformers/a': 10,
      'transformers/b': 20,
      'transformers/c': 30,
    });

    const report = analyzeBalance(grouped, 100);

    expect(report.min).toBe(10);
    expect(report.max).toBe(30);
    expect(report.mean).toBe(20);
  });

  it('flags classes below viable minimum', () => {
    const grouped = makeGrouped({
      'transformers/few': 3,
      'transformers/enough': 15,
    });

    const report = analyzeBalance(grouped, 100);

    expect(report.belowViableMinimum).toEqual(['transformers/few']);
  });

  it('sorts classes by label', () => {
    const grouped = makeGrouped({
      'transformers/zebra': 10,
      'transformers/alpha': 20,
    });

    const report = analyzeBalance(grouped, 100);

    expect(report.classes[0]?.label).toBe('transformers/alpha');
    expect(report.classes[1]?.label).toBe('transformers/zebra');
  });
});

describe('printBalanceReport', () => {
  it('prints without throwing', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const grouped = makeGrouped({
      'transformers/commander-stack': 18,
      'transformers/margh': 19,
    });
    const report = analyzeBalance(grouped, 100);

    expect(() => printBalanceReport(report)).not.toThrow();

    consoleSpy.mockRestore();
  });

  it('prints viability warnings for low-count classes', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const grouped = makeGrouped({
      'transformers/rare': 3,
      'transformers/common': 50,
    });
    const report = analyzeBalance(grouped, 100);

    printBalanceReport(report);

    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Low source');
    expect(output).toContain('transformers__rare');

    consoleSpy.mockRestore();
  });
});
