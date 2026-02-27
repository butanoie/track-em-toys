import React, { createContext, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { authStore, refreshTimer, sessionFlag, SESSION_KEYS } from '@/lib/auth-store'
import { apiFetch, apiFetchJson, attemptRefresh, ApiError } from '@/lib/api-client'
import {
  ApiErrorSchema,
  AuthResponseSchema,
  UserResponseSchema,
  type UserResponse,
} from '@/lib/zod-schemas'
import { z } from 'zod'

export interface AuthContextValue {
  user: UserResponse | null
  isAuthenticated: boolean
  isLoading: boolean
  signInWithGoogle: (credential: string) => Promise<void>
  signInWithApple: (idToken: string, nonce: string, userName?: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

function getCachedUser(): UserResponse | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEYS.user)
    if (!raw) return null
    const parsed = UserResponseSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function cacheUser(user: UserResponse): void {
  sessionStorage.setItem(SESSION_KEYS.user, JSON.stringify(user))
}

function scheduleRefresh(
  token: string,
  onRefresh: () => Promise<void>,
): void {
  try {
    const parts = token.split('.')
    if (parts.length !== 3 || !parts[1]) return
    const payload: unknown = JSON.parse(atob(parts[1]))
    if (
      payload === null ||
      typeof payload !== 'object' ||
      !('exp' in payload)
    ) return
    // Extract into a local variable so TypeScript's control-flow narrowing can
    // confirm the type is `number` without a redundant cast.
    const expRaw = (payload as Record<string, unknown>)['exp']
    if (typeof expRaw !== 'number') return
    const exp = expRaw

    const expiresAt = exp * 1000
    const refreshAt = expiresAt - 60_000 // 60 seconds before expiry
    const delay = Math.max(refreshAt - Date.now(), 0)

    // Skip proactive scheduling when the token is already expired or within
    // the refresh window — the reactive 401 interceptor handles these cases.
    if (delay === 0) return

    const timerId = window.setTimeout(() => {
      void onRefresh()
    }, delay)

    refreshTimer.set(timerId)
  } catch {
    // Non-fatal: proactive refresh won't fire, reactive 401 interceptor will handle it.
    if (import.meta.env.DEV) {
      console.warn('[AuthProvider] scheduleRefresh: could not parse JWT exp claim — proactive refresh disabled')
    }
  }
}

interface AuthProviderProps {
  children: React.ReactNode
  queryClientClear?: () => void
}

export function AuthProvider({ children, queryClientClear }: AuthProviderProps) {
  const [user, setUser] = useState<UserResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const queryClientClearRef = useRef(queryClientClear)
  queryClientClearRef.current = queryClientClear
  const navigate = useNavigate()
  const router = useRouter()
  // Refs keep the session-expired handler stable (registered once) while
  // always reading the latest navigate/router values at call time.
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const routerRef = useRef(router)
  routerRef.current = router

  const handleRefreshCycle = useCallback(async () => {
    refreshTimer.cancel()
    const refreshed = await attemptRefresh()
    if (refreshed) {
      const token = authStore.getToken()
      if (token) {
        scheduleRefresh(token, handleRefreshCycle)
      }
      // Re-read from sessionStorage so that in-memory React state stays in sync
      // with the cache. A proper GET /auth/me call should replace this once that
      // endpoint exists (Phase 5).
      const cached = getCachedUser()
      // Compare by id only — UUID is the stable identity key. Serialising the
      // entire object on every refresh cycle would be wasteful.
      setUser(prev => {
        if (prev?.id === cached?.id) return prev
        return cached
      })
    } else {
      sessionFlag.clear()
      authStore.clear()
      sessionStorage.removeItem(SESSION_KEYS.user)
      setUser(null)
    }
  }, [])

  // Listen for session-expired events dispatched by the api-client 401 interceptor.
  // Using a DOM event decouples api-client from AuthProvider and preserves the
  // SPA router state (no hard navigation).
  useEffect(() => {
    function handleSessionExpired() {
      refreshTimer.cancel()
      sessionFlag.clear()
      authStore.clear()
      sessionStorage.removeItem(SESSION_KEYS.user)
      queryClientClearRef.current?.()
      setUser(null)
      void navigateRef.current({
        to: '/login',
        search: { redirect: routerRef.current.state.location.href },
      })
    }
    window.addEventListener('auth:sessionexpired', handleSessionExpired)
    return () => window.removeEventListener('auth:sessionexpired', handleSessionExpired)
  }, []) // stable: registered once, refs provide current values

  // Silent refresh on mount
  useEffect(() => {
    let cancelled = false

    async function init() {
      // JavaScript cannot read httpOnly cookies, so we use a localStorage flag
      // to avoid an unconditional POST /auth/refresh on every page load. If the
      // flag is absent the user has never signed in (or explicitly logged out) —
      // skip the round-trip and render the login page immediately.
      if (!sessionFlag.check()) {
        setIsLoading(false)
        return
      }

      const refreshed = await attemptRefresh()
      if (cancelled) return

      if (refreshed) {
        const cached = getCachedUser()
        setUser(cached)
        const token = authStore.getToken()
        if (token) {
          scheduleRefresh(token, handleRefreshCycle)
        }
      } else {
        // Refresh failed — session expired or revoked. Clear the flag so the
        // next page load skips the round-trip and shows the login page immediately.
        sessionFlag.clear()
      }
      // Fail-closed: if the refresh failed (network error, expired cookie, etc.)
      // we deliberately do NOT restore the cached user from sessionStorage.
      // Showing cached user data without a valid live token would mislead the UI
      // into rendering protected content with no authenticated session backing it.
      // The 401 interceptor and the auth:sessionexpired event handle the case
      // where a request is later made with an in-memory token that has expired.
      setIsLoading(false)
    }

    void init()

    return () => {
      cancelled = true
      refreshTimer.cancel()
    }
  }, [handleRefreshCycle])

  const signInWithGoogle = useCallback(async (credential: string): Promise<void> => {
    const response = await apiFetch('/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', id_token: credential }),
    })

    if (!response.ok) {
      const raw: unknown = await response.json()
      const errParsed = ApiErrorSchema.safeParse(raw)
      const errorMsg = errParsed.success ? errParsed.data.error : `HTTP ${response.status}`
      throw new ApiError(response.status, { error: errorMsg })
    }

    const json: unknown = await response.json()
    const parsed = AuthResponseSchema.parse(json)

    authStore.setToken(parsed.access_token)
    cacheUser(parsed.user)
    sessionFlag.set()
    setUser(parsed.user)

    refreshTimer.cancel()
    scheduleRefresh(parsed.access_token, handleRefreshCycle)
  }, [handleRefreshCycle])

  const signInWithApple = useCallback(async (
    idToken: string,
    nonce: string,
    userName?: string,
  ): Promise<void> => {
    const body: Record<string, string> = {
      provider: 'apple',
      id_token: idToken,
      nonce,
    }
    if (userName) {
      body['user_name'] = userName
    }

    const response = await apiFetch('/auth/signin', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const raw: unknown = await response.json()
      const errParsed = ApiErrorSchema.safeParse(raw)
      const errorMsg = errParsed.success ? errParsed.data.error : `HTTP ${response.status}`
      throw new ApiError(response.status, { error: errorMsg })
    }

    const json: unknown = await response.json()
    const parsed = AuthResponseSchema.parse(json)

    authStore.setToken(parsed.access_token)
    cacheUser(parsed.user)
    // Clear Apple-specific session storage now that we have user data
    sessionStorage.removeItem(SESSION_KEYS.appleUserName)
    sessionFlag.set()
    setUser(parsed.user)

    refreshTimer.cancel()
    scheduleRefresh(parsed.access_token, handleRefreshCycle)
  }, [handleRefreshCycle])

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiFetchJson('/auth/logout', z.unknown(), { method: 'POST' })
    } catch {
      // Always clear client-side state even if API call fails
    } finally {
      refreshTimer.cancel()
      sessionFlag.clear()
      authStore.clear()
      sessionStorage.removeItem(SESSION_KEYS.user)
      queryClientClearRef.current?.()
      setUser(null)
    }
  }, [])

  const value: AuthContextValue = {
    user,
    // Also treat a live token as authenticated to avoid a brief flash where
    // the token is valid but user state hasn't been hydrated into React yet.
    // When isLoading is still true the protected route shows a spinner rather
    // than redirecting, so this signal is only acted upon once loading is done.
    isAuthenticated: user !== null || authStore.getToken() !== null,
    isLoading,
    signInWithGoogle,
    signInWithApple,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
