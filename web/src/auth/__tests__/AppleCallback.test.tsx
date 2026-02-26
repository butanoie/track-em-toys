import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import { SESSION_KEYS } from '@/lib/auth-store'
import { AppleCallback } from '../AppleCallback'
import { AuthContext, type AuthContextValue } from '../AuthProvider'

// Mock TanStack Router hooks — override only the hooks used by AppleCallback;
// spread the real module so that Link and other exports remain available.
const mockNavigate = vi.fn()
const mockSearchData: Record<string, string> = {}

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual('@tanstack/react-router')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearch: () => mockSearchData,
    Navigate: ({ to }: { to: string }) => <div data-testid="navigate-to">{to}</div>,
    // Link requires a live router context; replace with a plain anchor for tests
    Link: ({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) => (
      <a href={to} className={className}>{children}</a>
    ),
  }
})

function makeAuthContext(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: null,
    isAuthenticated: false,
    isLoading: false,
    signInWithGoogle: vi.fn(),
    signInWithApple: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
    ...overrides,
  }
}

function renderAppleCallback(ctx: AuthContextValue) {
  return render(
    <AuthContext.Provider value={ctx}>
      <AppleCallback />
    </AuthContext.Provider>
  )
}

describe('AppleCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    // Reset mockSearchData
    Object.keys(mockSearchData).forEach(k => delete mockSearchData[k])
    mockNavigate.mockResolvedValue(undefined)
  })

  it('shows loading state when signInWithApple is pending', async () => {
    const state = 'test-state'
    mockSearchData['token'] = 'test-id-token'
    mockSearchData['state'] = state
    sessionStorage.setItem(SESSION_KEYS.appleState, state)

    // Make signInWithApple hang indefinitely
    const signInWithApple = vi.fn(() => new Promise<void>(() => {}))
    const ctx = makeAuthContext({ signInWithApple })

    await act(async () => {
      renderAppleCallback(ctx)
    })

    expect(screen.getByText(/Completing Apple sign-in/i)).toBeInTheDocument()
  })

  it('shows error when no token in search params', async () => {
    // No token — mockSearchData is empty
    const ctx = makeAuthContext()

    await act(async () => {
      renderAppleCallback(ctx)
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('missing token')
    })
  })

  it('shows friendly message for known Apple error code user_cancelled_authorize', async () => {
    mockSearchData['error'] = 'user_cancelled_authorize'
    const ctx = makeAuthContext()

    await act(async () => {
      renderAppleCallback(ctx)
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Sign-in was cancelled.')
    })
  })

  it('shows friendly message for known Apple error code invalid_grant', async () => {
    mockSearchData['error'] = 'invalid_grant'
    const ctx = makeAuthContext()

    await act(async () => {
      renderAppleCallback(ctx)
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Sign-in session expired. Please try again.')
    })
  })

  it('shows fallback message with code for unknown Apple error param', async () => {
    mockSearchData['error'] = 'user_cancelled'
    const ctx = makeAuthContext()

    await act(async () => {
      renderAppleCallback(ctx)
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Apple sign-in failed (user_cancelled).')
    })
  })

  it('shows state mismatch error when returnedState is missing (fail-closed)', async () => {
    mockSearchData['token'] = 'id-token'
    // No 'state' in search params — returnedState will be undefined
    sessionStorage.setItem(SESSION_KEYS.appleState, 'stored-state')

    const ctx = makeAuthContext()

    await act(async () => {
      renderAppleCallback(ctx)
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('state mismatch')
    })
  })

  it('shows state mismatch error when storedState is missing (fail-closed)', async () => {
    mockSearchData['token'] = 'id-token'
    mockSearchData['state'] = 'returned-state'
    // No state in sessionStorage — storedState will be null

    const ctx = makeAuthContext()

    await act(async () => {
      renderAppleCallback(ctx)
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('state mismatch')
    })
  })

  it('shows state mismatch error on CSRF failure', async () => {
    mockSearchData['token'] = 'id-token'
    mockSearchData['state'] = 'returned-state'
    sessionStorage.setItem(SESSION_KEYS.appleState, 'different-stored-state')

    const ctx = makeAuthContext()

    await act(async () => {
      renderAppleCallback(ctx)
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('state mismatch')
    })
  })

  it('calls signInWithApple with token and raw nonce when state matches', async () => {
    const rawNonce = 'raw-nonce-value'
    const state = 'test-state'
    mockSearchData['token'] = 'apple-id-token'
    mockSearchData['state'] = state
    sessionStorage.setItem(SESSION_KEYS.appleNonce, rawNonce)
    sessionStorage.setItem(SESSION_KEYS.appleState, state)

    const signInWithApple = vi.fn().mockResolvedValue(undefined)
    const ctx = makeAuthContext({ signInWithApple })

    await act(async () => {
      renderAppleCallback(ctx)
    })

    await waitFor(() => {
      expect(signInWithApple).toHaveBeenCalledWith('apple-id-token', rawNonce, undefined)
    })
  })

  it('navigates to / on successful sign-in', async () => {
    const state = 'test-state'
    mockSearchData['token'] = 'apple-id-token'
    mockSearchData['state'] = state
    sessionStorage.setItem(SESSION_KEYS.appleState, state)

    const signInWithApple = vi.fn().mockResolvedValue(undefined)
    const ctx = makeAuthContext({ signInWithApple })

    await act(async () => {
      renderAppleCallback(ctx)
    })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/' })
    })
  })

  it('shows error when signInWithApple throws', async () => {
    const state = 'test-state'
    mockSearchData['token'] = 'apple-id-token'
    mockSearchData['state'] = state
    sessionStorage.setItem(SESSION_KEYS.appleState, state)
    const signInWithApple = vi.fn().mockRejectedValue(new Error('Auth failed'))
    const ctx = makeAuthContext({ signInWithApple })

    await act(async () => {
      renderAppleCallback(ctx)
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Auth failed')
    })
  })

  it('clears nonce and state from sessionStorage after successful sign-in', async () => {
    const state = 'test-state'
    mockSearchData['token'] = 'apple-id-token'
    mockSearchData['state'] = state
    sessionStorage.setItem(SESSION_KEYS.appleNonce, 'nonce')
    sessionStorage.setItem(SESSION_KEYS.appleState, state)

    const signInWithApple = vi.fn().mockResolvedValue(undefined)
    const ctx = makeAuthContext({ signInWithApple })

    await act(async () => {
      renderAppleCallback(ctx)
    })

    await waitFor(() => {
      expect(sessionStorage.getItem(SESSION_KEYS.appleNonce)).toBeNull()
      expect(sessionStorage.getItem(SESSION_KEYS.appleState)).toBeNull()
    })
  })

  it('preserves nonce and state in sessionStorage when signInWithApple fails', async () => {
    const state = 'test-state'
    mockSearchData['token'] = 'apple-id-token'
    mockSearchData['state'] = state
    sessionStorage.setItem(SESSION_KEYS.appleNonce, 'nonce-value')
    sessionStorage.setItem(SESSION_KEYS.appleState, state)

    const signInWithApple = vi.fn().mockRejectedValue(new Error('Network error'))
    const ctx = makeAuthContext({ signInWithApple })

    await act(async () => {
      renderAppleCallback(ctx)
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network error')
    })

    // CSRF tokens must still be present so a retry is possible
    expect(sessionStorage.getItem(SESSION_KEYS.appleNonce)).toBe('nonce-value')
    expect(sessionStorage.getItem(SESSION_KEYS.appleState)).toBe(state)
  })
})
