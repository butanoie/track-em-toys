import React from 'react'
import { vi } from 'vitest'
import { AuthContext } from '../AuthProvider'
import { authStore } from '@/lib/auth-store'

/** Test user matching the UserResponse Zod schema */
export const validUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  display_name: 'Test User',
  avatar_url: null,
}

/** Creates a base64-encoded JWT with an `exp` claim. Not cryptographically signed. */
export function makeFakeJwt(expOffsetMs = 3600_000): string {
  const header = btoa(JSON.stringify({ alg: 'ES256' }))
  const payload = btoa(
    JSON.stringify({ sub: validUser.id, exp: Math.floor((Date.now() + expOffsetMs) / 1000) })
  )
  return `${header}.${payload}.fakesig`
}

/** Creates a JSON Response object for mocking fetch. */
export function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Renders AuthContext values as test-accessible DOM nodes. */
export function TestConsumer(): React.JSX.Element {
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

/**
 * In-memory localStorage stub for jsdom environments where localStorage
 * is unavailable. Call `clearLocalStore()` in beforeEach to reset state.
 */
export const localStore: Record<string, string> = {}

export function stubLocalStorage(): void {
  vi.stubGlobal('localStorage', {
    getItem: (key: string): string | null => localStore[key] ?? null,
    setItem: (key: string, value: string): void => { localStore[key] = value },
    removeItem: (key: string): void => { delete localStore[key] },
  })
}

export function clearLocalStore(): void {
  for (const key of Object.keys(localStore)) {
    delete localStore[key]
  }
}

/**
 * Common beforeEach reset for AuthProvider tests.
 * Resets fetch mock, navigate mock, authStore, sessionStorage, and localStorage stub.
 */
export function resetAuthTestState(
  mockFetch: ReturnType<typeof vi.fn>,
  mockNavigate: ReturnType<typeof vi.fn>,
): void {
  mockFetch.mockReset()
  mockNavigate.mockReset()
  mockNavigate.mockResolvedValue(undefined)
  authStore.clear()
  sessionStorage.clear()
  clearLocalStore()
}
