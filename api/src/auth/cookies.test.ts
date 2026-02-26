import { describe, it, expect, vi } from 'vitest'

// Mock config before importing cookies so COOKIE_SECRET is not required at test time.
// The mock factory is overridden per-suite via vi.doMock() where secureCookies: true
// behaviour is tested.
vi.mock('../config.js', () => ({
  config: {
    secureCookies: false,
    cookieSecret: 'test-secret',
  },
}))

import { REFRESH_TOKEN_COOKIE, setRefreshTokenCookie, clearRefreshTokenCookie } from './cookies.js'
import type { CookieReply } from './cookies.js'
import { REFRESH_TOKEN_EXPIRY_DAYS } from './tokens.js'

// ─── Typed mock factory ───────────────────────────────────────────────────────

function createMockReply(): CookieReply & {
  setCookie: ReturnType<typeof vi.fn>
  clearCookie: ReturnType<typeof vi.fn>
} {
  return {
    setCookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
  }
}

describe('cookies', () => {
  describe('REFRESH_TOKEN_COOKIE', () => {
    it('should be "refresh_token"', () => {
      expect(REFRESH_TOKEN_COOKIE).toBe('refresh_token')
    })
  })

  describe('setRefreshTokenCookie — secureCookies: false', () => {
    it('should set httpOnly signed cookie with correct options', () => {
      const reply = createMockReply()

      setRefreshTokenCookie(reply, 'test-token-value')

      expect(reply.setCookie).toHaveBeenCalledWith(
        'refresh_token',
        'test-token-value',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'strict',
          path: '/auth',
          signed: true,
        }),
      )
    })

    it('should set maxAge to 30 days in seconds', () => {
      const reply = createMockReply()

      setRefreshTokenCookie(reply, 'token')

      const options = reply.setCookie.mock.calls[0]?.[2] as Record<string, unknown> | undefined
      expect(options).toBeDefined()
      expect(options?.maxAge).toBe(REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60)
    })

    it('should set secure=false when config.secureCookies is false', () => {
      const reply = createMockReply()
      setRefreshTokenCookie(reply, 'token')

      const options = reply.setCookie.mock.calls[0]?.[2] as Record<string, unknown> | undefined
      expect(options).toBeDefined()
      // config mock sets secureCookies: false
      expect(options?.secure).toBe(false)
    })

    it('should use a boolean value for the secure option', () => {
      const reply = createMockReply()
      setRefreshTokenCookie(reply, 'token')

      const options = reply.setCookie.mock.calls[0]?.[2] as Record<string, unknown> | undefined
      expect(options).toBeDefined()
      expect(typeof options?.secure).toBe('boolean')
    })

    it('should include signed: true on the cookie', () => {
      const reply = createMockReply()
      setRefreshTokenCookie(reply, 'token')

      const options = reply.setCookie.mock.calls[0]?.[2] as Record<string, unknown> | undefined
      expect(options).toBeDefined()
      expect(options?.signed).toBe(true)
    })
  })

  describe('setRefreshTokenCookie — secureCookies: true', () => {
    // Re-implement calls using the config module directly to simulate secure mode.
    // Because the module-level vi.mock() set secureCookies: false, we replicate
    // the expected behaviour by importing the config and overriding in memory.
    // The simplest approach is to directly verify the contract: when the imported
    // config.secureCookies is true the cookie must have secure: true.
    it('should set secure=true when config.secureCookies is true', async () => {
      // Dynamically import config and temporarily override secureCookies
      const { config } = await import('../config.js')
      const original = config.secureCookies
      // @ts-expect-error — overriding readonly config for test purposes
      config.secureCookies = true
      try {
        const reply = createMockReply()
        setRefreshTokenCookie(reply, 'secure-token')

        const options = reply.setCookie.mock.calls[0]?.[2] as Record<string, unknown> | undefined
        expect(options).toBeDefined()
        expect(options?.secure).toBe(true)
      } finally {
        // @ts-expect-error — restoring readonly config
        config.secureCookies = original
      }
    })

    it('clearRefreshTokenCookie should pass secure=true when config.secureCookies is true', async () => {
      const { config } = await import('../config.js')
      const original = config.secureCookies
      // @ts-expect-error — overriding readonly config for test purposes
      config.secureCookies = true
      try {
        const reply = createMockReply()
        clearRefreshTokenCookie(reply)

        const options = reply.clearCookie.mock.calls[0]?.[1] as Record<string, unknown> | undefined
        expect(options).toBeDefined()
        expect(options?.secure).toBe(true)
      } finally {
        // @ts-expect-error — restoring readonly config
        config.secureCookies = original
      }
    })
  })

  describe('clearRefreshTokenCookie', () => {
    it('should clear cookie with matching options including signed: true', () => {
      const reply = createMockReply()

      clearRefreshTokenCookie(reply)

      expect(reply.clearCookie).toHaveBeenCalledWith(
        'refresh_token',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'strict',
          path: '/auth',
          signed: true,
        }),
      )
    })

    it('should clear cookie with path exactly equal to /auth', () => {
      const reply = createMockReply()

      clearRefreshTokenCookie(reply)

      const options = reply.clearCookie.mock.calls[0]?.[1] as Record<string, unknown> | undefined
      expect(options).toBeDefined()
      expect(options?.path).toBe('/auth')
    })
  })
})
