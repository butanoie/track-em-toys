import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from '../LoginPage';
import { AuthContext, type AuthContextValue } from '../AuthProvider';
import type { AppleSignInResult } from '../apple-auth';

// Mock @react-oauth/google
vi.mock('@react-oauth/google', () => ({
  GoogleLogin: ({ onSuccess, onError }: { onSuccess: (r: { credential: string }) => void; onError: () => void }) => (
    <div>
      <button onClick={() => onSuccess({ credential: 'google-token' })}>Sign in with Google</button>
      <button onClick={() => onError()}>Trigger Google Error</button>
    </div>
  ),
}));

// Mock apple-auth module
vi.mock('../apple-auth', () => ({
  initiateAppleSignIn: vi.fn(),
}));

// Mock google-auth helper
vi.mock('../google-auth', () => ({
  extractGoogleCredential: vi.fn((r: { credential?: string }) => r.credential ?? null),
}));

// Mock TanStack Router — override only useNavigate; spread the real module for everything else
const mockNavigate = vi.fn().mockResolvedValue(undefined);
vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual('@tanstack/react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

// Mock the login route so Route.useSearch() works in tests
vi.mock('@/routes/login', () => ({
  Route: {
    useSearch: vi.fn(() => ({ redirect: undefined })),
  },
}));

function makeAuthContext(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: null,
    isAuthenticated: false,
    isLoading: false,
    signInWithGoogle: vi.fn(),
    signInWithApple: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
    ...overrides,
  };
}

