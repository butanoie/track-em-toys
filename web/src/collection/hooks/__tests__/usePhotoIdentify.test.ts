import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { MlModelSummary } from '@/lib/zod-schemas';

const mockLoadModel = vi.fn();
const mockClassifyImage = vi.fn();

vi.mock('@/ml/model-cache', () => ({
  loadModel: (...args: unknown[]) => mockLoadModel(...args),
}));

vi.mock('@/ml/image-classifier', () => ({
  classifyImage: (...args: unknown[]) => mockClassifyImage(...args),
}));

import { usePhotoIdentify } from '../usePhotoIdentify';

function makeModel(overrides?: Partial<MlModelSummary>): MlModelSummary {
  return {
    name: 'primary-classifier',
    version: 'v1',
    category: 'primary',
    format: 'onnx',
    class_count: 10,
    accuracy: 0.85,
    input_shape: [1, 3, 224, 224],
    size_bytes: 7000000,
    download_url: 'http://localhost/model.onnx',
    metadata_url: 'http://localhost/model-metadata.json',
    trained_at: '2026-03-31T00:00:00Z',
    exported_at: '2026-03-31T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadModel.mockResolvedValue({
    name: 'primary-classifier',
    version: 'v1',
    graphBytes: new ArrayBuffer(10),
    dataBytes: new ArrayBuffer(20),
    labelMap: { '0': 'transformers__optimus-prime' },
    cachedAt: Date.now(),
  });
  mockClassifyImage.mockResolvedValue([
    { label: 'transformers__optimus-prime', franchiseSlug: 'transformers', itemSlug: 'optimus-prime', confidence: 0.9 },
  ]);
});

describe('usePhotoIdentify', () => {
  it('starts in idle phase', () => {
    const { result } = renderHook(() => usePhotoIdentify());
    expect(result.current.phase.step).toBe('idle');
  });

  it('transitions through phases on identify', async () => {
    const { result } = renderHook(() => usePhotoIdentify());
    const file = new File(['test'], 'test.png', { type: 'image/png' });

    await act(async () => {
      await result.current.identify(file, makeModel());
    });

    expect(result.current.phase.step).toBe('results');
    if (result.current.phase.step === 'results') {
      expect(result.current.phase.predictions).toHaveLength(1);
      expect(result.current.phase.predictions[0]?.itemSlug).toBe('optimus-prime');
    }
  });

  it('sets error phase on failure', async () => {
    mockLoadModel.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => usePhotoIdentify());
    const file = new File(['test'], 'test.png', { type: 'image/png' });

    await act(async () => {
      await result.current.identify(file, makeModel());
    });

    expect(result.current.phase.step).toBe('error');
    if (result.current.phase.step === 'error') {
      expect(result.current.phase.message).toBe('Network error');
    }
  });

  it('sets error when download_url is null', async () => {
    const { result } = renderHook(() => usePhotoIdentify());
    const file = new File(['test'], 'test.png', { type: 'image/png' });

    await act(async () => {
      await result.current.identify(file, makeModel({ download_url: null }));
    });

    expect(result.current.phase.step).toBe('error');
  });

  it('resets to idle', async () => {
    const { result } = renderHook(() => usePhotoIdentify());
    const file = new File(['test'], 'test.png', { type: 'image/png' });

    await act(async () => {
      await result.current.identify(file, makeModel());
    });

    expect(result.current.phase.step).toBe('results');

    act(() => {
      result.current.reset();
    });

    expect(result.current.phase.step).toBe('idle');
  });
});
