import { describe, it, expect } from 'vitest'
import {
  UserResponseSchema,
  AuthResponseSchema,
  TokenResponseSchema,
  LinkAccountResponseSchema,
  ApiErrorSchema,
} from '../zod-schemas'

describe('UserResponseSchema', () => {
  it('parses a valid user with all fields', () => {
    const input = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'test@example.com',
      display_name: 'Test User',
      avatar_url: 'https://example.com/avatar.png',
      role: 'user',
    }
    const result = UserResponseSchema.parse(input)
    expect(result).toEqual(input)
  })

  it('parses a user with null nullable fields', () => {
    const input = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: null,
      display_name: null,
      avatar_url: null,
      role: 'user' as const,
    }
    const result = UserResponseSchema.parse(input)
    expect(result).toEqual(input)
  })

  it('rejects invalid UUID', () => {
    expect(() =>
      UserResponseSchema.parse({
        id: 'not-a-uuid',
        email: null,
        display_name: null,
        avatar_url: null,
        role: 'user',
      })
    ).toThrow()
  })

  it('rejects invalid email format', () => {
    expect(() =>
      UserResponseSchema.parse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'not-an-email',
        display_name: null,
        avatar_url: null,
        role: 'user',
      })
    ).toThrow()
  })

  it('rejects invalid URL for avatar_url', () => {
    expect(() =>
      UserResponseSchema.parse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: null,
        display_name: null,
        avatar_url: 'not-a-url',
        role: 'user',
      })
    ).toThrow()
  })
})

describe('AuthResponseSchema', () => {
  it('parses valid auth response with null refresh_token', () => {
    const input = {
      access_token: 'eyJhbGciOiJFUzI1NiJ9.payload.sig',
      refresh_token: null,
      user: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'test@example.com',
        display_name: 'Test User',
        avatar_url: null,
        role: 'user',
      },
    }
    const result = AuthResponseSchema.parse(input)
    expect(result.access_token).toBe(input.access_token)
    expect(result.refresh_token).toBeNull()
    expect(result.user.email).toBe('test@example.com')
  })

  it('rejects non-null refresh_token (web clients get null)', () => {
    expect(() =>
      AuthResponseSchema.parse({
        access_token: 'token',
        refresh_token: 'some-refresh-token',
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: null,
          display_name: null,
          avatar_url: null,
          role: 'user',
        },
      })
    ).toThrow()
  })

  it('rejects empty access_token', () => {
    expect(() =>
      AuthResponseSchema.parse({
        access_token: '',
        refresh_token: null,
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: null,
          display_name: null,
          avatar_url: null,
          role: 'user',
        },
      })
    ).toThrow()
  })
})

describe('TokenResponseSchema', () => {
  it('parses valid token refresh response', () => {
    const input = { access_token: 'new-access-token', refresh_token: null }
    const result = TokenResponseSchema.parse(input)
    expect(result.access_token).toBe('new-access-token')
    expect(result.refresh_token).toBeNull()
  })

  it('rejects string refresh_token', () => {
    expect(() =>
      TokenResponseSchema.parse({ access_token: 'token', refresh_token: 'rt' })
    ).toThrow()
  })
})

describe('LinkAccountResponseSchema', () => {
  it('parses valid link account response', () => {
    const input = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'test@example.com',
      display_name: 'Test',
      avatar_url: null,
      role: 'user' as const,
      linked_accounts: [
        { provider: 'google' as const, email: 'test@example.com' },
        { provider: 'apple' as const, email: null },
      ],
    }
    const result = LinkAccountResponseSchema.parse(input)
    expect(result.linked_accounts).toHaveLength(2)
  })

  it('rejects unknown provider', () => {
    expect(() =>
      LinkAccountResponseSchema.parse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: null,
        display_name: null,
        avatar_url: null,
        role: 'user',
        linked_accounts: [{ provider: 'facebook', email: null }],
      })
    ).toThrow()
  })
})

describe('ApiErrorSchema', () => {
  it('parses valid error response', () => {
    const result = ApiErrorSchema.parse({ error: 'Unauthorized' })
    expect(result.error).toBe('Unauthorized')
  })

  it('rejects missing error field', () => {
    expect(() => ApiErrorSchema.parse({ message: 'oops' })).toThrow()
  })
})
