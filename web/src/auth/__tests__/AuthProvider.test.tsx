import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { AuthProvider, AuthContext } from '../AuthProvider'
import { authStore, refreshTimer, sessionFlag, SESSION_KEYS } from '@/lib/auth-store'
import {
  validUser,
  makeFakeJwt,
  makeResponse,
  TestConsumer,
  stubLocalStorage,
  resetAuthTestState,
} from './auth-test-helpers'

// Mock TanStack Router hooks — AuthProvider uses useNavigate and useRouter
const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useRouter: () => ({ state: { location: { href: '/current-path' } } }),
}))

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)
stubLocalStorage()

describe('AuthProvider', () => {
  beforeEach(() => {
    resetAuthTestState(mockFetch, mockNavigate)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders children', async () => {
    // No session flag — init() skips the refresh and resolves immediately
    render(
      <AuthProvider>
        <div data-testid="child">Hello</div>
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('child')).toBeInTheDocument()
    })
  })

  it('skips refresh attempt when session flag is absent (first visit)', async () => {
    // sessionFlag not set — init() must NOT call fetch at all
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })

    expect(mockFetch).not.toHaveBeenCalled()
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false')
  })

  it('sets isLoading false after failed refresh attempt', async () => {
    // Session flag present — init() attempts refresh, which fails
    sessionFlag.set()
    mockFetch.mockResolvedValueOnce(makeResponse({ error: 'Unauthorized' }, 401))

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false')
  })

  it('clears session flag when silent refresh fails', async () => {
    sessionFlag.set()
    mockFetch.mockResolvedValueOnce(makeResponse({ error: 'Unauthorized' }, 401))

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })

    expect(sessionFlag.check()).toBe(false)
  })

  it('restores user from sessionStorage on successful silent refresh', async () => {
    sessionFlag.set()
    sessionStorage.setItem(SESSION_KEYS.user, JSON.stringify(validUser))

    mockFetch.mockResolvedValueOnce(
      makeResponse({ access_token: makeFakeJwt(), refresh_token: null })
    )

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
    expect(screen.getByTestId('user')).toHaveTextContent('Test User')
  })

  it('user is null when session flag is absent (no refresh attempted)', async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false')
    expect(screen.getByTestId('user')).toHaveTextContent('null')
  })

  it('signInWithGoogle sets session flag and updates user state', async () => {
    // No session flag — init() skips refresh
    let signInFn: ((cred: string) => Promise<void>) | undefined

    function CaptureContext() {
      const ctx = React.useContext(AuthContext)
      signInFn = ctx?.signInWithGoogle
      return <TestConsumer />
    }

    render(
      <AuthProvider>
        <CaptureContext />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })

    // Mock signin response
    mockFetch.mockResolvedValueOnce(
      makeResponse({
        access_token: makeFakeJwt(),
        refresh_token: null,
        user: validUser,
      })
    )

    await act(async () => {
      await signInFn?.('google-credential-token')
    })

    expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
    expect(screen.getByTestId('user')).toHaveTextContent('Test User')
    expect(sessionStorage.getItem(SESSION_KEYS.user)).not.toBeNull()
    expect(sessionFlag.check()).toBe(true)
  })

  it('logout clears session flag and user state', async () => {
    sessionFlag.set()
    sessionStorage.setItem(SESSION_KEYS.user, JSON.stringify(validUser))
    mockFetch.mockResolvedValueOnce(
      makeResponse({ access_token: makeFakeJwt(), refresh_token: null })
    )

    const mockClear = vi.fn()

    render(
      <AuthProvider queryClientClear={mockClear}>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
    })

    // Mock logout response (204 No Content)
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }))

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Logout' }))
    })

    expect(screen.getByTestId('authenticated')).toHaveTextContent('false')
    expect(authStore.getToken()).toBeNull()
    expect(sessionStorage.getItem(SESSION_KEYS.user)).toBeNull()
    expect(sessionFlag.check()).toBe(false)
    expect(mockClear).toHaveBeenCalledOnce()
  })

  it('logout clears state even when API call fails', async () => {
    sessionFlag.set()
    sessionStorage.setItem(SESSION_KEYS.user, JSON.stringify(validUser))
    // Initial silent refresh succeeds
    mockFetch.mockResolvedValueOnce(
      makeResponse({ access_token: makeFakeJwt(), refresh_token: null })
    )

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
    })

    // Logout API call returns 500 error
    mockFetch.mockResolvedValueOnce(makeResponse({ error: 'Server Error' }, 500))

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Logout' }))
    })

    // State should still be cleared despite the API error
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false')
    expect(sessionFlag.check()).toBe(false)
  })

  it('stores access token in authStore after successful sign-in', async () => {
    // No session flag — init() skips refresh
    let signInFn: ((cred: string) => Promise<void>) | undefined

    function CaptureSignIn() {
      const ctx = React.useContext(AuthContext)
      signInFn = ctx?.signInWithGoogle
      return null
    }

    render(
      <AuthProvider>
        <CaptureSignIn />
      </AuthProvider>
    )

    await waitFor(() => expect(signInFn).toBeDefined())

    const jwt = makeFakeJwt()
    mockFetch.mockResolvedValueOnce(
      makeResponse({ access_token: jwt, refresh_token: null, user: validUser })
    )

    await act(async () => {
      await signInFn?.('cred')
    })

    expect(authStore.getToken()).toBe(jwt)
  })

  it('does not schedule a refresh timer when the token is already within the 60-second window', async () => {
    sessionFlag.set()
    sessionStorage.setItem(SESSION_KEYS.user, JSON.stringify(validUser))

    // Token that expires in 30 seconds — already within the 60s refresh window
    const nearlyExpiredJwt = makeFakeJwt(30_000)
    mockFetch.mockResolvedValueOnce(
      makeResponse({ access_token: nearlyExpiredJwt, refresh_token: null })
    )

    // Spy on refreshTimer.set to verify it is never called (scheduleRefresh returns early)
    const timerSetSpy = vi.spyOn(refreshTimer, 'set')

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })

    // refreshTimer.set must NOT have been called — delay === 0, early return
    expect(timerSetSpy).not.toHaveBeenCalled()

    timerSetSpy.mockRestore()
  })

  it('failed refresh does NOT restore cached user from sessionStorage (fail-closed)', async () => {
    sessionFlag.set()
    // Cache a user in sessionStorage — this should NOT be restored after failed refresh
    sessionStorage.setItem(SESSION_KEYS.user, JSON.stringify(validUser))

    // Refresh fails with 401
    mockFetch.mockResolvedValueOnce(makeResponse({ error: 'Unauthorized' }, 401))

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })

    // User must NOT be restored — fail-closed means no cached user without a live token
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false')
    expect(screen.getByTestId('user')).toHaveTextContent('null')
  })

  it('auth:sessionexpired event clears queryClient', async () => {
    sessionFlag.set()
    sessionStorage.setItem(SESSION_KEYS.user, JSON.stringify(validUser))
    authStore.setToken('some-token')

    mockFetch.mockResolvedValueOnce(
      makeResponse({ access_token: makeFakeJwt(), refresh_token: null })
    )

    const mockClear = vi.fn()

    render(
      <AuthProvider queryClientClear={mockClear}>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
    })

    await act(async () => {
      window.dispatchEvent(new CustomEvent('auth:sessionexpired'))
    })

    expect(mockClear).toHaveBeenCalledOnce()
  })

  it('clears session flag and navigates to login on auth:sessionexpired event', async () => {
    sessionFlag.set()
    sessionStorage.setItem(SESSION_KEYS.user, JSON.stringify(validUser))
    authStore.setToken('some-token')

    mockFetch.mockResolvedValueOnce(
      makeResponse({ access_token: makeFakeJwt(), refresh_token: null })
    )

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
    })

    await act(async () => {
      window.dispatchEvent(new CustomEvent('auth:sessionexpired'))
    })

    expect(screen.getByTestId('authenticated')).toHaveTextContent('false')
    expect(authStore.getToken()).toBeNull()
    expect(sessionStorage.getItem(SESSION_KEYS.user)).toBeNull()
    expect(sessionFlag.check()).toBe(false)
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/login',
      search: { redirect: '/current-path' },
    })
  })
})
