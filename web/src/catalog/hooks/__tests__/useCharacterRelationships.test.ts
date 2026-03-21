import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useCharacterRelationships } from '../useCharacterRelationships';

vi.mock('@/catalog/api', () => ({
  getCharacterRelationships: vi.fn(),
}));

import { getCharacterRelationships } from '@/catalog/api';

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
      type: 'rival',
      subtype: null,
      role: 'rival',
      related_character: { slug: 'megatron', name: 'Megatron' },
      metadata: {},
    },
  ],
};

describe('useCharacterRelationships', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches when franchise and slug are provided', async () => {
    vi.mocked(getCharacterRelationships).mockResolvedValue(mockResponse);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCharacterRelationships('transformers', 'optimus-prime'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getCharacterRelationships).toHaveBeenCalledWith('transformers', 'optimus-prime');
    expect(result.current.data).toEqual(mockResponse);
  });

  it('does not fetch when slug is undefined', () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCharacterRelationships('transformers', undefined), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(getCharacterRelationships).not.toHaveBeenCalled();
  });

  it('does not fetch when franchise is empty string', () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCharacterRelationships('', 'optimus-prime'), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(getCharacterRelationships).not.toHaveBeenCalled();
  });

  it('uses the correct queryKey structure', async () => {
    vi.mocked(getCharacterRelationships).mockResolvedValue(mockResponse);
    const { wrapper, queryClient } = createWrapper();

    renderHook(() => useCharacterRelationships('transformers', 'optimus-prime'), { wrapper });

    await waitFor(() => {
      const cache = queryClient.getQueryCache().findAll();
      expect(cache).toHaveLength(1);
      expect(cache[0].queryKey).toEqual(['catalog', 'characters', 'transformers', 'optimus-prime', 'relationships']);
    });
  });

  it('sets isError when the API call fails', async () => {
    vi.mocked(getCharacterRelationships).mockRejectedValue(new Error('Not found'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCharacterRelationships('transformers', 'bad-slug'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Not found');
  });
});