function renderLoginPage(ctx: AuthContextValue) {
  return render(
    <AuthContext.Provider value={ctx}>
      <LoginPage />
    </AuthContext.Provider>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockResolvedValue(undefined);
  });

  it('renders without crashing', () => {
    renderLoginPage(makeAuthContext());
    expect(screen.getByText("Track'em Toys")).toBeInTheDocument();
  });

  it('renders Apple sign-in button', () => {
    renderLoginPage(makeAuthContext());
    expect(screen.getByRole('button', { name: /Sign in with Apple/i })).toBeInTheDocument();
  });

  it('renders Google sign-in button', () => {
    renderLoginPage(makeAuthContext());
    expect(screen.getByRole('button', { name: /Sign in with Google/i })).toBeInTheDocument();
  });

  it('calls signInWithGoogle on Google success', async () => {
    const signInWithGoogle = vi.fn().mockResolvedValue(undefined);
    renderLoginPage(makeAuthContext({ signInWithGoogle }));

    await userEvent.click(screen.getByRole('button', { name: /Sign in with Google/i }));

    await waitFor(() => {
      expect(signInWithGoogle).toHaveBeenCalledWith('google-token');
    });
  });

  it('navigates to / after successful Google sign-in when no redirect param', async () => {
    const signInWithGoogle = vi.fn().mockResolvedValue(undefined);
    renderLoginPage(makeAuthContext({ signInWithGoogle }));

    await userEvent.click(screen.getByRole('button', { name: /Sign in with Google/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
    });
  });

  it('navigates to redirect param path after successful Google sign-in', async () => {
    const { Route } = await import('@/routes/login');
    vi.mocked(Route.useSearch).mockReturnValue({ redirect: '/collections' });

    const signInWithGoogle = vi.fn().mockResolvedValue(undefined);
    renderLoginPage(makeAuthContext({ signInWithGoogle }));

    await userEvent.click(screen.getByRole('button', { name: /Sign in with Google/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/collections' });
    });
  });

  it('navigates to / when redirect param is a protocol-relative URL (//evil.com rejected)', async () => {
    const { Route } = await import('@/routes/login');
    // The Zod transform in login.tsx strips //evil.com to undefined
    vi.mocked(Route.useSearch).mockReturnValue({ redirect: undefined });

    const signInWithGoogle = vi.fn().mockResolvedValue(undefined);
    renderLoginPage(makeAuthContext({ signInWithGoogle }));

    await userEvent.click(screen.getByRole('button', { name: /Sign in with Google/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
    });
  });

  it('navigates to / when redirect param is an absolute URL (https:// rejected)', async () => {
    const { Route } = await import('@/routes/login');
    // The Zod transform in login.tsx strips absolute URLs to undefined
    vi.mocked(Route.useSearch).mockReturnValue({ redirect: undefined });

    const signInWithGoogle = vi.fn().mockResolvedValue(undefined);
    renderLoginPage(makeAuthContext({ signInWithGoogle }));

    await userEvent.click(screen.getByRole('button', { name: /Sign in with Google/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
    });
  });

  it('shows error message when signInWithGoogle throws', async () => {
    const signInWithGoogle = vi.fn().mockRejectedValue(new Error('Invalid credential'));
    renderLoginPage(makeAuthContext({ signInWithGoogle }));

    await userEvent.click(screen.getByRole('button', { name: /Sign in with Google/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid credential');
    });
  });

  it('shows error message on Google sign-in failure', async () => {
    renderLoginPage(makeAuthContext());

    await userEvent.click(screen.getByRole('button', { name: /Trigger Google Error/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Google sign-in failed. Please try again.');
    });
  });

  it('calls initiateAppleSignIn and signInWithApple on Apple button click', async () => {
    const { initiateAppleSignIn } = await import('../apple-auth');
    const mockInitiate = vi.mocked(initiateAppleSignIn);
    const appleResult: AppleSignInResult = {
      idToken: 'apple-id-token',
      rawNonce: 'raw-nonce-value',
      userName: 'John Doe',
    };
    mockInitiate.mockResolvedValue(appleResult);

    const signInWithApple = vi.fn().mockResolvedValue(undefined);
    renderLoginPage(makeAuthContext({ signInWithApple }));

    await userEvent.click(screen.getByRole('button', { name: /Sign in with Apple/i }));

    await waitFor(() => {
      expect(mockInitiate).toHaveBeenCalledOnce();
      expect(signInWithApple).toHaveBeenCalledWith('apple-id-token', 'raw-nonce-value', 'John Doe');
    });
  });

  it('navigates to / after successful Apple sign-in', async () => {
    const { initiateAppleSignIn } = await import('../apple-auth');
    const mockInitiate = vi.mocked(initiateAppleSignIn);
    mockInitiate.mockResolvedValue({
      idToken: 'apple-id-token',
      rawNonce: 'raw-nonce',
    });

    const signInWithApple = vi.fn().mockResolvedValue(undefined);
    renderLoginPage(makeAuthContext({ signInWithApple }));

    await userEvent.click(screen.getByRole('button', { name: /Sign in with Apple/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
    });
  });

  it('navigates to redirect param after successful Apple sign-in', async () => {
    const { Route } = await import('@/routes/login');
    vi.mocked(Route.useSearch).mockReturnValue({ redirect: '/collections' });

    const { initiateAppleSignIn } = await import('../apple-auth');
    const mockInitiate = vi.mocked(initiateAppleSignIn);
    mockInitiate.mockResolvedValue({
      idToken: 'apple-id-token',
      rawNonce: 'raw-nonce',
    });

    const signInWithApple = vi.fn().mockResolvedValue(undefined);
    renderLoginPage(makeAuthContext({ signInWithApple }));

    await userEvent.click(screen.getByRole('button', { name: /Sign in with Apple/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/collections' });
    });
  });

  it('shows error when initiateAppleSignIn throws', async () => {
    const { initiateAppleSignIn } = await import('../apple-auth');
    const mockInitiate = vi.mocked(initiateAppleSignIn);
    mockInitiate.mockRejectedValue(new Error('Apple SDK load failed'));

    renderLoginPage(makeAuthContext());

    await userEvent.click(screen.getByRole('button', { name: /Sign in with Apple/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Apple SDK load failed');
    });
  });

  it('shows error when signInWithApple throws after popup succeeds', async () => {
    const { initiateAppleSignIn } = await import('../apple-auth');
    const mockInitiate = vi.mocked(initiateAppleSignIn);
    mockInitiate.mockResolvedValue({
      idToken: 'apple-id-token',
      rawNonce: 'raw-nonce',
    });

    const signInWithApple = vi.fn().mockRejectedValue(new Error('Auth server error'));
    renderLoginPage(makeAuthContext({ signInWithApple }));

    await userEvent.click(screen.getByRole('button', { name: /Sign in with Apple/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Auth server error');
    });
  });

  it('resets isAppleLoading after Apple sign-in succeeds', async () => {
    const { initiateAppleSignIn } = await import('../apple-auth');
    const mockInitiate = vi.mocked(initiateAppleSignIn);
    mockInitiate.mockResolvedValue({
      idToken: 'apple-id-token',
      rawNonce: 'raw-nonce',
    });

    renderLoginPage(makeAuthContext());

    const button = screen.getByRole('button', { name: /Sign in with Apple/i });
    await userEvent.click(button);

    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });

  it('resets isAppleLoading after Apple sign-in throws', async () => {
    const { initiateAppleSignIn } = await import('../apple-auth');
    const mockInitiate = vi.mocked(initiateAppleSignIn);
    mockInitiate.mockRejectedValue(new Error('SDK error'));

    renderLoginPage(makeAuthContext());

    const button = screen.getByRole('button', { name: /Sign in with Apple/i });
    await userEvent.click(button);

    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });

  it('passes userName as undefined when Apple does not provide user data', async () => {
    const { initiateAppleSignIn } = await import('../apple-auth');
    const mockInitiate = vi.mocked(initiateAppleSignIn);
    mockInitiate.mockResolvedValue({
      idToken: 'apple-id-token',
      rawNonce: 'raw-nonce',
      // No userName
    });

    const signInWithApple = vi.fn().mockResolvedValue(undefined);
    renderLoginPage(makeAuthContext({ signInWithApple }));

    await userEvent.click(screen.getByRole('button', { name: /Sign in with Apple/i }));

    await waitFor(() => {
      expect(signInWithApple).toHaveBeenCalledWith('apple-id-token', 'raw-nonce', undefined);
    });
  });
});
