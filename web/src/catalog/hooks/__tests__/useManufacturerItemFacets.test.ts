import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useManufacturerItemFacets } from '../useManufacturerItemFacets';

vi.mock('@/catalog/api', () => ({
  getManufacturerItemFacets: vi.fn(),
}));

import { getManufacturerItemFacets } from '@/catalog/api';

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
  franchises: [{ value: 'transformers', label: 'Transformers', count: 10 }],
  size_classes: [{ value: 'Leader', label: 'Leader', count: 5 }],
  toy_lines: [{ value: 'masterpiece', label: 'Masterpiece', count: 8 }],
  continuity_families: [{ value: 'g1', label: 'Generation 1', count: 7 }],
  is_third_party: [
    { value: 'false', label: 'Official', count: 8 },
    { value: 'true', label: 'Third Party', count: 2 },
  ],
};

describe('useManufacturerItemFacets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches facets scoped to manufacturer', async () => {
    vi.mocked(getManufacturerItemFacets).mockResolvedValue(mockFacets);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useManufacturerItemFacets('hasbro'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockFacets);
    expect(getManufacturerItemFacets).toHaveBeenCalledWith('hasbro', undefined);
  });

  it('includes filters in query key', async () => {
    vi.mocked(getManufacturerItemFacets).mockResolvedValue(mockFacets);
    const { wrapper, queryClient } = createWrapper();
    const filters = { franchise: 'transformers' };

    renderHook(() => useManufacturerItemFacets('hasbro', filters), { wrapper });

    await waitFor(() => {
      const cache = queryClient.getQueryCache().findAll();
      expect(cache).toHaveLength(1);
      expect(cache[0].queryKey).toEqual([
        'catalog',
        'manufacturer-items',
        'hasbro',
        'facets',
        { franchise: 'transformers' },
      ]);
    });
  });

  it('sets isError when the API call fails', async () => {
    vi.mocked(getManufacturerItemFacets).mockRejectedValue(new Error('Server error'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useManufacturerItemFacets('hasbro'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
