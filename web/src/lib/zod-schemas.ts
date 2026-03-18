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

// Admin API schemas
export const AdminUserRowSchema = z.object({
  id: z.string().uuid(),
  email: z.string().nullable(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  role: z.enum(['user', 'curator', 'admin']),
  deactivated_at: z.string().nullable(),
  deleted_at: z.string().nullable(),
  created_at: z.string(),
});

export const AdminUsersListSchema = z.object({
  data: z.array(AdminUserRowSchema),
  total_count: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

export type UserResponse = z.infer<typeof UserResponseSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type TokenResponse = z.infer<typeof TokenResponseSchema>;
export type LinkAccountResponse = z.infer<typeof LinkAccountResponseSchema>;
export type ApiErrorBody = z.infer<typeof ApiErrorSchema>;
export type AdminUserRow = z.infer<typeof AdminUserRowSchema>;
export type AdminUsersList = z.infer<typeof AdminUsersListSchema>;
export type UserRole = AdminUserRow['role'];
