import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useItemFacets } from '../useItemFacets';

vi.mock('@/catalog/api', () => ({
  getItemFacets: vi.fn(),
}));

import { getItemFacets } from '@/catalog/api';

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
  manufacturers: [
    { value: 'hasbro', label: 'Hasbro', count: 30 },
    { value: 'takara-tomy', label: 'Takara Tomy', count: 12 },
  ],
  size_classes: [
    { value: 'deluxe', label: 'Deluxe', count: 25 },
    { value: 'voyager', label: 'Voyager', count: 10 },
  ],
  toy_lines: [],
  continuity_families: [],
  is_third_party: [
    { value: 'false', label: 'Official', count: 38 },
    { value: 'true', label: 'Third Party', count: 4 },
  ],
};

describe('useItemFacets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls getItemFacets with franchise and no filters', async () => {
    vi.mocked(getItemFacets).mockResolvedValue(mockFacets);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useItemFacets('transformers'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getItemFacets).toHaveBeenCalledWith('transformers', undefined);
    expect(result.current.data).toEqual(mockFacets);
  });

  it('passes filters to getItemFacets', async () => {
    vi.mocked(getItemFacets).mockResolvedValue(mockFacets);
    const { wrapper } = createWrapper();
    const filters = { manufacturer: 'hasbro', size_class: 'deluxe' };

    const { result } = renderHook(() => useItemFacets('transformers', filters), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getItemFacets).toHaveBeenCalledWith('transformers', filters);
  });

  it('uses the correct queryKey structure', async () => {
    vi.mocked(getItemFacets).mockResolvedValue(mockFacets);
    const { wrapper, queryClient } = createWrapper();
    const filters = { manufacturer: 'hasbro' };

    renderHook(() => useItemFacets('transformers', filters), { wrapper });

    await waitFor(() => {
      const cache = queryClient.getQueryCache().findAll();
      expect(cache).toHaveLength(1);
      expect(cache[0].queryKey).toEqual(['catalog', 'items', 'transformers', 'facets', { manufacturer: 'hasbro' }]);
    });
  });

  it('uses empty object for filters in queryKey when omitted', async () => {
    vi.mocked(getItemFacets).mockResolvedValue(mockFacets);
    const { wrapper, queryClient } = createWrapper();

    renderHook(() => useItemFacets('transformers'), { wrapper });

    await waitFor(() => {
      const cache = queryClient.getQueryCache().findAll();
      expect(cache).toHaveLength(1);
      expect(cache[0].queryKey).toEqual(['catalog', 'items', 'transformers', 'facets', {}]);
    });
  });

  it('sets isError when the API call fails', async () => {
    vi.mocked(getItemFacets).mockRejectedValue(new Error('Failed to load facets'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useItemFacets('transformers'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Failed to load facets');
  });
});
