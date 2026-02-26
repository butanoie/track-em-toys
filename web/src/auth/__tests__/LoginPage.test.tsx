import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginPage } from '../LoginPage'
import { AuthContext, type AuthContextValue } from '../AuthProvider'

// Mock @react-oauth/google
vi.mock('@react-oauth/google', () => ({
  GoogleLogin: ({
    onSuccess,
    onError,
  }: {
    onSuccess: (r: { credential: string }) => void
    onError: () => void
  }) => (
    <div>
      <button onClick={() => onSuccess({ credential: 'google-token' })}>
        Sign in with Google
      </button>
      <button onClick={() => onError()}>Trigger Google Error</button>
    </div>
  ),
}))

// Mock apple-auth module
vi.mock('../apple-auth', () => ({
  initiateAppleSignIn: vi.fn(),
}))

// Mock google-auth helper
vi.mock('../google-auth', () => ({
  extractGoogleCredential: vi.fn((r: { credential?: string }) => r.credential ?? null),
}))

function makeAuthContext(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: null,
    isAuthenticated: false,
    isLoading: false,
    signInWithGoogle: vi.fn(),
    signInWithApple: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  }
}

function renderLoginPage(ctx: AuthContextValue) {
  return render(
    <AuthContext.Provider value={ctx}>
      <LoginPage />
    </AuthContext.Provider>
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    renderLoginPage(makeAuthContext())
    expect(screen.getByText("Track'em Toys")).toBeInTheDocument()
  })

  it('renders Apple sign-in button', () => {
    renderLoginPage(makeAuthContext())
    expect(
      screen.getByRole('button', { name: /Sign in with Apple/i })
    ).toBeInTheDocument()
  })

  it('renders Google sign-in button', () => {
    renderLoginPage(makeAuthContext())
    expect(
      screen.getByRole('button', { name: /Sign in with Google/i })
    ).toBeInTheDocument()
  })

  it('calls signInWithGoogle on Google success', async () => {
    const signInWithGoogle = vi.fn().mockResolvedValue(undefined)
    renderLoginPage(makeAuthContext({ signInWithGoogle }))

    await userEvent.click(screen.getByRole('button', { name: /Sign in with Google/i }))

    await waitFor(() => {
      expect(signInWithGoogle).toHaveBeenCalledWith('google-token')
    })
  })

  it('shows error message when signInWithGoogle throws', async () => {
    const signInWithGoogle = vi.fn().mockRejectedValue(new Error('Invalid credential'))
    renderLoginPage(makeAuthContext({ signInWithGoogle }))

    await userEvent.click(screen.getByRole('button', { name: /Sign in with Google/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid credential')
    })
  })

  it('shows error message on Google sign-in failure', async () => {
    renderLoginPage(makeAuthContext())

    await userEvent.click(screen.getByRole('button', { name: /Trigger Google Error/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Google sign-in failed. Please try again.'
      )
    })
  })

  it('calls initiateAppleSignIn when Apple button is clicked', async () => {
    const { initiateAppleSignIn } = await import('../apple-auth')
    const mockInitiate = vi.mocked(initiateAppleSignIn)
    mockInitiate.mockResolvedValue(undefined)

    renderLoginPage(makeAuthContext())

    await userEvent.click(screen.getByRole('button', { name: /Sign in with Apple/i }))

    await waitFor(() => {
      expect(mockInitiate).toHaveBeenCalledOnce()
    })
  })

  it('shows error when Apple sign-in throws', async () => {
    const { initiateAppleSignIn } = await import('../apple-auth')
    const mockInitiate = vi.mocked(initiateAppleSignIn)
    mockInitiate.mockRejectedValue(new Error('Apple SDK load failed'))

    renderLoginPage(makeAuthContext())

    await userEvent.click(screen.getByRole('button', { name: /Sign in with Apple/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Apple SDK load failed')
    })
  })
})
