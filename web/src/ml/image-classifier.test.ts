import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('onnxruntime-web', () => ({
  InferenceSession: {
    create: vi.fn().mockResolvedValue({
      run: vi.fn().mockResolvedValue({
        output: { data: new Float32Array([0.1, 0.7, 0.2]) },
      }),
    }),
  },
  Tensor: vi.fn().mockImplementation((type: string, data: Float32Array, dims: number[]) => ({
    type,
    data,
    dims,
  })),
  env: {
    wasm: { wasmPaths: '' },
    versions: { web: '1.24.0' },
  },
}));

vi.mock('./preprocess', () => ({
  preprocessImage: vi.fn().mockResolvedValue(new Float32Array(3 * 224 * 224)),
}));

import { classifyImage } from './image-classifier';
import type { ModelCacheEntry } from './types';

function makeCacheEntry(): ModelCacheEntry {
  return {
    name: 'test-model',
    version: 'test-v1',
    graphBytes: new ArrayBuffer(10),
    dataBytes: new ArrayBuffer(20),
    labelMap: {
      '0': 'transformers__optimus-prime',
      '1': 'transformers__bumblebee',
      '2': 'gi-joe__cobra-commander',
    },
    cachedAt: Date.now(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('classifyImage', () => {
  it('returns predictions sorted by confidence', async () => {
    const file = new File(['test'], 'test.png', { type: 'image/png' });

    const predictions = await classifyImage(file, makeCacheEntry(), 3);

    expect(predictions.length).toBeGreaterThan(0);
    expect(predictions[0]).toBeDefined();
    expect(predictions[0]!.franchiseSlug).toBe('transformers');
    expect(predictions[0]!.itemSlug).toBe('bumblebee');
    expect(predictions[0]!.confidence).toBeGreaterThan(0);
  });

  it('returns at most topK results', async () => {
    const file = new File(['test'], 'test.png', { type: 'image/png' });

    const predictions = await classifyImage(file, makeCacheEntry(), 2);

    expect(predictions.length).toBeLessThanOrEqual(2);
  });

  it('uses model label map for prediction labels', async () => {
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    const entry = makeCacheEntry();
    // Mock model output has [0.1, 0.7, 0.2] — index 1 is highest
    entry.labelMap = {
      '0': 'transformers__optimus-prime',
      '1': 'transformers__starscream',
      '2': 'transformers__bumblebee',
    };

    const predictions = await classifyImage(file, entry, 1);

    expect(predictions).toHaveLength(1);
    expect(predictions[0]).toBeDefined();
    // Index 1 has highest score (0.7), maps to starscream
    expect(predictions[0]!.label).toBe('transformers__starscream');
  });
});
