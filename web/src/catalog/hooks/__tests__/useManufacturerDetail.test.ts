import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useManufacturerDetail } from '../useManufacturerDetail';

vi.mock('@/catalog/api', () => ({
  getManufacturerDetail: vi.fn(),
}));

import { getManufacturerDetail } from '@/catalog/api';

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

const mockDetail = {
  id: 'mfr-1',
  name: 'Hasbro',
  slug: 'hasbro',
  is_official_licensee: true,
  country: 'United States',
  website_url: 'https://hasbro.com',
  aliases: ['HBR'],
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('useManufacturerDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches manufacturer detail by slug', async () => {
    vi.mocked(getManufacturerDetail).mockResolvedValue(mockDetail);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useManufacturerDetail('hasbro'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockDetail);
    expect(getManufacturerDetail).toHaveBeenCalledWith('hasbro');
  });

  it('uses slug in the queryKey', async () => {
    vi.mocked(getManufacturerDetail).mockResolvedValue(mockDetail);
    const { wrapper, queryClient } = createWrapper();

    renderHook(() => useManufacturerDetail('hasbro'), { wrapper });

    await waitFor(() => {
      const cache = queryClient.getQueryCache().findAll();
      expect(cache).toHaveLength(1);
      expect(cache[0].queryKey).toEqual(['catalog', 'manufacturers', 'hasbro']);
    });
  });

  it('sets isError when the API call fails', async () => {
    vi.mocked(getManufacturerDetail).mockRejectedValue(new Error('Not found'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useManufacturerDetail('bad'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
