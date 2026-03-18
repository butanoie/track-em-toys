import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminUsersPage } from '../users/AdminUsersPage';
import { makeAdminAuthContext, mockRegularUser, mockDeactivatedUser, mockPurgedUser } from './admin-test-helpers';
import { AuthContext } from '@/auth/AuthProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-client';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from 'sonner';

// Mock TanStack Router
const mockNavigate = vi.fn();
const mockSearch = { email: undefined, role: undefined, limit: undefined, offset: undefined };

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => mockNavigate,
}));

vi.mock('@/routes/_authenticated/admin/users', () => ({
  Route: {
    useSearch: () => mockSearch,
  },
}));

// Mock admin hooks
const mockUseAdminUsers = vi.fn();
vi.mock('@/admin/hooks/useAdminUsers', () => ({
  useAdminUsers: (...args: unknown[]) => mockUseAdminUsers(...args),
}));

const mockMutations = {
  patchRole: { isPending: false, variables: undefined, mutate: vi.fn() },
  deactivate: { isPending: false, mutate: vi.fn() },
  reactivate: { isPending: false, mutate: vi.fn() },
  purge: { isPending: false, mutate: vi.fn() },
};

vi.mock('@/admin/hooks/useAdminUserMutations', () => ({
  useAdminUserMutations: () => mockMutations,
}));

