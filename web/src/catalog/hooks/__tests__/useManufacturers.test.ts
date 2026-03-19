import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useManufacturers } from '../useManufacturers';

vi.mock('@/catalog/api', () => ({
  listManufacturerStats: vi.fn(),
}));

import { listManufacturerStats } from '@/catalog/api';

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

const mockStats = {
  data: [
    {
      slug: 'hasbro',
      name: 'Hasbro',
      is_official_licensee: true,
      country: 'United States',
      item_count: 42,
      toy_line_count: 5,
      franchise_count: 2,
    },
  ],
};

describe('useManufacturers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches manufacturer stats and returns data', async () => {
    vi.mocked(listManufacturerStats).mockResolvedValue(mockStats);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useManufacturers(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockStats);
    expect(listManufacturerStats).toHaveBeenCalledOnce();
  });

  it('uses the correct queryKey', async () => {
    vi.mocked(listManufacturerStats).mockResolvedValue(mockStats);
    const { wrapper, queryClient } = createWrapper();

    renderHook(() => useManufacturers(), { wrapper });

    await waitFor(() => {
      const cache = queryClient.getQueryCache().findAll();
      expect(cache).toHaveLength(1);
      expect(cache[0].queryKey).toEqual(['catalog', 'manufacturers', 'stats']);
    });
  });

  it('sets isError when the API call fails', async () => {
    vi.mocked(listManufacturerStats).mockRejectedValue(new Error('Network error'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useManufacturers(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Network error');
  });
});
