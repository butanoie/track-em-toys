import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeConfusedPairs, readModelMetrics } from './quality-reader.js';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

const { readFile } = await import('node:fs/promises');
const mockReadFile = vi.mocked(readFile);

const mockLog = { warn: vi.fn(), error: vi.fn() };

const validMetricsJson = JSON.stringify({
  model_stem: 'primary-classifier-20260401-c3-a85.0',
  category: 'primary',
  class_count: 3,
  best_val_accuracy: 0.85,
  top3_accuracy: 0.95,
  label_map: { '0': 'transformers__optimus-prime', '1': 'transformers__bumblebee', '2': 'gi-joe__snake-eyes' },
  per_class_accuracy: {
    'transformers__optimus-prime': 0.9,
    'transformers__bumblebee': 0.8,
    'gi-joe__snake-eyes': 0.85,
  },
  confusion_matrix: [
    [9, 1, 0],
    [2, 8, 0],
    [0, 1, 9],
  ],
  hyperparams: { lr: 0.001 },
  seed: 42,
  trained_at: '2026-04-01T00:00:00Z',
  data_dir: '/tmp/training',
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('readModelMetrics', () => {
  it('reads and parses a valid metrics file', async () => {
    mockReadFile.mockResolvedValue(validMetricsJson);

    const result = await readModelMetrics('/models', 'primary-classifier-20260401-c3-a85.0', mockLog);

    expect(result).not.toBeNull();
    expect(result?.class_count).toBe(3);
    expect(result?.top3_accuracy).toBe(0.95);
    expect(mockReadFile).toHaveBeenCalledWith(
      expect.stringContaining('primary-classifier-20260401-c3-a85.0-metrics.json'),
      'utf-8'
    );
  });

  it('returns null when file does not exist', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    const result = await readModelMetrics('/models', 'nonexistent', mockLog);

    expect(result).toBeNull();
    expect(mockLog.warn).not.toHaveBeenCalled();
  });

  it('returns null and logs warning on invalid JSON', async () => {
    mockReadFile.mockResolvedValue('not json');

    const result = await readModelMetrics('/models', 'bad-json', mockLog);

    expect(result).toBeNull();
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.objectContaining({ file: 'bad-json-metrics.json' }),
      expect.stringContaining('parse')
    );
  });

  it('returns null and logs warning on invalid schema', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ not: 'metrics' }));

    const result = await readModelMetrics('/models', 'bad-schema', mockLog);

    expect(result).toBeNull();
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.objectContaining({ file: 'bad-schema-metrics.json' }),
      expect.stringContaining('Invalid metrics schema')
    );
  });

  it('rejects version with path traversal characters', async () => {
    const result = await readModelMetrics('/models', '../etc/passwd', mockLog);

    expect(result).toBeNull();
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.objectContaining({ version: '../etc/passwd' }),
      expect.stringContaining('unsafe')
    );
    expect(mockReadFile).not.toHaveBeenCalled();
  });
});

describe('computeConfusedPairs', () => {
  const labelMap = {
    '0': 'transformers__optimus-prime',
    '1': 'transformers__bumblebee',
    '2': 'gi-joe__snake-eyes',
  };

  it('extracts off-diagonal pairs sorted by count', () => {
    const matrix = [
      [9, 1, 0],
      [2, 8, 0],
      [0, 1, 9],
    ];

    const pairs = computeConfusedPairs(matrix, labelMap, 10);

    expect(pairs.length).toBe(3);
    // Sorted by count descending: bumblebee→optimus (2), optimus→bumblebee (1), snake-eyes→bumblebee (1)
    expect(pairs[0]).toEqual({
      true_label: 'transformers__bumblebee',
      predicted_label: 'transformers__optimus-prime',
      count: 2,
      pct_of_true_class: 0.2,
    });
  });

  it('returns empty array for a perfect diagonal matrix', () => {
    const matrix = [
      [10, 0, 0],
      [0, 10, 0],
      [0, 0, 10],
    ];

    const pairs = computeConfusedPairs(matrix, labelMap);
    expect(pairs).toEqual([]);
  });

  it('respects topN limit', () => {
    const matrix = [
      [5, 3, 2],
      [1, 6, 3],
      [2, 1, 7],
    ];

    const pairs = computeConfusedPairs(matrix, labelMap, 2);
    expect(pairs.length).toBe(2);
  });

  it('handles empty rows (class with no samples)', () => {
    const matrix = [
      [0, 0, 0],
      [2, 8, 0],
      [0, 0, 10],
    ];

    const pairs = computeConfusedPairs(matrix, labelMap);
    // Only bumblebee→optimus (2) has off-diagonal counts
    expect(pairs.length).toBe(1);
    expect(pairs[0]?.true_label).toBe('transformers__bumblebee');
  });

  it('computes pct_of_true_class correctly', () => {
    const matrix = [
      [7, 3, 0],
      [0, 10, 0],
      [0, 0, 10],
    ];

    const pairs = computeConfusedPairs(matrix, labelMap);
    expect(pairs.length).toBe(1);
    expect(pairs[0]?.pct_of_true_class).toBeCloseTo(0.3);
  });

  it('uses fallback label when labelMap is missing an index', () => {
    const matrix = [
      [9, 1],
      [2, 8],
    ];
    const sparseMap = { '0': 'transformers__optimus-prime' };

    const pairs = computeConfusedPairs(matrix, sparseMap);
    const pred = pairs.find((p) => p.predicted_label === 'class-1');
    expect(pred).toBeDefined();
  });
});
