import { describe, it, expect, vi } from 'vitest'
import { REFRESH_TOKEN_COOKIE, setRefreshTokenCookie, clearRefreshTokenCookie } from './cookies.js'

function createMockReply() {
  return {
    setCookie: vi.fn(),
    clearCookie: vi.fn(),
  }
}

describe('cookies', () => {
  describe('REFRESH_TOKEN_COOKIE', () => {
    it('should be "refresh_token"', () => {
      expect(REFRESH_TOKEN_COOKIE).toBe('refresh_token')
    })
  })

  describe('setRefreshTokenCookie', () => {
    it('should set httpOnly cookie with correct options', () => {
      const reply = createMockReply()

      setRefreshTokenCookie(reply as never, 'test-token-value')

      expect(reply.setCookie).toHaveBeenCalledWith(
        'refresh_token',
        'test-token-value',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'strict',
          path: '/auth',
        }),
      )
    })

    it('should set maxAge to 30 days in seconds', () => {
      const reply = createMockReply()

      setRefreshTokenCookie(reply as never, 'token')

      const options = reply.setCookie.mock.calls[0][2]
      expect(options.maxAge).toBe(30 * 24 * 60 * 60)
    })

    it('should set secure=false in non-production', () => {
      const original = process.env.NODE_ENV
      delete process.env.NODE_ENV

      const reply = createMockReply()
      setRefreshTokenCookie(reply as never, 'token')

      const options = reply.setCookie.mock.calls[0][2]
      expect(options.secure).toBe(false)

      process.env.NODE_ENV = original
    })

    it('should set secure=true in production', () => {
      const original = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const reply = createMockReply()
      setRefreshTokenCookie(reply as never, 'token')

      const options = reply.setCookie.mock.calls[0][2]
      expect(options.secure).toBe(true)

      process.env.NODE_ENV = original
    })
  })

  describe('clearRefreshTokenCookie', () => {
    it('should clear cookie with matching options', () => {
      const reply = createMockReply()

      clearRefreshTokenCookie(reply as never)

      expect(reply.clearCookie).toHaveBeenCalledWith(
        'refresh_token',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'strict',
          path: '/auth',
        }),
      )
    })
  })
})
