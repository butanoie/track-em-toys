import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { authStore, refreshTimer, SESSION_KEYS } from '../auth-store'

describe('authStore', () => {
  beforeEach(() => {
    authStore.clear()
  })

  it('starts with null token', () => {
    expect(authStore.getToken()).toBeNull()
  })

  it('stores and retrieves access token', () => {
    authStore.setToken('my-access-token')
    expect(authStore.getToken()).toBe('my-access-token')
  })

  it('clears the token', () => {
    authStore.setToken('token-to-clear')
    authStore.clear()
    expect(authStore.getToken()).toBeNull()
  })

  it('overwrites existing token', () => {
    authStore.setToken('first-token')
    authStore.setToken('second-token')
    expect(authStore.getToken()).toBe('second-token')
  })
})

describe('refreshTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    refreshTimer.cancel()
  })

  it('cancels without error when no timer is set', () => {
    expect(() => refreshTimer.cancel()).not.toThrow()
  })

  it('sets and cancels a timer', () => {
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout')
    const id = window.setTimeout(() => {}, 10000) as unknown as number
    refreshTimer.set(id)
    refreshTimer.cancel()
    expect(clearTimeoutSpy).toHaveBeenCalledWith(id)
  })

  it('cancelling twice does not throw', () => {
    const id = window.setTimeout(() => {}, 10000) as unknown as number
    refreshTimer.set(id)
    refreshTimer.cancel()
    expect(() => refreshTimer.cancel()).not.toThrow()
  })
})

describe('SESSION_KEYS', () => {
  it('exposes expected keys', () => {
    expect(SESSION_KEYS.user).toBe('trackem:user')
    expect(SESSION_KEYS.appleNonce).toBe('trackem:apple:nonce')
    expect(SESSION_KEYS.appleState).toBe('trackem:apple:state')
    expect(SESSION_KEYS.appleUserName).toBe('trackem:apple:user_name')
  })
})
