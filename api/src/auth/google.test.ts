import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../config.js', () => ({
  config: {
    google: {
      webClientId: 'web-client-id.apps.googleusercontent.com',
      iosClientId: 'ios-client-id.apps.googleusercontent.com',
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

describe('google auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Restore the default mock chain
    mockVerifyIdToken.mockResolvedValue({ getPayload: mockGetPayload })
  })

  it('should verify token and return standardized claims', async () => {
    mockGetPayload.mockReturnValue({
      sub: 'google-user-456',
      email: 'user@gmail.com',
      email_verified: true,
      name: 'Test User',
      picture: 'https://lh3.googleusercontent.com/photo.jpg',
    })

    const claims = await verifyGoogleToken('fake-google-token')

    expect(claims).toEqual({
      sub: 'google-user-456',
      email: 'user@gmail.com',
      email_verified: true,
      name: 'Test User',
      picture: 'https://lh3.googleusercontent.com/photo.jpg',
    })
  })

  it('should pass correct audience to Google verification', async () => {
    mockGetPayload.mockReturnValue({
      sub: 'test',
      email: 'test@gmail.com',
      email_verified: true,
    })

    await verifyGoogleToken('my-token')

    expect(mockVerifyIdToken).toHaveBeenCalledWith({
      idToken: 'my-token',
      audience: [
        'web-client-id.apps.googleusercontent.com',
        'ios-client-id.apps.googleusercontent.com',
      ],
    })
  })

  it('should handle missing optional fields with defaults', async () => {
    mockGetPayload.mockReturnValue({
      sub: 'google-user-789',
    })

    const claims = await verifyGoogleToken('token')

    expect(claims).toEqual({
      sub: 'google-user-789',
      email: null,
      email_verified: false,
      name: null,
      picture: null,
    })
  })

  it('should throw when payload is empty', async () => {
    mockGetPayload.mockReturnValue(undefined)

    await expect(verifyGoogleToken('token')).rejects.toThrow('Google token payload is empty')
  })

  it('should propagate verification errors', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Token has been revoked'))

    await expect(verifyGoogleToken('revoked-token')).rejects.toThrow('Token has been revoked')
  })

  it('should handle email_verified being undefined', async () => {
    mockGetPayload.mockReturnValue({
      sub: 'google-user',
      email: 'user@gmail.com',
    })

    const claims = await verifyGoogleToken('token')
    expect(claims.email_verified).toBe(false)
  })
})
