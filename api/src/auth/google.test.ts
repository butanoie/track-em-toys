import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../config.js', () => ({
  config: {
    google: {
      webClientId: 'web-client-id.apps.googleusercontent.com',
      iosClientId: 'ios-client-id.apps.googleusercontent.com',
      desktopClientId: 'desktop-client-id.apps.googleusercontent.com',
    },
  },
}))

const { mockGetPayload, mockVerifyIdToken } = vi.hoisted(() => {
  const mockGetPayload = vi.fn()
  const mockVerifyIdToken = vi.fn().mockResolvedValue({ getPayload: mockGetPayload })
  return { mockGetPayload, mockVerifyIdToken }
})

vi.mock('google-auth-library', () => ({
  OAuth2Client: class MockOAuth2Client {
    verifyIdToken = mockVerifyIdToken
  },
}))

import { verifyGoogleToken } from './google.js'
import { ProviderVerificationError } from './errors.js'

describe('google auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Restore the default mock chain
    mockVerifyIdToken.mockResolvedValue({ getPayload: mockGetPayload })
  })

  it('should verify token and return standardized claims with clientType web (webClientId audience)', async () => {
    mockGetPayload.mockReturnValue({
      sub: 'google-user-456',
      email: 'user@gmail.com',
      email_verified: true,
      name: 'Test User',
      picture: 'https://lh3.googleusercontent.com/photo.jpg',
      aud: 'web-client-id.apps.googleusercontent.com', // webClientId → web
    })

    const claims = await verifyGoogleToken('fake-google-token')

    expect(claims).toEqual({
      sub: 'google-user-456',
      email: 'user@gmail.com',
      email_verified: true,
      name: 'Test User',
      picture: 'https://lh3.googleusercontent.com/photo.jpg',
      client_type: 'web',
    })
  })

  it('should return clientType native when audience matches iosClientId', async () => {
    mockGetPayload.mockReturnValue({
      sub: 'google-user-456',
      email: 'user@gmail.com',
      email_verified: true,
      aud: 'ios-client-id.apps.googleusercontent.com', // iosClientId → native
    })

    const claims = await verifyGoogleToken('fake-google-token')
    expect(claims.client_type).toBe('native')
  })

  it('should return clientType web when audience matches webClientId', async () => {
    mockGetPayload.mockReturnValue({
      sub: 'google-user-456',
      email: 'user@gmail.com',
      email_verified: true,
      aud: 'web-client-id.apps.googleusercontent.com', // webClientId → web
    })

    const claims = await verifyGoogleToken('fake-google-token')
    expect(claims.client_type).toBe('web')
  })

  it('should throw when audience does not match any configured client ID', async () => {
    mockGetPayload.mockReturnValue({
      sub: 'google-user-456',
      email: 'user@gmail.com',
      email_verified: true,
      aud: 'unknown-client-id.apps.googleusercontent.com',
    })

    await expect(verifyGoogleToken('fake-google-token')).rejects.toThrow(
      'does not match any configured client ID',
    )
  })

  it('should pass correct audience to Google verification', async () => {
    mockGetPayload.mockReturnValue({
      sub: 'test',
      email: 'test@gmail.com',
      email_verified: true,
      aud: 'web-client-id.apps.googleusercontent.com',
    })

    await verifyGoogleToken('my-token')

    expect(mockVerifyIdToken).toHaveBeenCalledWith({
      idToken: 'my-token',
      audience: [
        'web-client-id.apps.googleusercontent.com',
        'ios-client-id.apps.googleusercontent.com',
        'desktop-client-id.apps.googleusercontent.com',
      ],
    })
  })

  it('should handle missing optional fields with defaults', async () => {
    mockGetPayload.mockReturnValue({
      sub: 'google-user-789',
      aud: 'web-client-id.apps.googleusercontent.com',
    })

    const claims = await verifyGoogleToken('token')

    expect(claims).toEqual({
      sub: 'google-user-789',
      email: null,
      email_verified: false,
      name: null,
      picture: null,
      client_type: 'web',
    })
  })

  it('should throw when payload is empty', async () => {
    mockGetPayload.mockReturnValue(undefined)

    await expect(verifyGoogleToken('token')).rejects.toThrow('Google token payload is empty')
  })

  it('should wrap validation errors as ProviderVerificationError', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Token has been revoked'))

    await expect(verifyGoogleToken('revoked-token')).rejects.toBeInstanceOf(ProviderVerificationError)
    await expect(verifyGoogleToken('revoked-token')).rejects.toThrow('Token has been revoked')
  })

  it('should propagate network errors as-is without wrapping in ProviderVerificationError', async () => {
    const networkError = Object.assign(new Error('connect ECONNRESET 142.250.80.46:443'), { code: 'ECONNRESET' })
    mockVerifyIdToken.mockRejectedValue(networkError)

    const result = verifyGoogleToken('bad-token')
    await expect(result).rejects.toThrow('connect ECONNRESET 142.250.80.46:443')
    await expect(verifyGoogleToken('bad-token')).rejects.not.toBeInstanceOf(ProviderVerificationError)
  })

  it('should propagate ETIMEDOUT errors as-is', async () => {
    const timeoutError = Object.assign(new Error('connection timed out'), { code: 'ETIMEDOUT' })
    mockVerifyIdToken.mockRejectedValue(timeoutError)

    await expect(verifyGoogleToken('bad-token')).rejects.not.toBeInstanceOf(ProviderVerificationError)
  })

  it('should propagate ENOTFOUND errors as-is', async () => {
    const dnsError = Object.assign(new Error('getaddrinfo ENOTFOUND oauth2.googleapis.com'), { code: 'ENOTFOUND' })
    mockVerifyIdToken.mockRejectedValue(dnsError)

    await expect(verifyGoogleToken('bad-token')).rejects.not.toBeInstanceOf(ProviderVerificationError)
  })

  it('should return clientType native when audience matches desktopClientId', async () => {
    mockGetPayload.mockReturnValue({
      sub: 'google-user-desktop',
      email: 'user@gmail.com',
      email_verified: true,
      aud: 'desktop-client-id.apps.googleusercontent.com',
    })

    const claims = await verifyGoogleToken('fake-google-token')
    expect(claims.client_type).toBe('native')
  })

  it('should return clientType native when aud is an array matching desktopClientId', async () => {
    mockGetPayload.mockReturnValue({
      sub: 'google-user-desktop-arr',
      email: 'user@gmail.com',
      email_verified: true,
      aud: ['desktop-client-id.apps.googleusercontent.com'],
    })

    const claims = await verifyGoogleToken('fake-google-token')
    expect(claims.client_type).toBe('native')
  })

  it('should prefer iosClientId over desktopClientId when both match in aud array', async () => {
    mockGetPayload.mockReturnValue({
      sub: 'google-user-both-native',
      email: 'user@gmail.com',
      email_verified: true,
      aud: ['ios-client-id.apps.googleusercontent.com', 'desktop-client-id.apps.googleusercontent.com'],
    })

    const claims = await verifyGoogleToken('token')
    expect(claims.client_type).toBe('native')
  })

  it('should handle email_verified being undefined', async () => {
    mockGetPayload.mockReturnValue({
      sub: 'google-user',
      email: 'user@gmail.com',
      aud: 'web-client-id.apps.googleusercontent.com',
    })

    const claims = await verifyGoogleToken('token')
    expect(claims.email_verified).toBe(false)
  })

  // [S1] aud claim array-valued tests — mirror of apple.test.ts array-aud tests
  it('should return clientType native when aud is a single-element array matching iosClientId', async () => {
    mockGetPayload.mockReturnValue({
      sub: 'google-user-native',
      email: 'user@gmail.com',
      email_verified: true,
      aud: ['ios-client-id.apps.googleusercontent.com'], // single-element array
    })

    const claims = await verifyGoogleToken('token')
    expect(claims.client_type).toBe('native')
  })

  it('should return clientType web when aud is a single-element array matching webClientId', async () => {
    mockGetPayload.mockReturnValue({
      sub: 'google-user-web',
      email: 'user@gmail.com',
      email_verified: true,
      aud: ['web-client-id.apps.googleusercontent.com'], // single-element array
    })

    const claims = await verifyGoogleToken('token')
    expect(claims.client_type).toBe('web')
  })

  it('should return clientType native when aud is a multi-element array and iosClientId is matched first', async () => {
    mockGetPayload.mockReturnValue({
      sub: 'google-user-multi',
      email: 'user@gmail.com',
      email_verified: true,
      aud: ['ios-client-id.apps.googleusercontent.com', 'web-client-id.apps.googleusercontent.com'],
    })

    // iosClientId is checked before webClientId, so clientType should be 'native'
    const claims = await verifyGoogleToken('token')
    expect(claims.client_type).toBe('native')
  })

  it('should throw when aud is an array that does not match any configured client ID', async () => {
    mockGetPayload.mockReturnValue({
      sub: 'google-user-unknown',
      email: 'user@gmail.com',
      email_verified: true,
      aud: ['unknown-client-id.apps.googleusercontent.com', 'another-unknown-id'],
    })

    await expect(verifyGoogleToken('token')).rejects.toThrow(
      'does not match any configured client ID',
    )
  })
})

