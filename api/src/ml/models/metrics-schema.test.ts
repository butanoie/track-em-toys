import { describe, it, expect } from 'vitest';
import { parseModelMetrics } from './metrics-schema.js';

const validMetrics = {
  model_stem: 'primary-classifier-20260401-c50-a85.0',
  category: 'primary',
  class_count: 50,
  best_val_accuracy: 0.85,
  top3_accuracy: 0.95,
  label_map: { '0': 'transformers__optimus-prime', '1': 'transformers__bumblebee' },
  label_hierarchy: { '0': { franchise: 'transformers', item: 'optimus-prime' } },
  per_class_accuracy: { 'transformers__optimus-prime': 0.9, 'transformers__bumblebee': 0.8 },
  confusion_matrix: [
    [9, 1],
    [2, 8],
  ],
  hyperparams: { lr: 0.001, epochs: 25, batch_size: 32 },
  seed: 42,
  trained_at: '2026-04-01T00:00:00Z',
  data_dir: '/tmp/training-data/primary',
};

describe('parseModelMetrics', () => {
  it('accepts a valid metrics object', () => {
    const result = parseModelMetrics(validMetrics);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.class_count).toBe(50);
      expect(result.data.top3_accuracy).toBe(0.95);
      expect(result.data.per_class_accuracy['transformers__optimus-prime']).toBe(0.9);
    }
  });

  it('accepts metrics without top3_accuracy (older format)', () => {
    const { top3_accuracy: _, ...withoutTop3 } = validMetrics;
    const result = parseModelMetrics(withoutTop3);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.top3_accuracy).toBeNull();
    }
  });

  it('accepts metrics with null top3_accuracy', () => {
    const result = parseModelMetrics({ ...validMetrics, top3_accuracy: null });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.top3_accuracy).toBeNull();
    }
  });

  it('rejects non-object input', () => {
    const result = parseModelMetrics('string');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not an object');
  });

  it('rejects null input', () => {
    const result = parseModelMetrics(null);
    expect(result.ok).toBe(false);
  });

  it('rejects missing required string field', () => {
    const { model_stem: _, ...partial } = validMetrics;
    const result = parseModelMetrics(partial);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('model_stem');
  });

  it('rejects missing required number field', () => {
    const { class_count: _, ...partial } = validMetrics;
    const result = parseModelMetrics(partial);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('class_count');
  });

  it('rejects missing confusion_matrix', () => {
    const { confusion_matrix: _, ...partial } = validMetrics;
    const result = parseModelMetrics(partial);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('confusion_matrix');
  });

  it('rejects non-numeric per_class_accuracy values', () => {
    const result = parseModelMetrics({
      ...validMetrics,
      per_class_accuracy: { 'transformers__optimus-prime': 'high' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('per_class_accuracy');
  });

  it('rejects invalid top3_accuracy type', () => {
    const result = parseModelMetrics({ ...validMetrics, top3_accuracy: 'high' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('top3_accuracy');
  });
});
