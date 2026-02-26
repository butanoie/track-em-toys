import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { SESSION_KEYS } from '@/lib/auth-store'
import { AppleCallback } from '../AppleCallback'
import { AuthContext, type AuthContextValue } from '../AuthProvider'

// Mock TanStack Router hooks
const mockNavigate = vi.fn()
const mockSearchData: Record<string, string> = {}

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useSearch: () => mockSearchData,
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate-to">{to}</div>,
}))

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
    mockSearchData['token'] = 'test-id-token'

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

  it('shows error when Apple returns error param', async () => {
    mockSearchData['error'] = 'user_cancelled'
    const ctx = makeAuthContext()

    await act(async () => {
      renderAppleCallback(ctx)
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('user_cancelled')
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
    mockSearchData['token'] = 'apple-id-token'
    const signInWithApple = vi.fn().mockRejectedValue(new Error('Auth failed'))
    const ctx = makeAuthContext({ signInWithApple })

    await act(async () => {
      renderAppleCallback(ctx)
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Auth failed')
    })
  })

  it('clears nonce and state from sessionStorage after processing', async () => {
    const state = 'test-state'
    mockSearchData['token'] = 'apple-id-token'
    mockSearchData['state'] = state
    sessionStorage.setItem(SESSION_KEYS.appleNonce, 'nonce')
    sessionStorage.setItem(SESSION_KEYS.appleState, state)

    const ctx = makeAuthContext()

    await act(async () => {
      renderAppleCallback(ctx)
    })

    await waitFor(() => {
      expect(sessionStorage.getItem(SESSION_KEYS.appleNonce)).toBeNull()
      expect(sessionStorage.getItem(SESSION_KEYS.appleState)).toBeNull()
    })
  })
})
