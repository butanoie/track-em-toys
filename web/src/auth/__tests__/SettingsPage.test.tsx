import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsPage } from '../SettingsPage'
import { AuthContext, type AuthContextValue } from '../AuthProvider'
import { ApiError } from '@/lib/api-client'
import type { AppleSignInResult } from '../apple-auth'

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
        Continue with Google
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

// Mock useMe hook
vi.mock('../hooks/useMe', () => ({
  useMe: vi.fn(),
}))

// Mock useLinkAccount hook
vi.mock('../hooks/useLinkAccount', () => ({
  useLinkAccount: vi.fn(),
}))

import { useMe } from '../hooks/useMe'
import { useLinkAccount } from '../hooks/useLinkAccount'

const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  display_name: 'Test User',
  avatar_url: null,
}

function makeAuthContext(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: mockUser,
    isAuthenticated: true,
    isLoading: false,
    signInWithGoogle: vi.fn(),
    signInWithApple: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  }
}

function renderSettingsPage(ctx: AuthContextValue) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={ctx}>
        <SettingsPage />
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

const mockMutateAsync = vi.fn()

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMutateAsync.mockReset()
    vi.mocked(useLinkAccount).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useLinkAccount>)
  })

  it('renders profile card with user info', () => {
    vi.mocked(useMe).mockReturnValue({
      data: { ...mockUser, linked_accounts: [] },
      isPending: false,
      isError: false,
      isSuccess: true,
    } as unknown as ReturnType<typeof useMe>)

    renderSettingsPage(makeAuthContext())
    expect(screen.getByText('Profile')).toBeInTheDocument()
    expect(screen.getByText('Your account information')).toBeInTheDocument()
    // User info appears in both header and profile card
    expect(screen.getAllByText('Test User')).toHaveLength(2)
  })

  it('shows loading state while fetching accounts', () => {
    vi.mocked(useMe).mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      isSuccess: false,
    } as unknown as ReturnType<typeof useMe>)

    renderSettingsPage(makeAuthContext())
    expect(screen.getByText('Loading accounts...')).toBeInTheDocument()
  })

  it('shows error state when fetching accounts fails', () => {
    vi.mocked(useMe).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      isSuccess: false,
    } as unknown as ReturnType<typeof useMe>)

    renderSettingsPage(makeAuthContext())
    expect(screen.getByText('Failed to load linked accounts.')).toBeInTheDocument()
  })

  it('shows linked accounts with badges', () => {
    vi.mocked(useMe).mockReturnValue({
      data: {
        ...mockUser,
        linked_accounts: [
          { provider: 'google' as const, email: 'test@gmail.com' },
        ],
      },
      isPending: false,
      isError: false,
      isSuccess: true,
    } as unknown as ReturnType<typeof useMe>)

    renderSettingsPage(makeAuthContext())
    expect(screen.getByText('Google')).toBeInTheDocument()
    expect(screen.getByText('test@gmail.com')).toBeInTheDocument()
    expect(screen.getByText('Linked')).toBeInTheDocument()
  })

  it('shows link buttons for unlinked providers', () => {
    vi.mocked(useMe).mockReturnValue({
      data: {
        ...mockUser,
        linked_accounts: [
          { provider: 'google' as const, email: 'test@gmail.com' },
        ],
      },
      isPending: false,
      isError: false,
      isSuccess: true,
    } as unknown as ReturnType<typeof useMe>)

    renderSettingsPage(makeAuthContext())
    expect(screen.getByRole('button', { name: /Link Apple/i })).toBeInTheDocument()
    // Google is already linked, so no Google link button
    expect(screen.queryByRole('button', { name: /Continue with Google/i })).not.toBeInTheDocument()
  })

  it('shows all providers linked message when both are linked', () => {
    vi.mocked(useMe).mockReturnValue({
      data: {
        ...mockUser,
        linked_accounts: [
          { provider: 'google' as const, email: 'test@gmail.com' },
          { provider: 'apple' as const, email: 'apple@example.com' },
        ],
      },
      isPending: false,
      isError: false,
      isSuccess: true,
    } as unknown as ReturnType<typeof useMe>)

    renderSettingsPage(makeAuthContext())
    expect(screen.getByText('All providers are linked.')).toBeInTheDocument()
  })

  it('links Apple account on button click', async () => {
    const { initiateAppleSignIn } = await import('../apple-auth')
    const mockInitiate = vi.mocked(initiateAppleSignIn)
    const appleResult: AppleSignInResult = {
      idToken: 'apple-id-token',
      rawNonce: 'raw-nonce-value',
    }
    mockInitiate.mockResolvedValue(appleResult)
    mockMutateAsync.mockResolvedValue(undefined)

    vi.mocked(useMe).mockReturnValue({
      data: {
        ...mockUser,
        linked_accounts: [
          { provider: 'google' as const, email: 'test@gmail.com' },
        ],
      },
      isPending: false,
      isError: false,
      isSuccess: true,
    } as unknown as ReturnType<typeof useMe>)

    renderSettingsPage(makeAuthContext())
    await userEvent.click(screen.getByRole('button', { name: /Link Apple/i }))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        provider: 'apple',
        id_token: 'apple-id-token',
        nonce: 'raw-nonce-value',
      })
    })
  })

  it('shows 409 error message from API when linking fails with conflict', async () => {
    const { initiateAppleSignIn } = await import('../apple-auth')
    const mockInitiate = vi.mocked(initiateAppleSignIn)
    mockInitiate.mockResolvedValue({ idToken: 'token', rawNonce: 'nonce' })
    mockMutateAsync.mockRejectedValue(
      new ApiError(409, { error: 'This provider account is already linked to a different user' })
    )

    vi.mocked(useMe).mockReturnValue({
      data: {
        ...mockUser,
        linked_accounts: [
          { provider: 'google' as const, email: 'test@gmail.com' },
        ],
      },
      isPending: false,
      isError: false,
      isSuccess: true,
    } as unknown as ReturnType<typeof useMe>)

    renderSettingsPage(makeAuthContext())
    await userEvent.click(screen.getByRole('button', { name: /Link Apple/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'This provider account is already linked to a different user'
      )
    })
  })

  it('links Google account on Google button click', async () => {
    mockMutateAsync.mockResolvedValue(undefined)

    vi.mocked(useMe).mockReturnValue({
      data: {
        ...mockUser,
        linked_accounts: [
          { provider: 'apple' as const, email: 'apple@example.com' },
        ],
      },
      isPending: false,
      isError: false,
      isSuccess: true,
    } as unknown as ReturnType<typeof useMe>)

    renderSettingsPage(makeAuthContext())
    await userEvent.click(screen.getByRole('button', { name: /Continue with Google/i }))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        provider: 'google',
        id_token: 'google-token',
      })
    })
  })

  it('calls logout when sign out button is clicked', async () => {
    const logout = vi.fn()
    vi.mocked(useMe).mockReturnValue({
      data: { ...mockUser, linked_accounts: [] },
      isPending: false,
      isError: false,
      isSuccess: true,
    } as unknown as ReturnType<typeof useMe>)

    renderSettingsPage(makeAuthContext({ logout }))
    await userEvent.click(screen.getByRole('button', { name: /Sign out/i }))

    expect(logout).toHaveBeenCalled()
  })
})
