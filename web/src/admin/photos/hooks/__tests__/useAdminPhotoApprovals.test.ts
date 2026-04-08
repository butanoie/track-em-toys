import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useAdminPhotoApprovals } from '../useAdminPhotoApprovals';

vi.mock('@/admin/photos/api', () => ({
  listPendingPhotos: vi.fn(),
}));

import { listPendingPhotos } from '@/admin/photos/api';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

const emptyResponse = { photos: [], total_count: 0 };

describe('useAdminPhotoApprovals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the pending photo list on success', async () => {
    vi.mocked(listPendingPhotos).mockResolvedValue(emptyResponse);
    const wrapper = createWrapper();

    const { result } = renderHook(() => useAdminPhotoApprovals(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(emptyResponse);
    expect(listPendingPhotos).toHaveBeenCalledTimes(1);
  });

  it('surfaces errors from the API', async () => {
    vi.mocked(listPendingPhotos).mockRejectedValue(new Error('500'));
    const wrapper = createWrapper();

    const { result } = renderHook(() => useAdminPhotoApprovals(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('500');
  });
});
