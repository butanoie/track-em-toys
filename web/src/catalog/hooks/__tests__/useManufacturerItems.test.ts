import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useManufacturerItems } from '../useManufacturerItems';

vi.mock('@/catalog/api', () => ({
  listManufacturerItems: vi.fn(),
}));

import { listManufacturerItems } from '@/catalog/api';

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

const mockItemList = {
  data: [
    {
      id: 'item-1',
      name: 'MP-44 Optimus Prime',
      slug: 'mp-44-optimus-prime',
      franchise: { slug: 'transformers', name: 'Transformers' },
      characters: [
        { slug: 'optimus-prime', name: 'Optimus Prime', appearance_slug: 'optimus-prime-g1', is_primary: true },
      ],
      manufacturer: { slug: 'hasbro', name: 'Hasbro' },
      toy_line: { slug: 'masterpiece', name: 'Masterpiece' },
      thumbnail_url: null,
      size_class: 'Leader',
      year_released: 2019,
      is_third_party: false,
      data_quality: 'verified' as const,
    },
  ],
  page: 1,
  limit: 20,
  total_count: 1,
};

describe('useManufacturerItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches items scoped to manufacturer', async () => {
    vi.mocked(listManufacturerItems).mockResolvedValue(mockItemList);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useManufacturerItems('hasbro', {}), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockItemList);
    expect(listManufacturerItems).toHaveBeenCalledWith({ manufacturer: 'hasbro', filters: {}, page: undefined, limit: undefined });
  });

  it('includes filters and cursor in query key', async () => {
    vi.mocked(listManufacturerItems).mockResolvedValue(mockItemList);
    const { wrapper, queryClient } = createWrapper();
    const filters = { franchise: 'transformers' };

    renderHook(() => useManufacturerItems('hasbro', filters, 2), { wrapper });

    await waitFor(() => {
      const cache = queryClient.getQueryCache().findAll();
      expect(cache).toHaveLength(1);
      expect(cache[0].queryKey).toEqual([
        'catalog',
        'manufacturer-items',
        'hasbro',
        { franchise: 'transformers' },
        2,
        20,
      ]);
    });
  });

  it('sets isError when the API call fails', async () => {
    vi.mocked(listManufacturerItems).mockRejectedValue(new Error('Server error'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useManufacturerItems('hasbro', {}), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
