import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '../AuthProvider';
import { refreshTimer, sessionFlag, SESSION_KEYS } from '@/lib/auth-store';
import {
  validUser,
  makeFakeJwt,
  makeResponse,
  TestConsumer,
  stubLocalStorage,
  resetAuthTestState,
} from './auth-test-helpers';

// Mock TanStack Router hooks
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useRouter: () => ({ state: { location: { href: '/dashboard' } } }),
}));

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
stubLocalStorage();

describe('Auth refresh scheduling', () => {
  beforeEach(() => {
    resetAuthTestState(mockFetch, mockNavigate);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('proactive refresh scheduled 60s before JWT expiry', async () => {
    sessionFlag.set();
    sessionStorage.setItem(SESSION_KEYS.user, JSON.stringify(validUser));

    // Token expires in 5 minutes — should schedule refresh at ~4 minutes
    const jwt = makeFakeJwt(300_000);
    mockFetch.mockResolvedValueOnce(makeResponse({ access_token: jwt, refresh_token: null }));

    const timerSetSpy = vi.spyOn(refreshTimer, 'set');

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    // refreshTimer.set should have been called with a timer ID
    // In jsdom, setTimeout returns a Timeout object (not a number like in browsers)
    expect(timerSetSpy).toHaveBeenCalledTimes(1);
    expect(timerSetSpy.mock.calls[0][0]).toBeDefined();
  });

  it('timer cancelled on logout', async () => {
    sessionFlag.set();
    sessionStorage.setItem(SESSION_KEYS.user, JSON.stringify(validUser));

    mockFetch.mockResolvedValueOnce(makeResponse({ access_token: makeFakeJwt(), refresh_token: null }));

    const timerCancelSpy = vi.spyOn(refreshTimer, 'cancel');

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    });

    // Trigger session expired (simulates what happens during logout flow)
    // The AuthProvider's cleanup effect cancels the timer
    timerCancelSpy.mockClear();

    // Mock logout response
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    // Simulate the auth:sessionexpired event which triggers cancel
    window.dispatchEvent(new CustomEvent('auth:sessionexpired'));

    await waitFor(() => {
      expect(timerCancelSpy).toHaveBeenCalled();
    });
  });

  it('not scheduled for token at exactly 60s boundary', async () => {
    sessionFlag.set();
    sessionStorage.setItem(SESSION_KEYS.user, JSON.stringify(validUser));

    // Token expires in exactly 60 seconds — delay would be 0, so no scheduling
    const jwt = makeFakeJwt(60_000);
    mockFetch.mockResolvedValueOnce(makeResponse({ access_token: jwt, refresh_token: null }));

    const timerSetSpy = vi.spyOn(refreshTimer, 'set');

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    // delay = max((expiry - 60_000) - now, 0) = max(0, 0) = 0 → early return
    expect(timerSetSpy).not.toHaveBeenCalled();
  });
});
