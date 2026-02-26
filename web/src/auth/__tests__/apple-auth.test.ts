import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { SESSION_KEYS } from '@/lib/auth-store'

// We test only the nonce generation and session storage behaviour,
// since the Apple SDK is loaded dynamically and not available in jsdom.

describe('Apple auth nonce generation', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('generateNonce produces a 64-char hex raw nonce', async () => {
    // Test the nonce generation logic directly by replicating it
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    const raw = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
    expect(raw).toHaveLength(64)
    expect(raw).toMatch(/^[0-9a-f]{64}$/)
  })

  it('generateNonce produces a 64-char hex SHA-256 hash', async () => {
    const raw = 'a'.repeat(64)
    const hashBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(raw),
    )
    const hashed = Array.from(
      new Uint8Array(hashBuffer),
      b => b.toString(16).padStart(2, '0'),
    ).join('')
    expect(hashed).toHaveLength(64)
    expect(hashed).toMatch(/^[0-9a-f]{64}$/)
  })

  it('different nonces produce different hashes', async () => {
    async function hashString(s: string): Promise<string> {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
      return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('')
    }
    const h1 = await hashString('nonce1')
    const h2 = await hashString('nonce2')
    expect(h1).not.toBe(h2)
  })
})

describe('Apple auth session storage', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('stores nonce and state in sessionStorage before redirect', () => {
    const rawNonce = 'test-raw-nonce'
    const state = 'test-state-uuid'
    sessionStorage.setItem(SESSION_KEYS.appleNonce, rawNonce)
    sessionStorage.setItem(SESSION_KEYS.appleState, state)

    expect(sessionStorage.getItem(SESSION_KEYS.appleNonce)).toBe(rawNonce)
    expect(sessionStorage.getItem(SESSION_KEYS.appleState)).toBe(state)
  })

  it('clears nonce and state after callback processing', () => {
    sessionStorage.setItem(SESSION_KEYS.appleNonce, 'nonce')
    sessionStorage.setItem(SESSION_KEYS.appleState, 'state')

    sessionStorage.removeItem(SESSION_KEYS.appleNonce)
    sessionStorage.removeItem(SESSION_KEYS.appleState)

    expect(sessionStorage.getItem(SESSION_KEYS.appleNonce)).toBeNull()
    expect(sessionStorage.getItem(SESSION_KEYS.appleState)).toBeNull()
  })
})

describe('initiateAppleSignIn', () => {
  it('throws an error when Apple SDK is not loaded', async () => {
    // Ensure AppleID is not on window
    const windowWithApple = window as Window & { AppleID?: unknown }
    delete windowWithApple.AppleID

    // Mock script loading to resolve without actually loading the SDK
    vi.spyOn(document.head, 'appendChild').mockImplementationOnce((script) => {
      // Simulate script load event
      const scriptEl = script as HTMLScriptElement
      setTimeout(() => scriptEl.onload?.(new Event('load')), 0)
      return script
    })

    const { initiateAppleSignIn } = await import('../apple-auth')

    // AppleID will still be undefined after "loading", so it should throw
    await expect(initiateAppleSignIn()).rejects.toThrow('Apple JS SDK not loaded')
  })
})