function renderPage() {
  const ctx = makeAdminAuthContext();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={ctx}>
        <AdminUsersPage />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

describe('AdminUsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockResolvedValue(undefined);
  });

  it('renders loading skeleton while data is pending', () => {
    mockUseAdminUsers.mockReturnValue({ data: undefined, isPending: true, isError: false, error: null });
    renderPage();
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Manage user accounts and roles')).toBeInTheDocument();
  });

  it('renders user rows from query data', () => {
    mockUseAdminUsers.mockReturnValue({
      data: { data: [mockRegularUser, mockDeactivatedUser], total_count: 2, limit: 20, offset: 0 },
      isPending: false,
      isError: false,
      error: null,
    });
    renderPage();
    expect(screen.getByText('Regular User')).toBeInTheDocument();
    expect(screen.getByText('Deactivated User')).toBeInTheDocument();
  });

  it('renders empty state when no users match', () => {
    mockUseAdminUsers.mockReturnValue({
      data: { data: [], total_count: 0, limit: 20, offset: 0 },
      isPending: false,
      isError: false,
      error: null,
    });
    renderPage();
    expect(screen.getByText('No users found matching your filters.')).toBeInTheDocument();
  });

  it('renders error banner on query error', () => {
    mockUseAdminUsers.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('Network error'),
    });
    renderPage();
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('renders purged user with tombstone display', () => {
    mockUseAdminUsers.mockReturnValue({
      data: { data: [mockPurgedUser], total_count: 1, limit: 20, offset: 0 },
      isPending: false,
      isError: false,
      error: null,
    });
    renderPage();
    expect(screen.getByText('Deleted user')).toBeInTheDocument();
    expect(screen.getByText('Purged')).toBeInTheDocument();
  });

  it('opens confirm dialog when deactivate is clicked', async () => {
    mockUseAdminUsers.mockReturnValue({
      data: { data: [mockRegularUser], total_count: 1, limit: 20, offset: 0 },
      isPending: false,
      isError: false,
      error: null,
    });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(screen.getByText('Deactivate User')).toBeInTheDocument();
  });

  it('opens GDPR purge dialog with type-to-confirm', async () => {
    mockUseAdminUsers.mockReturnValue({
      data: { data: [mockRegularUser], total_count: 1, limit: 20, offset: 0 },
      isPending: false,
      isError: false,
      error: null,
    });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Purge' }));
    expect(screen.getByText('GDPR Purge — Permanent Deletion')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Purge User' })).toBeDisabled();
  });

  it('renders status badges correctly', () => {
    mockUseAdminUsers.mockReturnValue({
      data: { data: [mockRegularUser, mockDeactivatedUser, mockPurgedUser], total_count: 3, limit: 20, offset: 0 },
      isPending: false,
      isError: false,
      error: null,
    });
    renderPage();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Deactivated')).toBeInTheDocument();
    expect(screen.getByText('Purged')).toBeInTheDocument();
  });

  describe('mutation outcomes', () => {
    function setupWithData() {
      mockUseAdminUsers.mockReturnValue({
        data: { data: [mockRegularUser, mockDeactivatedUser], total_count: 2, limit: 20, offset: 0 },
        isPending: false,
        isError: false,
        error: null,
      });
    }

    function simulateMutationSuccess(mutationKey: 'patchRole' | 'deactivate' | 'reactivate' | 'purge') {
      const mutateCall = mockMutations[mutationKey].mutate.mock.calls[0] as [unknown, { onSuccess: () => void }];
      expect(mutateCall).toBeDefined();
      act(() => {
        mutateCall[1].onSuccess();
      });
    }

    function simulateMutationError(mutationKey: 'patchRole' | 'deactivate' | 'reactivate' | 'purge', err: Error) {
      const mutateCall = mockMutations[mutationKey].mutate.mock.calls[0] as [unknown, { onError: (e: Error) => void }];
      expect(mutateCall).toBeDefined();
      act(() => {
        mutateCall[1].onError(err);
      });
    }

    it('shows success toast on deactivate', async () => {
      setupWithData();
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      simulateMutationSuccess('deactivate');
      expect(toast.success).toHaveBeenCalledWith('user@example.com deactivated');
    });

    it('shows success toast on reactivate', async () => {
      setupWithData();
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Reactivate' }));
      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      simulateMutationSuccess('reactivate');
      expect(toast.success).toHaveBeenCalledWith('deactivated@example.com reactivated');
    });

    it('shows success toast on purge', async () => {
      setupWithData();
      renderPage();
      // Click the first Purge button (for mockRegularUser)
      await userEvent.click(screen.getAllByRole('button', { name: 'Purge' })[0]!);
      await userEvent.type(screen.getByRole('textbox'), 'DELETE');
      await userEvent.click(screen.getByRole('button', { name: 'Purge User' }));
      simulateMutationSuccess('purge');
      expect(toast.success).toHaveBeenCalledWith('User data purged permanently');
    });

    it('shows ErrorBanner for 403 business-logic error', async () => {
      setupWithData();
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      simulateMutationError(
        'deactivate',
        new ApiError(403, { error: 'Cannot perform this action on your own account' })
      );

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Cannot perform this action on your own account');
      });
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('shows ErrorBanner for 409 conflict error', async () => {
      setupWithData();
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      simulateMutationError('deactivate', new ApiError(409, { error: 'Cannot demote the last admin' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Cannot demote the last admin');
      });
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('shows error toast for transient network error', async () => {
      setupWithData();
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      simulateMutationError('deactivate', new Error('fetch failed'));
      expect(toast.error).toHaveBeenCalledWith('Action failed. Please try again.');
    });

    it('closes dialog on success', async () => {
      setupWithData();
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
      expect(screen.getByText('Deactivate User')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      simulateMutationSuccess('deactivate');
      await waitFor(() => {
        expect(screen.queryByText('Deactivate User')).not.toBeInTheDocument();
      });
    });

    it('closes dialog on banner error', async () => {
      setupWithData();
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
      expect(screen.getByText('Deactivate User')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      simulateMutationError('deactivate', new ApiError(409, { error: 'Conflict' }));
      await waitFor(() => {
        expect(screen.queryByText('Deactivate User')).not.toBeInTheDocument();
      });
    });

    it('closes dialog on transient error for non-purge action', async () => {
      setupWithData();
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
      expect(screen.getByText('Deactivate User')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      simulateMutationError('deactivate', new Error('network timeout'));
      await waitFor(() => {
        expect(screen.queryByText('Deactivate User')).not.toBeInTheDocument();
      });
    });

    it('keeps purge dialog open on transient error to preserve typed confirmation', async () => {
      setupWithData();
      renderPage();
      await userEvent.click(screen.getAllByRole('button', { name: 'Purge' })[0]!);
      expect(screen.getByText('GDPR Purge — Permanent Deletion')).toBeInTheDocument();
      await userEvent.type(screen.getByRole('textbox'), 'DELETE');
      await userEvent.click(screen.getByRole('button', { name: 'Purge User' }));
      simulateMutationError('purge', new Error('network timeout'));
      // Dialog stays open
      expect(screen.getByText('GDPR Purge — Permanent Deletion')).toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith('Action failed. Please try again.');
    });
  });
});
