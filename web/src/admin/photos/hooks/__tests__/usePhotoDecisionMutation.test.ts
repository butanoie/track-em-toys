import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { usePhotoDecisionMutation } from '../usePhotoDecisionMutation';

vi.mock('@/admin/photos/api', () => ({
  decidePhoto: vi.fn(),
}));

import { decidePhoto, type DecideResult } from '@/admin/photos/api';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    wrapper: function Wrapper({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client: queryClient }, children);
    },
    queryClient,
  };
}

const photoId = '550e8400-e29b-41d4-a716-446655440000';

const successResult: DecideResult = {
  conflict: false,
  data: {
    id: photoId,
    item_id: '660e8400-e29b-41d4-a716-446655440001',
    url: 'test-pending/abc.webp',
    status: 'approved',
    visibility: 'public',
    rejection_reason_code: null,
    rejection_reason_text: null,
    updated_at: '2026-04-07T00:00:00.000Z',
  },
};

const conflictResult: DecideResult = {
  conflict: true,
  current_status: 'approved',
  error: 'Photo state has changed',
};

describe('usePhotoDecisionMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('approves a photo and invalidates the admin/photos cache prefix', async () => {
    vi.mocked(decidePhoto).mockResolvedValue(successResult);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => usePhotoDecisionMutation(), { wrapper });

    act(() => {
      result.current.mutate({ id: photoId, body: { status: 'approved' } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(decidePhoto).toHaveBeenCalledWith(photoId, { status: 'approved' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'photos'] });
    // Broad invalidation refreshes both ['admin','photos','pending'] and
    // ['admin','photos','pending-count'] in a single call.
  });

  it('returns a conflict result without throwing', async () => {
    vi.mocked(decidePhoto).mockResolvedValue(conflictResult);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => usePhotoDecisionMutation(), { wrapper });

    act(() => {
      result.current.mutate({ id: photoId, body: { status: 'approved' } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(conflictResult);
  });

  it('surfaces non-409 errors', async () => {
    vi.mocked(decidePhoto).mockRejectedValue(new Error('Server error'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => usePhotoDecisionMutation(), { wrapper });

    act(() => {
      result.current.mutate({ id: photoId, body: { status: 'approved' } });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Server error');
  });
});
