/**
 * Playwright globalSetup: seeds test users in the database and writes
 * user JSON files for the e2e-fixtures sessionStorage seeding.
 *
 * Authentication (fresh refresh token) happens per-test in e2e-fixtures.ts
 * to avoid token rotation conflicts between tests.
 */

// Allow self-signed TLS certificates for Node.js fetch() calls.
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

import fs from 'node:fs';
import path from 'node:path';
import { TEST_USERS, type TestRole, type TestUserResponse } from './fixtures/test-users';

// Load VITE_API_URL from web/.env — Playwright doesn't use Vite's dotenv.
function loadViteApiUrl(): string | undefined {
  try {
    const envPath = path.join(import.meta.dirname, '..', '.env');
    const content = fs.readFileSync(envPath, 'utf-8');
    const match = content.match(/^VITE_API_URL=(.+)$/m);
    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}

const API_BASE = process.env.E2E_API_URL ?? loadViteApiUrl() ?? 'https://localhost:3010';
const AUTH_DIR = path.join(import.meta.dirname, '.auth');
const HEALTH_TIMEOUT_MS = 30_000;
const HEALTH_POLL_INTERVAL_MS = 500;

/**
 * Poll the API health endpoint until it responds 200 or timeout.
 */
async function waitForApi(): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API_BASE}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) return;
      lastError = new Error(`Health check returned ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
  }

  throw new Error(`API not ready after ${HEALTH_TIMEOUT_MS}ms: ${String(lastError)}`);
}

/**
 * Seed a test user via test-signin and write the user JSON for fixtures.
 */
async function seedTestUser(role: TestRole): Promise<void> {
  const user = TEST_USERS[role];
  const res = await fetch(`${API_BASE}/auth/test-signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, role: user.role, display_name: user.display_name }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`test-signin failed for ${role}: ${res.status} ${text}`);
  }

  const body = (await res.json()) as { user: TestUserResponse };

  // Write user JSON for sessionStorage seeding by e2e-fixtures
  const userPath = path.join(AUTH_DIR, `${role}-user.json`);
  fs.writeFileSync(userPath, JSON.stringify(body.user, null, 2));
}

/**
 * Main globalSetup function.
 */
export default async function globalSetup(): Promise<void> {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await waitForApi();

  for (const role of ['user', 'curator', 'admin'] as const) {
    await seedTestUser(role);
  }
}
