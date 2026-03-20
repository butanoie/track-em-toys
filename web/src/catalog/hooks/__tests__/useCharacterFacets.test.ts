import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useCharacterFacets } from '../useCharacterFacets';

vi.mock('@/catalog/api', () => ({
  getCharacterFacets: vi.fn(),
}));

import { getCharacterFacets } from '@/catalog/api';

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

const mockFacets = {
  factions: [{ value: 'autobot', label: 'Autobot', count: 50 }],
  character_types: [{ value: 'Transformer', label: 'Transformer', count: 100 }],
  sub_groups: [{ value: 'dinobots', label: 'Dinobots', count: 5 }],
};

describe('useCharacterFacets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls getCharacterFacets with franchise and no filters', async () => {
    vi.mocked(getCharacterFacets).mockResolvedValue(mockFacets);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCharacterFacets('transformers'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getCharacterFacets).toHaveBeenCalledWith('transformers', undefined);
    expect(result.current.data).toEqual(mockFacets);
  });

  it('passes filters to the API function', async () => {
    vi.mocked(getCharacterFacets).mockResolvedValue(mockFacets);
    const { wrapper } = createWrapper();
    const filters = { continuity_family: 'g1', faction: 'autobot' };

    const { result } = renderHook(() => useCharacterFacets('transformers', filters), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getCharacterFacets).toHaveBeenCalledWith('transformers', filters);
  });

  it('uses the correct queryKey structure', async () => {
    vi.mocked(getCharacterFacets).mockResolvedValue(mockFacets);
    const { wrapper, queryClient } = createWrapper();
    const filters = { faction: 'autobot' };

    renderHook(() => useCharacterFacets('transformers', filters), { wrapper });

    await waitFor(() => {
      const cache = queryClient.getQueryCache().findAll();
      expect(cache).toHaveLength(1);
      expect(cache[0].queryKey).toEqual(['catalog', 'characters', 'transformers', 'facets', { faction: 'autobot' }]);
    });
  });

  it('uses empty object for filters in queryKey when omitted', async () => {
    vi.mocked(getCharacterFacets).mockResolvedValue(mockFacets);
    const { wrapper, queryClient } = createWrapper();

    renderHook(() => useCharacterFacets('transformers'), { wrapper });

    await waitFor(() => {
      const cache = queryClient.getQueryCache().findAll();
      expect(cache).toHaveLength(1);
      expect(cache[0].queryKey).toEqual(['catalog', 'characters', 'transformers', 'facets', {}]);
    });
  });

  it('sets isError when the API call fails', async () => {
    vi.mocked(getCharacterFacets).mockRejectedValue(new Error('Server error'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCharacterFacets('transformers'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Server error');
  });
});
