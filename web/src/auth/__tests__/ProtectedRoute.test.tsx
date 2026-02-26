import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProtectedRoute } from '../ProtectedRoute'
import { AuthContext, type AuthContextValue } from '../AuthProvider'

// Mock TanStack Router
vi.mock('@tanstack/react-router', () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate">{to}</div>,
  Outlet: () => <div data-testid="outlet">Protected Content</div>,
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

function renderWithAuth(ctx: AuthContextValue) {
  return render(
    <AuthContext.Provider value={ctx}>
      <ProtectedRoute />
    </AuthContext.Provider>
  )
}

describe('ProtectedRoute', () => {
  it('shows spinner when isLoading is true', () => {
    renderWithAuth(makeAuthContext({ isLoading: true }))
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('redirects to /login when not authenticated', () => {
    renderWithAuth(makeAuthContext({ isAuthenticated: false, isLoading: false }))
    const navigate = screen.getByTestId('navigate')
    expect(navigate).toHaveTextContent('/login')
  })

  it('renders Outlet when authenticated', () => {
    const user = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'test@example.com',
      display_name: 'Test User',
      avatar_url: null,
    }
    renderWithAuth(makeAuthContext({ isAuthenticated: true, isLoading: false, user }))
    expect(screen.getByTestId('outlet')).toBeInTheDocument()
  })
})
