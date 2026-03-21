import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useCharacterDetail } from '../useCharacterDetail';

vi.mock('@/catalog/api', () => ({
  getCharacterDetail: vi.fn(),
}));

import { getCharacterDetail } from '@/catalog/api';

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

const mockCharacterDetail = {
  id: 'c-1',
  name: 'Optimus Prime',
  slug: 'optimus-prime',
  franchise: { slug: 'transformers', name: 'Transformers' },
  faction: { slug: 'autobots', name: 'Autobots' },
  continuity_family: { slug: 'g1', name: 'Generation 1' },
  character_type: 'Transformer',
  alt_mode: 'Truck',
  is_combined_form: false,
  sub_groups: [{ slug: 'convoy', name: 'Convoy' }],
  appearances: [
    {
      id: 'a-1',
      slug: 'g1-cartoon',
      name: 'G1 Cartoon',
      source_media: 'Animated Series',
      source_name: 'The Transformers',
      year_start: 1984,
      year_end: 1987,
      description: null,
    },
  ],
  metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('useCharacterDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches character detail when slug is provided', async () => {
    vi.mocked(getCharacterDetail).mockResolvedValue(mockCharacterDetail);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCharacterDetail('transformers', 'optimus-prime'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getCharacterDetail).toHaveBeenCalledWith('transformers', 'optimus-prime');
    expect(result.current.data).toEqual(mockCharacterDetail);
  });

  it('does not fetch when slug is undefined', () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCharacterDetail('transformers', undefined), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(getCharacterDetail).not.toHaveBeenCalled();
  });

  it('does not fetch when franchise is empty', () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCharacterDetail('', 'optimus-prime'), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(getCharacterDetail).not.toHaveBeenCalled();
  });

  it('uses the correct queryKey structure', async () => {
    vi.mocked(getCharacterDetail).mockResolvedValue(mockCharacterDetail);
    const { wrapper, queryClient } = createWrapper();

    renderHook(() => useCharacterDetail('transformers', 'optimus-prime'), { wrapper });

    await waitFor(() => {
      const cache = queryClient.getQueryCache().findAll();
      expect(cache).toHaveLength(1);
      expect(cache[0].queryKey).toEqual(['catalog', 'characters', 'transformers', 'optimus-prime']);
    });
  });

  it('sets isError when the API call fails', async () => {
    vi.mocked(getCharacterDetail).mockRejectedValue(new Error('Server error'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCharacterDetail('transformers', 'optimus-prime'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Server error');
  });
});
