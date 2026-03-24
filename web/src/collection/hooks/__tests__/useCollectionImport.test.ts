import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCollectionImport } from '../useCollectionImport';
import type { CollectionExportPayload } from '@/lib/zod-schemas';

vi.mock('@/collection/api', () => ({
  importCollection: vi.fn(),
}));

import { importCollection } from '@/collection/api';

const mockPayload: CollectionExportPayload = {
  version: 1,
  exported_at: '2026-03-24T00:00:00.000Z',
  items: [
    {
      franchise_slug: 'transformers',
      item_slug: 'optimus-prime',
      condition: 'mint_sealed',
      notes: null,
      added_at: '2026-03-20T00:00:00Z',
      deleted_at: null,
    },
  ],
};

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useCollectionImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls importCollection with payload and mode', async () => {
    vi.mocked(importCollection).mockResolvedValue({ imported: [], unresolved: [], overwritten_count: 0 });

    const { result } = renderHook(() => useCollectionImport(), { wrapper: createWrapper() });

    act(() => {
      result.current.mutate({ data: mockPayload, mode: 'append' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(importCollection).toHaveBeenCalledWith(mockPayload, 'append');
  });

  it('passes overwrite mode to importCollection', async () => {
    vi.mocked(importCollection).mockResolvedValue({ imported: [], unresolved: [], overwritten_count: 5 });

    const { result } = renderHook(() => useCollectionImport(), { wrapper: createWrapper() });

    act(() => {
      result.current.mutate({ data: mockPayload, mode: 'overwrite' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(importCollection).toHaveBeenCalledWith(mockPayload, 'overwrite');
  });

  it('surfaces error on API failure', async () => {
    vi.mocked(importCollection).mockRejectedValue(new Error('Server error'));

    const { result } = renderHook(() => useCollectionImport(), { wrapper: createWrapper() });

    act(() => {
      result.current.mutate({ data: mockPayload, mode: 'append' });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Server error');
  });
});
