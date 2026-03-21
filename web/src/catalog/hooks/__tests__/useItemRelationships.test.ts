import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useItemRelationships } from '../useItemRelationships';

vi.mock('@/catalog/api', () => ({
  getItemRelationships: vi.fn(),
}));

import { getItemRelationships } from '@/catalog/api';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    wrapper: function Wrapper({ children }: { children: React.ReactNode }) {
      return createElement(QueryClientProvider, { client: queryClient }, children);
    },
    queryClient,
  };
}

const mockResponse = {
  relationships: [
    {
      type: 'variant',
      subtype: 'exclusive_repaint',
      role: 'variant',
      related_item: { slug: 'red-optimus', name: 'Red Optimus Prime' },
      metadata: {},
    },
  ],
};

describe('useItemRelationships', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches when franchise and slug are provided', async () => {
    vi.mocked(getItemRelationships).mockResolvedValue(mockResponse);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useItemRelationships('transformers', 'optimus-prime'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getItemRelationships).toHaveBeenCalledWith('transformers', 'optimus-prime');
    expect(result.current.data).toEqual(mockResponse);
  });

  it('does not fetch when slug is undefined', () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useItemRelationships('transformers', undefined), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(getItemRelationships).not.toHaveBeenCalled();
  });

  it('does not fetch when franchise is empty string', () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useItemRelationships('', 'optimus-prime'), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(getItemRelationships).not.toHaveBeenCalled();
  });

  it('uses the correct queryKey structure', async () => {
    vi.mocked(getItemRelationships).mockResolvedValue(mockResponse);
    const { wrapper, queryClient } = createWrapper();

    renderHook(() => useItemRelationships('transformers', 'optimus-prime'), { wrapper });

    await waitFor(() => {
      const cache = queryClient.getQueryCache().findAll();
      expect(cache).toHaveLength(1);
      expect(cache[0].queryKey).toEqual(['catalog', 'items', 'transformers', 'optimus-prime', 'relationships']);
    });
  });

  it('sets isError when the API call fails', async () => {
    vi.mocked(getItemRelationships).mockRejectedValue(new Error('Not found'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useItemRelationships('transformers', 'bad-slug'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Not found');
  });
});
