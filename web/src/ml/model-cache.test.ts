import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { getCachedModel, putCachedModel, loadModel } from './model-cache';
import type { ModelCacheEntry } from './types';

function makeEntry(overrides?: Partial<ModelCacheEntry>): ModelCacheEntry {
  return {
    name: 'primary-classifier',
    version: 'primary-v1',
    graphBytes: new ArrayBuffer(100),
    dataBytes: new ArrayBuffer(200),
    labelMap: { '0': 'transformers__optimus-prime' },
    cachedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('IndexedDB cache', () => {
  it('returns null for non-existent model', async () => {
    const result = await getCachedModel('non-existent');
    expect(result).toBeNull();
  });

  it('stores and retrieves a model entry', async () => {
    const entry = makeEntry();
    await putCachedModel(entry);

    const retrieved = await getCachedModel('primary-classifier');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.version).toBe('primary-v1');
    expect(retrieved!.name).toBe('primary-classifier');
  });

  it('overwrites existing entry with same name', async () => {
    await putCachedModel(makeEntry({ version: 'v1' }));
    await putCachedModel(makeEntry({ version: 'v2' }));

    const retrieved = await getCachedModel('primary-classifier');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.version).toBe('v2');
  });
});

describe('loadModel', () => {
  it('returns cached entry when version matches', async () => {
    const entry = makeEntry();
    await putCachedModel(entry);

    const result = await loadModel({
      name: 'primary-classifier',
      version: 'primary-v1',
      downloadUrl: 'http://localhost/model.onnx',
      metadataUrl: 'http://localhost/model-metadata.json',
      sizeBytes: 1000,
    });

    expect(result.version).toBe('primary-v1');
  });

  it('downloads when cache misses', async () => {
    const metadataJson = {
      label_map: { '0': 'transformers__bumblebee' },
    };

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(metadataJson),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'Content-Length': '100' }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(100));
            controller.close();
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'Content-Length': '200' }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(200));
            controller.close();
          },
        }),
      }) as typeof fetch;

    const progress = vi.fn();
    const result = await loadModel(
      {
        name: 'new-model',
        version: 'new-v1',
        downloadUrl: 'http://localhost/model.onnx',
        metadataUrl: 'http://localhost/model-metadata.json',
        sizeBytes: 300,
      },
      progress
    );

    expect(result.version).toBe('new-v1');
    expect(result.labelMap).toEqual({ '0': 'transformers__bumblebee' });
    expect(progress).toHaveBeenCalled();
  });

  it('throws on metadata fetch failure', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    }) as typeof fetch;

    await expect(
      loadModel({
        name: 'fail-model',
        version: 'v1',
        downloadUrl: 'http://localhost/model.onnx',
        metadataUrl: 'http://localhost/model-metadata.json',
        sizeBytes: 100,
      })
    ).rejects.toThrow('Metadata fetch failed');
  });
});
