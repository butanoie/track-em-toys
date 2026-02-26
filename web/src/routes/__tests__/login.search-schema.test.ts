import { describe, it, expect } from 'vitest'
import { loginSearchSchema } from '../login'

describe('loginSearchSchema redirect validation', () => {
  it('preserves a simple relative path like /dashboard', () => {
    const result = loginSearchSchema.parse({ redirect: '/dashboard' })
    expect(result.redirect).toBe('/dashboard')
  })

  it('preserves a relative path with query string', () => {
    const result = loginSearchSchema.parse({ redirect: '/collections?sort=name' })
    expect(result.redirect).toBe('/collections?sort=name')
  })

  it('strips a protocol-relative URL starting with //', () => {
    const result = loginSearchSchema.parse({ redirect: '//evil.com/steal' })
    expect(result.redirect).toBeUndefined()
  })

  it('strips an absolute URL starting with https://', () => {
    const result = loginSearchSchema.parse({ redirect: 'https://example.com/path' })
    expect(result.redirect).toBeUndefined()
  })

  it('strips an absolute URL starting with http://', () => {
    const result = loginSearchSchema.parse({ redirect: 'http://evil.com' })
    expect(result.redirect).toBeUndefined()
  })

  it('strips a bare domain without leading slash', () => {
    const result = loginSearchSchema.parse({ redirect: 'evil.com' })
    expect(result.redirect).toBeUndefined()
  })

  it('returns undefined redirect when redirect param is absent', () => {
    const result = loginSearchSchema.parse({})
    expect(result.redirect).toBeUndefined()
  })

  it('returns undefined redirect when redirect is undefined', () => {
    const result = loginSearchSchema.parse({ redirect: undefined })
    expect(result.redirect).toBeUndefined()
  })
})
