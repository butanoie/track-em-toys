import React, { createContext, useCallback, useEffect, useRef, useState } from 'react'
import { authStore, refreshTimer, SESSION_KEYS } from '@/lib/auth-store'
import { apiFetch, apiFetchJson, ApiError } from '@/lib/api-client'
import {
  AuthResponseSchema,
  TokenResponseSchema,
  UserResponseSchema,
  type UserResponse,
} from '@/lib/zod-schemas'

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
      !('exp' in payload) ||
      typeof (payload as Record<string, unknown>)['exp'] !== 'number'
    ) return
    const exp = (payload as Record<string, unknown>)['exp'] as number

    const expiresAt = exp * 1000
    const refreshAt = expiresAt - 60_000 // 60 seconds before expiry
    const delay = Math.max(refreshAt - Date.now(), 0)

    const timerId = window.setTimeout(() => {
      void onRefresh()
    }, delay) as unknown as number

    refreshTimer.set(timerId)
  } catch {
    // Non-fatal: proactive refresh won't fire, reactive 401 interceptor will handle it
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

  const doRefresh = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/auth/refresh`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        },
      )
      if (!response.ok) return false

      const json: unknown = await response.json()
      const parsed = TokenResponseSchema.parse(json)
      authStore.setToken(parsed.access_token)
      return true
    } catch {
      return false
    }
  }, [])

  const handleRefreshCycle = useCallback(async () => {
    refreshTimer.cancel()
    const refreshed = await doRefresh()
    if (refreshed) {
      const token = authStore.getToken()
      if (token) {
        scheduleRefresh(token, handleRefreshCycle)
      }
    } else {
      authStore.clear()
      sessionStorage.removeItem(SESSION_KEYS.user)
      setUser(null)
    }
  }, [doRefresh])

  // Silent refresh on mount
  useEffect(() => {
    let cancelled = false

    async function init() {
      const refreshed = await doRefresh()
      if (cancelled) return

      if (refreshed) {
        const cached = getCachedUser()
        setUser(cached)
        const token = authStore.getToken()
        if (token) {
          scheduleRefresh(token, handleRefreshCycle)
        }
      }
      setIsLoading(false)
    }

    void init()

    return () => {
      cancelled = true
    }
  }, [doRefresh, handleRefreshCycle])

  const signInWithGoogle = useCallback(async (credential: string): Promise<void> => {
    const response = await apiFetch('/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', id_token: credential }),
    })

    if (!response.ok) {
      const json: unknown = await response.json()
      const err = json as { error?: string }
      throw new ApiError(response.status, { error: err.error ?? `HTTP ${response.status}` })
    }

    const json: unknown = await response.json()
    const parsed = AuthResponseSchema.parse(json)

    authStore.setToken(parsed.access_token)
    cacheUser(parsed.user)
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
      const json: unknown = await response.json()
      const err = json as { error?: string }
      throw new ApiError(response.status, { error: err.error ?? `HTTP ${response.status}` })
    }

    const json: unknown = await response.json()
    const parsed = AuthResponseSchema.parse(json)

    authStore.setToken(parsed.access_token)
    cacheUser(parsed.user)
    // Clear Apple-specific session storage now that we have user data
    sessionStorage.removeItem(SESSION_KEYS.appleUserName)
    setUser(parsed.user)

    refreshTimer.cancel()
    scheduleRefresh(parsed.access_token, handleRefreshCycle)
  }, [handleRefreshCycle])

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiFetchJson('/auth/logout', { method: 'POST' })
    } catch {
      // Always clear client-side state even if API call fails
    } finally {
      refreshTimer.cancel()
      authStore.clear()
      sessionStorage.clear()
      queryClientClearRef.current?.()
      setUser(null)
    }
  }, [])

  const value: AuthContextValue = {
    user,
    isAuthenticated: user !== null,
    isLoading,
    signInWithGoogle,
    signInWithApple,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
