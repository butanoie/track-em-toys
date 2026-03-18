import { z } from 'zod';

export const UserResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable(),
  display_name: z.string().nullable(),
  avatar_url: z.string().url().nullable(),
  role: z.enum(['user', 'curator', 'admin']),
});

// Web clients receive refresh_token: null (token is in httpOnly cookie)
export const AuthResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.null(),
  user: UserResponseSchema,
});

// Web clients receive refresh_token: null on refresh too
export const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.null(),
});

export const LinkAccountResponseSchema = UserResponseSchema.extend({
  linked_accounts: z.array(
    z.object({
      provider: z.enum(['apple', 'google']),
      email: z.string().nullable(),
    })
  ),
});

export const ApiErrorSchema = z.object({
  error: z.string(),
});

export type UserResponse = z.infer<typeof UserResponseSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type TokenResponse = z.infer<typeof TokenResponseSchema>;
export type LinkAccountResponse = z.infer<typeof LinkAccountResponseSchema>;
export type ApiErrorBody = z.infer<typeof ApiErrorSchema>;
