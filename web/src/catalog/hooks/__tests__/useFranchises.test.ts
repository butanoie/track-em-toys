import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useFranchises } from '../useFranchises';

vi.mock('@/catalog/api', () => ({
  listFranchiseStats: vi.fn(),
}));

import { listFranchiseStats } from '@/catalog/api';

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

const mockFranchiseStats = {
  data: [
    {
      slug: 'transformers',
      name: 'Transformers',
      sort_order: 1,
      notes: null,
      item_count: 42,
      continuity_family_count: 3,
      manufacturer_count: 5,
    },
    {
      slug: 'gi-joe',
      name: 'G.I. Joe',
      sort_order: 2,
      notes: null,
      item_count: 18,
      continuity_family_count: 1,
      manufacturer_count: 2,
    },
  ],
};

describe('useFranchises', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches franchise stats and returns data', async () => {
    vi.mocked(listFranchiseStats).mockResolvedValue(mockFranchiseStats);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useFranchises(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockFranchiseStats);
    expect(listFranchiseStats).toHaveBeenCalledOnce();
  });

  it('uses the correct queryKey', async () => {
    vi.mocked(listFranchiseStats).mockResolvedValue(mockFranchiseStats);
    const { wrapper, queryClient } = createWrapper();

    renderHook(() => useFranchises(), { wrapper });

    await waitFor(() => {
      const cache = queryClient.getQueryCache().findAll();
      expect(cache).toHaveLength(1);
      expect(cache[0].queryKey).toEqual(['catalog', 'franchises', 'stats']);
    });
  });

  it('sets isError when the API call fails', async () => {
    vi.mocked(listFranchiseStats).mockRejectedValue(new Error('Network error'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useFranchises(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Network error');
  });
});