// [C1] Tests for the explicit undefined-guard fix: when iosClientId is undefined,
// a token whose audience matches only the iosClientId value must NOT be accepted as
// 'native' — the undefined guard must cause it to fall through to the throw branch.

type GoogleModule = { verifyGoogleToken: (idToken: string) => Promise<unknown> }

describe('google auth — undefined clientId guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyIdToken.mockResolvedValue({ getPayload: mockGetPayload })
  })

  it('falls through to throw when iosClientId is undefined and audience matches the ios client id string', async () => {
    // Override config so that iosClientId is undefined
    vi.resetModules()
    vi.doMock('../config.js', () => ({
      config: {
        google: {
          webClientId: 'web-client-id.apps.googleusercontent.com',
          iosClientId: undefined,
        },
      },
    }))

    // Re-import the module under test with the patched config
    const mod = await import('./google.js') as GoogleModule
    const verifyWithPartialConfig = mod.verifyGoogleToken

    mockGetPayload.mockReturnValue({
      sub: 'google-user-native',
      email: 'user@gmail.com',
      email_verified: true,
      // This audience matches what iosClientId would have been, but since
      // iosClientId is undefined the guard must not match it.
      aud: 'ios-client-id.apps.googleusercontent.com',
    })

    await expect(verifyWithPartialConfig('fake-token')).rejects.toThrow(
      'does not match any configured client ID',
    )

    vi.doUnmock('../config.js')
    vi.resetModules()
  })

  it('falls through to throw when webClientId is undefined and audience matches the web client id string', async () => {
    // Override config so that webClientId is undefined
    vi.resetModules()
    vi.doMock('../config.js', () => ({
      config: {
        google: {
          webClientId: undefined,
          iosClientId: 'ios-client-id.apps.googleusercontent.com',
        },
      },
    }))

    const mod = await import('./google.js') as GoogleModule
    const verifyWithPartialConfig = mod.verifyGoogleToken

    mockGetPayload.mockReturnValue({
      sub: 'google-user-web',
      email: 'user@gmail.com',
      email_verified: true,
      aud: 'web-client-id.apps.googleusercontent.com',
    })

    await expect(verifyWithPartialConfig('fake-token')).rejects.toThrow(
      'does not match any configured client ID',
    )

    vi.doUnmock('../config.js')
    vi.resetModules()
  })

  it('falls through to throw when desktopClientId is undefined and audience matches the desktop client id string', async () => {
    vi.resetModules()
    vi.doMock('../config.js', () => ({
      config: {
        google: {
          webClientId: 'web-client-id.apps.googleusercontent.com',
          iosClientId: 'ios-client-id.apps.googleusercontent.com',
          desktopClientId: undefined,
        },
      },
    }))

    const mod = await import('./google.js') as GoogleModule
    const verifyWithPartialConfig = mod.verifyGoogleToken

    mockGetPayload.mockReturnValue({
      sub: 'google-user-desktop',
      email: 'user@gmail.com',
      email_verified: true,
      aud: 'desktop-client-id.apps.googleusercontent.com',
    })

    await expect(verifyWithPartialConfig('fake-token')).rejects.toThrow(
      'does not match any configured client ID',
    )

    vi.doUnmock('../config.js')
    vi.resetModules()
  })

  it('returns clientType native for desktop audience when iosClientId is undefined', async () => {
    vi.resetModules()
    vi.doMock('../config.js', () => ({
      config: {
        google: {
          webClientId: 'web-client-id.apps.googleusercontent.com',
          iosClientId: undefined,
          desktopClientId: 'desktop-client-id.apps.googleusercontent.com',
        },
      },
    }))

    const mod = await import('./google.js') as GoogleModule
    const verifyWithPartialConfig = mod.verifyGoogleToken

    mockGetPayload.mockReturnValue({
      sub: 'google-user-desktop',
      email: 'user@gmail.com',
      email_verified: true,
      aud: 'desktop-client-id.apps.googleusercontent.com',
    })

    const claims = await verifyWithPartialConfig('fake-token')
    expect(claims).toHaveProperty('client_type', 'native')

    vi.doUnmock('../config.js')
    vi.resetModules()
  })

  it('throws "Google Sign-In is not configured" when all client IDs are undefined', async () => {
    vi.resetModules()
    vi.doMock('../config.js', () => ({
      config: {
        google: {
          webClientId: undefined,
          iosClientId: undefined,
          desktopClientId: undefined,
        },
      },
    }))

    const mod = await import('./google.js') as GoogleModule
    const verifyWithNoConfig = mod.verifyGoogleToken

    await expect(verifyWithNoConfig('fake-token')).rejects.toThrow(
      'Google Sign-In is not configured',
    )

    vi.doUnmock('../config.js')
    vi.resetModules()
  })
})
