import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminUsersPage } from '../users/AdminUsersPage';
import { makeAdminAuthContext, mockRegularUser, mockDeactivatedUser, mockPurgedUser } from './admin-test-helpers';
import { AuthContext } from '@/auth/AuthProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
});
