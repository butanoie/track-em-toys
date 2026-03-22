/**
 * Custom Playwright test fixture that provides fresh authentication per test.
 *
 * Each test gets a fresh refresh token by calling POST /auth/test-signin
 * via Node.js fetch(), then injects the cookie into the browser context
 * via context.addCookies(). This avoids:
 *   - Token rotation conflicts between tests (fresh token each time)
 *   - Cookie injection quirks with storageState (secure flag, domain matching)
 *   - Browser launch overhead (uses Node.js fetch, not page.evaluate)
 */

// Allow self-signed TLS certificates for Node.js fetch() in worker processes.
// Each Playwright worker is a separate process — globalSetup's env var doesn't propagate.
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

import { test as base } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { TEST_USERS, readTestUser, type TestRole, type TestUserResponse } from './test-users';

function isTestRole(name: string): name is TestRole {
  return name in TEST_USERS;
}

function loadViteApiUrl(): string | undefined {
  try {
    const envPath = path.join(import.meta.dirname, '..', '..', '.env');
    const content = fs.readFileSync(envPath, 'utf-8');
    const match = content.match(/^VITE_API_URL=(.+)$/m);
    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}

const API_BASE = process.env.E2E_API_URL ?? loadViteApiUrl() ?? 'https://localhost:3010';
const API_HOSTNAME = new URL(API_BASE).hostname;

/**
 * Call test-signin via Node.js fetch and return the Set-Cookie header value.
 */
async function freshTestSignin(role: TestRole): Promise<{ setCookieHeader: string; user: TestUserResponse }> {
  const testUser = TEST_USERS[role];
  const res = await fetch(`${API_BASE}/auth/test-signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testUser.email, role: testUser.role, display_name: testUser.display_name }),
  });
  if (!res.ok) {
    throw new Error(`test-signin failed for ${role}: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { user: TestUserResponse };
  const setCookieHeaders = res.headers.getSetCookie();
  const setCookieHeader = setCookieHeaders.find((h) => h.startsWith('refresh_token='));
  if (!setCookieHeader) {
    throw new Error(`test-signin for ${role}: no refresh_token cookie`);
  }
  return { setCookieHeader, user: body.user };
}

/**
 * Parse the raw cookie value from a Set-Cookie header.
 * Returns just the name=value part (before the first ;).
 */
function parseCookieValue(setCookieHeader: string): string {
  const eqIdx = setCookieHeader.indexOf('=');
  const semiIdx = setCookieHeader.indexOf(';');
  return setCookieHeader.substring(eqIdx + 1, semiIdx > 0 ? semiIdx : undefined);
}

/**
 * Extended test fixture that:
 * 1. Gets a fresh refresh token cookie via test-signin (Node.js fetch)
 * 2. Injects it into the browser context via addCookies
 * 3. Seeds sessionStorage with the user profile via addInitScript
 */
export const test = base.extend({
  context: async ({ context }, use, testInfo) => {
    const projectName = testInfo.project.name;

    if (isTestRole(projectName)) {
      const { setCookieHeader } = await freshTestSignin(projectName);
      const cookieValue = parseCookieValue(setCookieHeader);

      // Inject the fresh cookie into the browser context
      await context.addCookies([
        {
          name: 'refresh_token',
          value: cookieValue,
          domain: API_HOSTNAME,
          path: '/auth',
          httpOnly: true,
          secure: true,
          sameSite: 'Lax',
          expires: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        },
      ]);
    }

    // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture, not a React hook
    await use(context);
  },
  page: async ({ page }, use, testInfo) => {
    const projectName = testInfo.project.name;

    if (isTestRole(projectName)) {
      const user = readTestUser(projectName);
      await page.addInitScript(
        ({ userData, userKey, flagKey }) => {
          localStorage.setItem(flagKey, '1');
          sessionStorage.setItem(userKey, JSON.stringify(userData));
        },
        { userData: user, userKey: 'trackem:user', flagKey: 'trackem:has_session' }
      );
    }

    // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture, not a React hook
    await use(page);
  },
});

export { expect } from '@playwright/test';

/**
 * Create an authenticated browser context for a specific role.
 * Use this in tests that need a DIFFERENT role than their project
 * (e.g., testing non-admin access in the admin project).
 */
export async function createAuthenticatedContext(
  browser: import('@playwright/test').Browser,
  role: TestRole
): Promise<{ context: import('@playwright/test').BrowserContext; page: import('@playwright/test').Page }> {
  const { setCookieHeader } = await freshTestSignin(role);
  const cookieValue = parseCookieValue(setCookieHeader);
  const user = readTestUser(role);

  const baseURL = `https://${API_HOSTNAME}:4173`;
  const context = await browser.newContext({ ignoreHTTPSErrors: true, baseURL });
  await context.addCookies([
    {
      name: 'refresh_token',
      value: cookieValue,
      domain: API_HOSTNAME,
      path: '/auth',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      expires: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    },
  ]);

  const page = await context.newPage();
  await page.addInitScript(
    ({ userData, userKey, flagKey }) => {
      localStorage.setItem(flagKey, '1');
      sessionStorage.setItem(userKey, JSON.stringify(userData));
    },
    { userData: user, userKey: 'trackem:user', flagKey: 'trackem:has_session' }
  );

  return { context, page };
}
