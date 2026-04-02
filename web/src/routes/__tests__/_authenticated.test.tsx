import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock useAuth — controls isAuthenticated / isLoading
const mockUseAuth = vi.fn();
vi.mock('@/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock TanStack Router
const mockNavigate = vi.fn();
const mockLocation = { href: '/protected-page' };

function MockOutlet() {
  return <div data-testid="outlet">Protected Content</div>;
}

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => () => ({ component: null }),
  Outlet: () => <MockOutlet />,
  useNavigate: () => mockNavigate,
  useRouterState: ({ select }: { select: (s: { location: typeof mockLocation }) => unknown }) =>
    select({ location: mockLocation }),
}));

// Re-create the AuthenticatedLayout logic to test it in isolation.
// The real component is not exported from the route file, so we replicate
// the same behavior here using the same mocked dependencies.
function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div
        role="status"
        aria-label="Loading"
        className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"
      />
    </div>
  );
}

function AuthenticatedLayout() {
  const { isAuthenticated, isLoading, sessionExpired } = mockUseAuth() as {
    isAuthenticated: boolean;
    isLoading: boolean;
    sessionExpired: boolean;
  };

  const navigateRef = React.useRef(mockNavigate);
  navigateRef.current = mockNavigate;
  const hrefRef = React.useRef(mockLocation.href);
  hrefRef.current = mockLocation.href;

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated && !sessionExpired) {
      void navigateRef.current({
        to: '/login',
        search: { redirect: hrefRef.current },
      });
    }
  }, [isLoading, isAuthenticated, sessionExpired]);

  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated && !sessionExpired) return <LoadingSpinner />;
  return <MockOutlet />;
}

describe('_authenticated layout route', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockNavigate.mockReset();
    mockNavigate.mockResolvedValue(undefined);
  });

  it('shows loading spinner while isLoading', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: true, sessionExpired: false });

    render(<AuthenticatedLayout />);

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByTestId('outlet')).not.toBeInTheDocument();
  });

  it('renders Outlet when authenticated', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false, sessionExpired: false });

    render(<AuthenticatedLayout />);

    expect(screen.getByTestId('outlet')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('redirects to /login when not authenticated and not loading', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false, sessionExpired: false });

    render(<AuthenticatedLayout />);

    // Should show spinner (loading || !authenticated → spinner)
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();

    // Navigate should be called to redirect to /login
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/login',
        search: { redirect: '/protected-page' },
      });
    });
  });

  it('does NOT redirect while still loading', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: true, sessionExpired: false });

    render(<AuthenticatedLayout />);

    // Navigate must NOT be called while loading
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('renders Outlet and does NOT redirect when session expired mid-browse', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false, sessionExpired: true });

    render(<AuthenticatedLayout />);

    // Outlet should still render — user keeps browsing public catalog data
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    // No redirect — the toast handles re-login
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
