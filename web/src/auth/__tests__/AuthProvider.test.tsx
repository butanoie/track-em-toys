import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { AuthProvider, AuthContext } from '../AuthProvider'
import { authStore, refreshTimer, SESSION_KEYS } from '@/lib/auth-store'

// Mock TanStack Router hooks — AuthProvider uses useNavigate and useRouter
const mockNavigate = vi.fn()
const mockRouter = {
  state: {
    location: { href: '/current-path' },
  },
}

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useRouter: () => mockRouter,
}))

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const validUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  display_name: 'Test User',
  avatar_url: null,
}

// JWT with exp 1 hour from now
function makeFakeJwt(expOffsetMs = 3600_000): string {
  const header = btoa(JSON.stringify({ alg: 'ES256' }))
  const payload = btoa(
    JSON.stringify({ sub: validUser.id, exp: Math.floor((Date.now() + expOffsetMs) / 1000) })
  )
  return `${header}.${payload}.fakesig`
}

function TestConsumer() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) return <div>no context</div>
  return (
    <div>
      <div data-testid="loading">{String(ctx.isLoading)}</div>
      <div data-testid="authenticated">{String(ctx.isAuthenticated)}</div>
      <div data-testid="user">{ctx.user?.display_name ?? 'null'}</div>
      <button onClick={() => void ctx.logout()}>Logout</button>
    </div>
  )
}

describe('AuthProvider', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockNavigate.mockReset()
    mockNavigate.mockResolvedValue(undefined)
    authStore.clear()
    sessionStorage.clear()
    // Do NOT use fake timers — they break Promise resolution in jsdom
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders children', async () => {
    // Silent refresh fails (not authenticated)
    mockFetch.mockResolvedValueOnce(makeResponse({ error: 'Unauthorized' }, 401))

    render(
      <AuthProvider>
        <div data-testid="child">Hello</div>
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('child')).toBeInTheDocument()
    })
  })

  it('sets isLoading false after failed refresh attempt', async () => {
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

  it('restores user from sessionStorage on successful silent refresh', async () => {
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

  it('user is null when silent refresh fails', async () => {
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
    expect(screen.getByTestId('user')).toHaveTextContent('null')
  })

  it('signInWithGoogle updates user state', async () => {
    // Initial silent refresh fails
    mockFetch.mockResolvedValueOnce(makeResponse({ error: 'Unauthorized' }, 401))

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
  })

  it('logout clears user state and sessionStorage', async () => {
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
    expect(mockClear).toHaveBeenCalledOnce()
  })

  it('logout clears state even when API call fails', async () => {
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

    // Logout API call returns 500 error (non-2xx, will throw ApiError)
    mockFetch.mockResolvedValueOnce(makeResponse({ error: 'Server Error' }, 500))
    // apiFetch will call /auth/refresh on 401 — but this is a 500, so no refresh
    // ApiError will be caught in the logout catch block

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Logout' }))
    })

    // State should still be cleared despite the API error
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false')
  })

  it('stores access token in authStore after successful sign-in', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ error: 'Unauthorized' }, 401))

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

  it('clears auth state and navigates to login on auth:sessionexpired event', async () => {
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
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/login',
      search: { redirect: '/current-path' },
    })
  })
})
