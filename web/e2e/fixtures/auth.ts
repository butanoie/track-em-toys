import { type Page } from '@playwright/test';

/** Test user matching the UserResponse Zod schema */
export const validUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  display_name: 'Test User',
  avatar_url: null,
  role: 'user',
};

/**
 * Creates a base64-encoded JWT with an `exp` claim.
 * Not cryptographically signed — the API is mocked in E2E tests.
 * Uses Buffer (Node.js) since this runs in Playwright's Node context.
 */
export function fakeJwt(expOffsetMs = 3600_000): string {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64');
  const payload = Buffer.from(
    JSON.stringify({
      sub: validUser.id,
      exp: Math.floor((Date.now() + expOffsetMs) / 1000),
    })
  ).toString('base64');
  return `${header}.${payload}.fakesig`;
}

/** Intercept POST /auth/signin → 200 with token + user */
export async function mockSigninSuccess(page: Page): Promise<void> {
  await page.route('**/auth/signin', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: fakeJwt(),
        refresh_token: null,
        user: validUser,
      }),
    })
  );
}

/** Intercept POST /auth/refresh → 200 with new token */
export async function mockRefreshSuccess(page: Page): Promise<void> {
  await page.route('**/auth/refresh', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: fakeJwt(),
        refresh_token: null,
      }),
    })
  );
}

/** Intercept POST /auth/refresh → 401 */
export async function mockRefreshFailure(page: Page): Promise<void> {
  await page.route('**/auth/refresh', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unauthorized' }),
    })
  );
}

/** Intercept POST /auth/logout → 204 */
export async function mockLogoutSuccess(page: Page): Promise<void> {
  await page.route('**/auth/logout', (route) => route.fulfill({ status: 204, body: '' }));
}

/**
 * Sets up an authenticated session by:
 * 1. Mocking refresh and logout endpoints
 * 2. Using addInitScript to populate localStorage/sessionStorage BEFORE
 *    the page's JavaScript runs (critical timing — AuthProvider.init()
 *    checks the session flag synchronously on mount)
 *
 * After calling this, navigate to the desired page with page.goto().
 * AuthProvider will detect the session flag, call refresh (mocked),
 * and hydrate the user from sessionStorage.
 */
export async function setupAuthenticated(page: Page): Promise<void> {
  await mockRefreshSuccess(page);
  await mockLogoutSuccess(page);

  // addInitScript runs before ANY page JavaScript on every navigation.
  // This ensures localStorage and sessionStorage are populated before
  // React mounts and AuthProvider.init() checks sessionFlag.check().
  await page.addInitScript(
    ({ user, flagKey, userKey }) => {
      localStorage.setItem(flagKey, '1');
      sessionStorage.setItem(userKey, JSON.stringify(user));
    },
    { user: validUser, flagKey: 'trackem:has_session', userKey: 'trackem:user' }
  );
}
