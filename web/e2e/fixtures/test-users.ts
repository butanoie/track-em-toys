/**
 * Canonical test user definitions for E2E tests.
 *
 * Single source of truth: globalSetup seeds these via /auth/test-signin,
 * and spec files use them for assertions.
 */

import fs from 'node:fs';
import path from 'node:path';

export const TEST_USERS = {
  user: {
    email: 'e2e-user@e2e.test',
    role: 'user' as const,
    display_name: 'E2E User',
  },
  curator: {
    email: 'e2e-curator@e2e.test',
    role: 'curator' as const,
    display_name: 'E2E Curator',
  },
  admin: {
    email: 'e2e-admin@e2e.test',
    role: 'admin' as const,
    display_name: 'E2E Admin',
  },
} as const;

export type TestRole = keyof typeof TEST_USERS;

/** Full user object shape as returned by the API and stored in sessionStorage. */
export interface TestUserResponse {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
}

const AUTH_DIR = path.join(import.meta.dirname, '..', '.auth');

/**
 * Read the complete user JSON written by globalSetup for a given role.
 * Includes `id` and `avatar_url` — required for AuthProvider's
 * `UserResponseSchema.safeParse()` to succeed.
 *
 * Use this in tests that create manual browser contexts via `browser.newContext()`.
 */
export function readTestUser(role: TestRole): TestUserResponse {
  const filePath = path.join(AUTH_DIR, `${role}-user.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as TestUserResponse;
}
