import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppHeader } from '../AppHeader';
import { AuthContext, type AuthContextValue } from '@/auth/AuthProvider';

// Mock TanStack Router
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useRouterState: (opts?: {
    select?: (s: { location: { pathname: string; search: Record<string, unknown> } }) => unknown;
  }) => {
    const state = { location: { pathname: '/', search: {} } };
    return opts?.select ? opts.select(state) : state;
  },
}));

const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  display_name: 'Test User',
  avatar_url: null,
  role: 'user' as const,
};

const mockAdmin = {
  ...mockUser,
  role: 'admin' as const,
};

function makeAuthContext(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: mockUser,
    isAuthenticated: true,
    isLoading: false,
    signInWithGoogle: vi.fn(),
    signInWithApple: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  };
}

function renderAppHeader(title: string, ctx: AuthContextValue) {
  return render(
    <AuthContext.Provider value={ctx}>
      <AppHeader title={title} />
    </AuthContext.Provider>
  );
}

describe('AppHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the title', () => {
    renderAppHeader('Test Title', makeAuthContext());
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('renders user display name', () => {
    renderAppHeader('App', makeAuthContext());
    expect(screen.getByText('Test User')).toBeInTheDocument();
  });

  it('renders email when display_name is null', () => {
    renderAppHeader('App', makeAuthContext({ user: { ...mockUser, display_name: null } }));
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  it('renders "Collector" when both display_name and email are null', () => {
    renderAppHeader('App', makeAuthContext({ user: { ...mockUser, display_name: null, email: null } }));
    expect(screen.getByText('Collector')).toBeInTheDocument();
  });

  it('renders Settings link', () => {
    renderAppHeader('App', makeAuthContext());
    const settingsLink = screen.getByText('Settings');
    expect(settingsLink).toBeInTheDocument();
    expect(settingsLink.closest('a')).toHaveAttribute('href', '/settings');
  });

  it('shows Admin link for admin users', () => {
    renderAppHeader('App', makeAuthContext({ user: mockAdmin }));
    const adminLink = screen.getByText('Admin');
    expect(adminLink).toBeInTheDocument();
    expect(adminLink.closest('a')).toHaveAttribute('href', '/admin/users');
  });

  it('hides Admin link for non-admin users', () => {
    renderAppHeader('App', makeAuthContext({ user: mockUser }));
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('hides Admin link for curator users', () => {
    renderAppHeader('App', makeAuthContext({ user: { ...mockUser, role: 'curator' } }));
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('calls logout when Sign out is clicked', async () => {
    const logout = vi.fn();
    renderAppHeader('App', makeAuthContext({ logout }));
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(logout).toHaveBeenCalled();
  });

  it('does not render user info when user is null', () => {
    renderAppHeader('App', makeAuthContext({ user: null }));
    expect(screen.queryByText('Test User')).not.toBeInTheDocument();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });
});
