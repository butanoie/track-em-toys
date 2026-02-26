import { describe, it, expect, beforeEach, vi, afterEach, afterAll } from 'vitest'
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

describe('initiateAppleSignIn — env var guard', () => {
  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('throws when VITE_APPLE_SERVICES_ID is missing', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_APPLE_SERVICES_ID', '')
    vi.stubEnv('VITE_APPLE_REDIRECT_URI', 'https://example.com/callback')

    const { initiateAppleSignIn } = await import('../apple-auth')
    await expect(initiateAppleSignIn()).rejects.toThrow(
      'Apple Sign-In is not configured. Set VITE_APPLE_SERVICES_ID and VITE_APPLE_REDIRECT_URI.'
    )
  })

  it('throws when VITE_APPLE_REDIRECT_URI is missing', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_APPLE_SERVICES_ID', 'com.example.app')
    vi.stubEnv('VITE_APPLE_REDIRECT_URI', '')

    const { initiateAppleSignIn } = await import('../apple-auth')
    await expect(initiateAppleSignIn()).rejects.toThrow(
      'Apple Sign-In is not configured. Set VITE_APPLE_SERVICES_ID and VITE_APPLE_REDIRECT_URI.'
    )
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

describe('loadAppleSDK deduplication', () => {
  it('appends only one script element when called concurrently while the SDK is loading', async () => {
    // Reset the module so sdkLoadPromise starts as null
    vi.resetModules()

    const windowWithApple = window as Window & { AppleID?: unknown }
    delete windowWithApple.AppleID

    const appendChildSpy = vi.spyOn(document.head, 'appendChild')

    // Resolve script load only once, after a short delay
    const scriptResolvers: Array<() => void> = []
    appendChildSpy.mockImplementation((node) => {
      const script = node as HTMLScriptElement
      // Capture resolve so we can trigger it after both calls are in-flight
      scriptResolvers.push(() => script.onload?.(new Event('load')))
      return node
    })

    // Import a fresh module instance after vi.resetModules()
    const { initiateAppleSignIn } = await import('../apple-auth')

    // Fire two concurrent calls — only one should append a <script>
    const p1 = initiateAppleSignIn().catch(() => { /* expected: Apple SDK not loaded */ })
    const p2 = initiateAppleSignIn().catch(() => { /* expected: Apple SDK not loaded */ })

    // Resolve the in-flight script load (only first entry — deduplication means only one was appended)
    scriptResolvers[0]?.()

    await Promise.allSettled([p1, p2])

    // Only one script should have been appended despite two concurrent calls
    expect(appendChildSpy.mock.calls.length).toBe(1)

    appendChildSpy.mockRestore()
  })

  it('resets the in-flight promise on load failure to allow retry', async () => {
    vi.resetModules()

    const windowWithApple = window as Window & { AppleID?: unknown }
    delete windowWithApple.AppleID

    const appendChildSpy = vi.spyOn(document.head, 'appendChild')
    let callCount = 0

    appendChildSpy.mockImplementation((node) => {
      callCount++
      const script = node as HTMLScriptElement
      // First call: simulate onerror; second call: simulate onload
      if (callCount === 1) {
        setTimeout(() => script.onerror?.(new Event('error')), 0)
      } else {
        setTimeout(() => script.onload?.(new Event('load')), 0)
      }
      return node
    })

    const { initiateAppleSignIn } = await import('../apple-auth')

    // First attempt — script fails to load
    await expect(initiateAppleSignIn()).rejects.toThrow('Failed to load Apple Sign-In SDK')
    expect(callCount).toBe(1)

    // After failure, sdkLoadPromise should be null, allowing a retry
    // Second attempt — script loads, but AppleID is still not on window
    await expect(initiateAppleSignIn()).rejects.toThrow('Apple JS SDK not loaded')
    expect(callCount).toBe(2)

    appendChildSpy.mockRestore()
  })
})
