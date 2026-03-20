import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useCharacters } from '../useCharacters';

vi.mock('@/catalog/api', () => ({
  listCharacters: vi.fn(),
}));

import { listCharacters } from '@/catalog/api';

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

const mockCharacterList = {
  data: [
    {
      id: 'c-1',
      slug: 'optimus-prime',
      name: 'Optimus Prime',
      franchise: { slug: 'transformers', name: 'Transformers' },
      faction: { slug: 'autobot', name: 'Autobot' },
      continuity_family: { slug: 'g1', name: 'Generation 1' },
      character_type: 'Transformer',
      alt_mode: 'semi-truck',
      is_combined_form: false,
    },
  ],
  next_cursor: 'abc123',
  total_count: 42,
};

describe('useCharacters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls listCharacters with correct params (no filters, no cursor)', async () => {
    vi.mocked(listCharacters).mockResolvedValue(mockCharacterList);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCharacters('transformers'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listCharacters).toHaveBeenCalledWith({
      franchise: 'transformers',
      filters: undefined,
      cursor: undefined,
    });
    expect(result.current.data).toEqual(mockCharacterList);
  });

  it('passes filters and cursor to the API function', async () => {
    vi.mocked(listCharacters).mockResolvedValue(mockCharacterList);
    const { wrapper } = createWrapper();
    const filters = { continuity_family: 'g1', faction: 'autobot' };

    const { result } = renderHook(() => useCharacters('transformers', filters, 'cursor-xyz'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listCharacters).toHaveBeenCalledWith({
      franchise: 'transformers',
      filters,
      cursor: 'cursor-xyz',
    });
  });

  it('uses the correct queryKey structure', async () => {
    vi.mocked(listCharacters).mockResolvedValue(mockCharacterList);
    const { wrapper, queryClient } = createWrapper();
    const filters = { faction: 'autobot' };

    renderHook(() => useCharacters('transformers', filters, 'cur1'), { wrapper });

    await waitFor(() => {
      const cache = queryClient.getQueryCache().findAll();
      expect(cache).toHaveLength(1);
      expect(cache[0].queryKey).toEqual(['catalog', 'characters', 'transformers', { faction: 'autobot' }, 'cur1']);
    });
  });

  it('uses empty object for filters and null for cursor in queryKey when omitted', async () => {
    vi.mocked(listCharacters).mockResolvedValue(mockCharacterList);
    const { wrapper, queryClient } = createWrapper();

    renderHook(() => useCharacters('transformers'), { wrapper });

    await waitFor(() => {
      const cache = queryClient.getQueryCache().findAll();
      expect(cache).toHaveLength(1);
      expect(cache[0].queryKey).toEqual(['catalog', 'characters', 'transformers', {}, null]);
    });
  });

  it('sets isError when the API call fails', async () => {
    vi.mocked(listCharacters).mockRejectedValue(new Error('Server error'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCharacters('transformers'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Server error');
  });
});
