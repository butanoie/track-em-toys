import { describe, it, expect } from 'vitest';
import { parseLabel, buildCatalogItemPath, softmax, extractTopPredictions, formatSlugAsName } from './label-parser';

describe('parseLabel', () => {
  it('parses a valid franchise__item-slug label', () => {
    expect(parseLabel('transformers__optimus-prime')).toEqual({
      franchiseSlug: 'transformers',
      itemSlug: 'optimus-prime',
    });
  });

  it('handles labels with hyphens in both parts', () => {
    expect(parseLabel('gi-joe__cobra-commander')).toEqual({
      franchiseSlug: 'gi-joe',
      itemSlug: 'cobra-commander',
    });
  });

  it('returns null for labels without delimiter', () => {
    expect(parseLabel('no-delimiter')).toBeNull();
  });

  it('returns null for labels with empty franchise', () => {
    expect(parseLabel('__item-slug')).toBeNull();
  });

  it('returns null for labels with empty item slug', () => {
    expect(parseLabel('franchise__')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseLabel('')).toBeNull();
  });
});

describe('buildCatalogItemPath', () => {
  it('builds a catalog item URL path', () => {
    expect(buildCatalogItemPath('transformers', 'optimus-prime')).toBe('/catalog/transformers/items/optimus-prime');
  });
});

describe('softmax', () => {
  it('converts logits to probabilities that sum to 1', () => {
    const logits = new Float32Array([1.0, 2.0, 3.0]);
    const probs = softmax(logits);

    expect(probs).toHaveLength(3);
    const sum = probs[0]! + probs[1]! + probs[2]!;
    expect(sum).toBeCloseTo(1.0, 5);
    // Highest logit gets highest probability
    expect(probs[2]!).toBeGreaterThan(probs[1]!);
    expect(probs[1]!).toBeGreaterThan(probs[0]!);
  });

  it('handles negative logits', () => {
    const logits = new Float32Array([-1.0, -2.0, -3.0]);
    const probs = softmax(logits);

    const sum = probs[0]! + probs[1]! + probs[2]!;
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('handles all-zero logits (uniform distribution)', () => {
    const logits = new Float32Array([0, 0, 0]);
    const probs = softmax(logits);

    expect(probs[0]).toBeCloseTo(1 / 3, 5);
    expect(probs[1]).toBeCloseTo(1 / 3, 5);
    expect(probs[2]).toBeCloseTo(1 / 3, 5);
  });
});

describe('extractTopPredictions', () => {
  const labelMap: Record<string, string> = {
    '0': 'transformers__optimus-prime',
    '1': 'transformers__bumblebee',
    '2': 'gi-joe__cobra-commander',
  };

  it('returns top-K predictions sorted by confidence', () => {
    const scores = new Float32Array([0.1, 0.7, 0.2]);
    const results = extractTopPredictions(scores, labelMap, 2);

    expect(results).toHaveLength(2);
    expect(results[0]!.itemSlug).toBe('bumblebee');
    // After softmax, highest score gets highest probability
    expect(results[0]!.confidence).toBeGreaterThan(results[1]!.confidence);
    expect(results[1]!.itemSlug).toBe('cobra-commander');
  });

  it('applies softmax when scores contain raw logits', () => {
    const logits = new Float32Array([10.0, 5.0, 1.0]);
    const results = extractTopPredictions(logits, labelMap, 3);

    expect(results).toHaveLength(3);
    expect(results[0]!.itemSlug).toBe('optimus-prime');
    // After softmax, values should be probabilities
    expect(results[0]!.confidence).toBeGreaterThan(0);
    expect(results[0]!.confidence).toBeLessThanOrEqual(1);
  });

  it('skips labels not in the label map', () => {
    const scores = new Float32Array([0.5, 0.3, 0.1, 0.1]);
    const results = extractTopPredictions(scores, labelMap, 4);

    // Only 3 labels in map, so max 3 results
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('skips malformed labels', () => {
    const badMap: Record<string, string> = {
      '0': 'no-delimiter',
      '1': 'transformers__bumblebee',
    };
    const scores = new Float32Array([0.8, 0.2]);
    const results = extractTopPredictions(scores, badMap, 2);

    expect(results).toHaveLength(1);
    expect(results[0]!.itemSlug).toBe('bumblebee');
  });
});

describe('formatSlugAsName', () => {
  it('formats a simple slug', () => {
    expect(formatSlugAsName('optimus-prime')).toBe('Optimus Prime');
  });

  it('formats a slug with numbers', () => {
    expect(formatSlugAsName('ft-04-scoria')).toBe('Ft 04 Scoria');
  });

  it('handles single word', () => {
    expect(formatSlugAsName('bumblebee')).toBe('Bumblebee');
  });
});
