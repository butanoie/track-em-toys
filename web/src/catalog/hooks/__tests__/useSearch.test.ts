import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useSearch } from '../useSearch';

vi.mock('@/catalog/api', () => ({
  searchCatalog: vi.fn(),
}));

import { searchCatalog } from '@/catalog/api';

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

const mockSearchResponse = {
  data: [
    {
      entity_type: 'item' as const,
      id: 'i-1',
      name: 'MP-44 Optimus Prime',
      slug: 'mp-44-optimus-prime',
      franchise: { slug: 'transformers', name: 'Transformers' },
      continuity_family: null,
      character: { slug: 'optimus-prime', name: 'Optimus Prime' },
      manufacturer: { slug: 'takara-tomy', name: 'Takara Tomy' },
      toy_line: { slug: 'masterpiece', name: 'Masterpiece' },
      thumbnail_url: null,
      size_class: 'Leader',
      year_released: 2019,
      product_code: 'MP-44',
      is_third_party: false,
      data_quality: 'verified',
    },
  ],
  page: 1,
  limit: 20,
  total_count: 1,
  character_count: 0,
  item_count: 1,
};

describe('useSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls searchCatalog with correct params', async () => {
    vi.mocked(searchCatalog).mockResolvedValue(mockSearchResponse);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useSearch('optimus', 1), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(searchCatalog).toHaveBeenCalledWith({
      q: 'optimus',
      page: 1,
      franchise: undefined,
      limit: undefined,
      type: undefined,
    });
    expect(result.current.data).toEqual(mockSearchResponse);
  });

  it('passes franchise filter when provided', async () => {
    vi.mocked(searchCatalog).mockResolvedValue(mockSearchResponse);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useSearch('optimus', 1, 'transformers'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(searchCatalog).toHaveBeenCalledWith({
      q: 'optimus',
      page: 1,
      franchise: 'transformers',
      limit: undefined,
      type: undefined,
    });
  });

  it('is disabled when q is empty', async () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useSearch('', 1), { wrapper });

    // Should not fire the query
    expect(searchCatalog).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('is disabled when q is whitespace-only', async () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useSearch('   ', 1), { wrapper });

    expect(searchCatalog).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('uses the correct queryKey structure', async () => {
    vi.mocked(searchCatalog).mockResolvedValue(mockSearchResponse);
    const { wrapper, queryClient } = createWrapper();

    renderHook(() => useSearch('optimus', 2, 'transformers'), { wrapper });

    await waitFor(() => {
      const cache = queryClient.getQueryCache().findAll();
      expect(cache).toHaveLength(1);
      expect(cache[0].queryKey).toEqual(['catalog', 'search', 'optimus', 2, 20, 'transformers', null]);
    });
  });

  it('sets isError when the API call fails', async () => {
    vi.mocked(searchCatalog).mockRejectedValue(new Error('Server error'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useSearch('optimus', 1), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Server error');
  });
});
