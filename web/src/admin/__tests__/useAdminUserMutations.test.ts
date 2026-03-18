import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useAdminUserMutations } from '../hooks/useAdminUserMutations';

vi.mock('@/admin/api', () => ({
  patchUserRole: vi.fn(),
  deactivateUser: vi.fn(),
  reactivateUser: vi.fn(),
  gdprPurgeUser: vi.fn(),
}));

import { patchUserRole, deactivateUser, reactivateUser, gdprPurgeUser } from '@/admin/api';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    wrapper: function Wrapper({ children }: { children: React.ReactNode }) {
      return createElement(QueryClientProvider, { client: queryClient }, children);
    },
    queryClient,
  };
}

const mockUserRow = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  display_name: 'Test User',
  avatar_url: null,
  role: 'curator' as const,
  deactivated_at: null,
  deleted_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
};

describe('useAdminUserMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('patchRole', () => {
    it('calls patchUserRole with correct args', async () => {
      vi.mocked(patchUserRole).mockResolvedValue(mockUserRow);
      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useAdminUserMutations(), { wrapper });

      act(() => {
        result.current.patchRole.mutate({ id: mockUserRow.id, role: 'admin' });
      });

      await waitFor(() => expect(result.current.patchRole.isSuccess).toBe(true));
      expect(patchUserRole).toHaveBeenCalledWith(mockUserRow.id, 'admin');
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'users'] });
    });

    it('surfaces errors from the API', async () => {
      vi.mocked(patchUserRole).mockRejectedValue(new Error('Network error'));
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => useAdminUserMutations(), { wrapper });

      act(() => {
        result.current.patchRole.mutate({ id: mockUserRow.id, role: 'admin' });
      });

      await waitFor(() => expect(result.current.patchRole.isError).toBe(true));
      expect(result.current.patchRole.error?.message).toBe('Network error');
    });
  });

  describe('deactivate', () => {
    it('calls deactivateUser and invalidates cache', async () => {
      vi.mocked(deactivateUser).mockResolvedValue({ ...mockUserRow, deactivated_at: '2026-03-18T00:00:00.000Z' });
      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useAdminUserMutations(), { wrapper });

      act(() => {
        result.current.deactivate.mutate(mockUserRow.id);
      });

      await waitFor(() => expect(result.current.deactivate.isSuccess).toBe(true));
      expect(deactivateUser).toHaveBeenCalledWith(mockUserRow.id);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'users'] });
    });
  });

  describe('reactivate', () => {
    it('calls reactivateUser and invalidates cache', async () => {
      vi.mocked(reactivateUser).mockResolvedValue(mockUserRow);
      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useAdminUserMutations(), { wrapper });

      act(() => {
        result.current.reactivate.mutate(mockUserRow.id);
      });

      await waitFor(() => expect(result.current.reactivate.isSuccess).toBe(true));
      expect(reactivateUser).toHaveBeenCalledWith(mockUserRow.id);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'users'] });
    });
  });

  describe('purge', () => {
    it('calls gdprPurgeUser and invalidates cache', async () => {
      vi.mocked(gdprPurgeUser).mockResolvedValue(undefined);
      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useAdminUserMutations(), { wrapper });

      act(() => {
        result.current.purge.mutate(mockUserRow.id);
      });

      await waitFor(() => expect(result.current.purge.isSuccess).toBe(true));
      expect(gdprPurgeUser).toHaveBeenCalledWith(mockUserRow.id);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'users'] });
    });

    it('surfaces errors from the API', async () => {
      vi.mocked(gdprPurgeUser).mockRejectedValue(new Error('Server error'));
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => useAdminUserMutations(), { wrapper });

      act(() => {
        result.current.purge.mutate(mockUserRow.id);
      });

      await waitFor(() => expect(result.current.purge.isError).toBe(true));
      expect(result.current.purge.error?.message).toBe('Server error');
    });
  });
});
