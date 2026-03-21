import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePhotoMutations } from '../usePhotoMutations';

vi.mock('../api', () => ({
  deletePhoto: vi.fn().mockResolvedValue(undefined),
  setPrimaryPhoto: vi.fn().mockResolvedValue({
    id: 'p-1',
    url: 'test/photo-gallery.webp',
    caption: null,
    is_primary: true,
    sort_order: 0,
    status: 'approved',
  }),
  reorderPhotos: vi.fn().mockResolvedValue([]),
  buildPhotoUrl: (url: string) => url,
  validateFile: () => null,
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('usePhotoMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns deleteMutation, setPrimaryMutation, and reorderMutation', () => {
    const { result } = renderHook(() => usePhotoMutations('transformers', 'optimus-prime'), {
      wrapper: createWrapper(),
    });

    expect(result.current.deleteMutation).toBeDefined();
    expect(result.current.setPrimaryMutation).toBeDefined();
    expect(result.current.reorderMutation).toBeDefined();
  });

  it('deleteMutation calls deletePhoto with correct args', async () => {
    const { deletePhoto } = await import('../api');
    const { result } = renderHook(() => usePhotoMutations('transformers', 'optimus-prime'), {
      wrapper: createWrapper(),
    });

    result.current.deleteMutation.mutate('photo-1');

    await waitFor(() => {
      expect(result.current.deleteMutation.isSuccess).toBe(true);
    });

    expect(deletePhoto).toHaveBeenCalledWith('transformers', 'optimus-prime', 'photo-1');
  });

  it('setPrimaryMutation calls setPrimaryPhoto with correct args', async () => {
    const { setPrimaryPhoto } = await import('../api');
    const { result } = renderHook(() => usePhotoMutations('transformers', 'optimus-prime'), {
      wrapper: createWrapper(),
    });

    result.current.setPrimaryMutation.mutate('photo-2');

    await waitFor(() => {
      expect(result.current.setPrimaryMutation.isSuccess).toBe(true);
    });

    expect(setPrimaryPhoto).toHaveBeenCalledWith('transformers', 'optimus-prime', 'photo-2');
  });

  it('reorderMutation calls reorderPhotos with correct args', async () => {
    const { reorderPhotos } = await import('../api');
    const { result } = renderHook(() => usePhotoMutations('transformers', 'optimus-prime'), {
      wrapper: createWrapper(),
    });

    const newOrder = [
      { id: 'p-2', sort_order: 0 },
      { id: 'p-1', sort_order: 1 },
    ];
    result.current.reorderMutation.mutate(newOrder);

    await waitFor(() => {
      expect(result.current.reorderMutation.isSuccess).toBe(true);
    });

    expect(reorderPhotos).toHaveBeenCalledWith('transformers', 'optimus-prime', newOrder);
  });
});
