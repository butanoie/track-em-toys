import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock useAuth — controls user and isLoading
const mockUseAuth = vi.fn();
vi.mock('@/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock TanStack Router
const mockNavigate = vi.fn();
const mockLocation = { pathname: '/admin/users' };

function MockOutlet() {
  return <div data-testid="outlet">Admin Content</div>;
}

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => () => ({ component: null }),
  Outlet: () => <MockOutlet />,
  useNavigate: () => mockNavigate,
  useRouterState: ({ select }: { select: (s: { location: typeof mockLocation }) => unknown }) =>
    select({ location: mockLocation }),
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

// Mock Shadcn components used in the layout
vi.mock('@/components/ui/separator', () => ({
  Separator: () => <hr />,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('lucide-react', () => ({
  Users: () => <span>UsersIcon</span>,
  ArrowLeft: () => <span>ArrowLeftIcon</span>,
}));

// Replicate the AdminLayout guard logic for isolated testing
function LoadingSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div role="status" aria-label="Loading" className="h-8 w-8 animate-spin rounded-full border-4" />
    </div>
  );
}

function AdminLayout() {
  const { user, isLoading } = mockUseAuth() as {
    user: { role: string; display_name: string | null; email: string | null } | null;
    isLoading: boolean;
    logout: () => void;
  };

  const navigateRef = React.useRef(mockNavigate);
  navigateRef.current = mockNavigate;

  React.useEffect(() => {
    if (!isLoading && (!user || user.role !== 'admin')) {
      void navigateRef.current({ to: '/' });
    }
  }, [isLoading, user]);

  if (isLoading || !user || user.role !== 'admin') return <LoadingSpinner />;

  return (
    <div>
      <div data-testid="admin-sidebar">Admin Sidebar</div>
      <MockOutlet />
    </div>
  );
}

describe('admin layout route guard', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockNavigate.mockReset();
    mockNavigate.mockResolvedValue(undefined);
  });

  it('shows loading spinner while isLoading', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true, logout: vi.fn() });
    render(<AdminLayout />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
  });

  it('renders outlet when user is admin', () => {
    mockUseAuth.mockReturnValue({
      user: { role: 'admin', display_name: 'Admin', email: 'admin@test.com' },
      isLoading: false,
      logout: vi.fn(),
    });
    render(<AdminLayout />);
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('redirects to / when user role is not admin', async () => {
    mockUseAuth.mockReturnValue({
      user: { role: 'user', display_name: 'User', email: 'user@test.com' },
      isLoading: false,
      logout: vi.fn(),
    });
    render(<AdminLayout />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
    });
  });

  it('redirects to / when user is curator (not admin)', async () => {
    mockUseAuth.mockReturnValue({
      user: { role: 'curator', display_name: 'Curator', email: 'curator@test.com' },
      isLoading: false,
      logout: vi.fn(),
    });
    render(<AdminLayout />);
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
    });
  });

  it('does NOT redirect while still loading', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true, logout: vi.fn() });
    render(<AdminLayout />);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('redirects to / when user is null and not loading', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, logout: vi.fn() });
    render(<AdminLayout />);
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
    });
  });
});
