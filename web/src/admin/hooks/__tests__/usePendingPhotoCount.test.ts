import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { usePendingPhotoCount } from '../usePendingPhotoCount';

vi.mock('@/admin/photos/api', () => ({
  getPendingPhotoCount: vi.fn(),
}));

import { getPendingPhotoCount } from '@/admin/photos/api';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    wrapper: function Wrapper({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client: queryClient }, children);
    },
    queryClient,
  };
}

describe('usePendingPhotoCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the pending count and exposes the response', async () => {
    vi.mocked(getPendingPhotoCount).mockResolvedValue({ count: 7 });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => usePendingPhotoCount(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ count: 7 });
    expect(getPendingPhotoCount).toHaveBeenCalledTimes(1);
  });

  it('surfaces errors from the API', async () => {
    vi.mocked(getPendingPhotoCount).mockRejectedValue(new Error('Network down'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => usePendingPhotoCount(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Network down');
  });

  it('configures focus refetch with zero stale time', () => {
    // Regression guard for D14.1 #2 — a positive staleTime would silently
    // defeat refetchOnWindowFocus, so we assert the active observer's
    // options directly via a fresh mount.
    vi.mocked(getPendingPhotoCount).mockResolvedValue({ count: 0 });
    const { wrapper, queryClient } = createWrapper();
    renderHook(() => usePendingPhotoCount(), { wrapper });

    const cached = queryClient
      .getQueryCache()
      .find({ queryKey: ['admin', 'photos', 'pending-count'] });
    const options = cached?.observers[0]?.options;
    expect(options?.refetchOnWindowFocus).toBe(true);
    expect(options?.staleTime).toBe(0);
  });
});
