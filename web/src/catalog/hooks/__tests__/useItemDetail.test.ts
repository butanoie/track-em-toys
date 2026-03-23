import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useItemDetail } from '../useItemDetail';

vi.mock('@/catalog/api', () => ({
  getCatalogItemDetail: vi.fn(),
}));

import { getCatalogItemDetail } from '@/catalog/api';

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

const mockItemDetail = {
  id: 'i-1',
  slug: 'optimus-prime',
  name: 'Optimus Prime',
  franchise: { slug: 'transformers', name: 'Transformers' },
  characters: [
    {
      slug: 'optimus-prime',
      name: 'Optimus Prime',
      appearance_slug: 'optimus-prime-g1',
      appearance_name: 'G1 Cartoon',
      appearance_source_media: null,
      appearance_source_name: null,
      is_primary: true,
    },
  ],
  manufacturer: { slug: 'hasbro', name: 'Hasbro' },
  toy_line: { slug: 'legacy', name: 'Legacy' },
  thumbnail_url: null,
  size_class: 'Leader',
  year_released: 2024,
  is_third_party: false,
  data_quality: 'verified' as const,
  description: null,
  barcode: null,
  sku: null,
  product_code: null,
  photos: [],
  metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('useItemDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches item detail when slug is provided', async () => {
    vi.mocked(getCatalogItemDetail).mockResolvedValue(mockItemDetail);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useItemDetail('transformers', 'optimus-prime'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getCatalogItemDetail).toHaveBeenCalledWith('transformers', 'optimus-prime');
    expect(result.current.data).toEqual(mockItemDetail);
  });

  it('does not fetch when slug is undefined (enabled: false)', () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useItemDetail('transformers', undefined), {
      wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(getCatalogItemDetail).not.toHaveBeenCalled();
  });

  it('uses the correct queryKey structure', async () => {
    vi.mocked(getCatalogItemDetail).mockResolvedValue(mockItemDetail);
    const { wrapper, queryClient } = createWrapper();

    renderHook(() => useItemDetail('transformers', 'optimus-prime'), { wrapper });

    await waitFor(() => {
      const cache = queryClient.getQueryCache().findAll();
      expect(cache).toHaveLength(1);
      expect(cache[0].queryKey).toEqual(['catalog', 'items', 'transformers', 'optimus-prime']);
    });
  });

  it('includes undefined slug in queryKey when disabled', () => {
    const { wrapper, queryClient } = createWrapper();

    renderHook(() => useItemDetail('transformers', undefined), { wrapper });

    const cache = queryClient.getQueryCache().findAll();
    expect(cache).toHaveLength(1);
    expect(cache[0].queryKey).toEqual(['catalog', 'items', 'transformers', undefined]);
  });

  it('sets isError when the API call fails', async () => {
    vi.mocked(getCatalogItemDetail).mockRejectedValue(new Error('Not found'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useItemDetail('transformers', 'bad-slug'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Not found');
  });
});
