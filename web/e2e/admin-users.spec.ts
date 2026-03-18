/**
 * E2E: Admin Dashboard — User Management
 *
 * Scenarios from docs/test-scenarios/E2E_ADMIN_DASHBOARD.md
 *
 * TODO: These tests currently use mocked API responses (page.route()).
 * A proper E2E auth strategy that authenticates against the real API
 * is needed before these provide true end-to-end confidence.
 * See: https://github.com/butanoie/track-em-toys/issues/49
 */

import { test, expect } from '@playwright/test';
import { setupAuthenticated, validUser, fakeJwt } from './fixtures/auth';

// --- Fixtures ---

const adminUser = {
  ...validUser,
  role: 'admin',
};

const mockUsers = [
  {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    email: 'alice@example.com',
    display_name: 'Alice',
    avatar_url: null,
    role: 'user',
    deactivated_at: null,
    deleted_at: null,
    created_at: '2026-01-15T10:00:00.000Z',
  },
  {
    id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    email: 'bob@example.com',
    display_name: 'Bob the Curator',
    avatar_url: null,
    role: 'curator',
    deactivated_at: null,
    deleted_at: null,
    created_at: '2026-02-10T10:00:00.000Z',
  },
  {
    id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
    email: 'deactivated@example.com',
    display_name: 'Deactivated User',
    avatar_url: null,
    role: 'user',
    deactivated_at: '2026-03-01T10:00:00.000Z',
    deleted_at: null,
    created_at: '2026-01-01T10:00:00.000Z',
  },
  {
    id: 'd4e5f6a7-b8c9-0123-defa-234567890123',
    email: null,
    display_name: null,
    avatar_url: null,
    role: 'user',
    deactivated_at: '2026-03-01T10:00:00.000Z',
    deleted_at: '2026-03-15T10:00:00.000Z',
    created_at: '2025-12-01T10:00:00.000Z',
  },
];

// --- Helpers ---

async function setupAdminSession(page: import('@playwright/test').Page) {
  // Override the default user with admin role in sessionStorage
  await page.route('**/auth/refresh', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: fakeJwt(), refresh_token: null }),
    })
  );
  await page.route('**/auth/logout', (route) => route.fulfill({ status: 204, body: '' }));
  await page.addInitScript(
    ({ user, flagKey, userKey }) => {
      localStorage.setItem(flagKey, '1');
      sessionStorage.setItem(userKey, JSON.stringify(user));
    },
    { user: adminUser, flagKey: 'trackem:has_session', userKey: 'trackem:user' }
  );
}

async function mockAdminUsersEndpoint(page: import('@playwright/test').Page, users = mockUsers) {
  // Match only API fetch requests to /admin/users, not SPA page navigations.
  // The API URL differs from the SPA URL by origin (different port), but both
  // share the /admin/users path. Filter by resourceType to avoid intercepting
  // the HTML document request that loads the SPA route.
  await page.route('**/admin/users*', (route) => {
    // Skip HTML document requests (SPA page navigation) — only intercept API fetch calls
    if (route.request().resourceType() === 'document') {
      return route.continue();
    }
    if (route.request().method() === 'GET' && route.request().resourceType() === 'fetch') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: users,
          total_count: users.length,
          limit: 20,
          offset: 0,
        }),
      });
    }
    return route.continue();
  });
}

// --- Access Guard ---

test.describe('Admin access guard', () => {
  test('Given non-admin user, When navigating to /admin/users, Then redirected to /', async ({ page }) => {
    await setupAuthenticated(page); // default user has no admin role
    await page.goto('/admin/users');
    await expect(page).toHaveURL('/');
  });

  test('Given admin user, When navigating to /admin/users, Then admin page is displayed', async ({ page }) => {
    await setupAdminSession(page);
    await mockAdminUsersEndpoint(page);
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  });
});

// --- Navigation ---

test.describe('Admin navigation', () => {
  test('Given admin on dashboard, When clicking Admin link, Then navigated to /admin/users', async ({ page }) => {
    await setupAdminSession(page);
    await mockAdminUsersEndpoint(page);
    await page.goto('/');
    await page.getByRole('link', { name: 'Admin' }).click();
    await expect(page).toHaveURL(/\/admin\/users/);
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  });

  test('Given admin on /admin/users, When clicking Back to App, Then navigated to /', async ({ page }) => {
    await setupAdminSession(page);
    await mockAdminUsersEndpoint(page);
    await page.goto('/admin/users');
    await page.getByRole('link', { name: /back to app/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('Given non-admin user on dashboard, Then no Admin link is visible', async ({ page }) => {
    await setupAuthenticated(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /your collection/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Admin' })).not.toBeVisible();
  });
});

// --- User List ---

test.describe('User list', () => {
  test('Given admin on /admin/users, Then user table displays all users', async ({ page }) => {
    await setupAdminSession(page);
    await mockAdminUsersEndpoint(page);
    await page.goto('/admin/users');

    // Wait for the table to populate from the mocked API response
    await expect(page.getByText('Showing 1–4 of 4')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('cell', { name: /Alice/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: /Bob the Curator/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: /Deactivated User/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: /Deleted user/ })).toBeVisible();
  });

  test('Given admin on /admin/users, Then status badges are displayed correctly', async ({ page }) => {
    await setupAdminSession(page);
    await mockAdminUsersEndpoint(page);
    await page.goto('/admin/users');

    // Active, Deactivated, and Purged badges visible in the status column
    await expect(page.getByText('Active').first()).toBeVisible();
    await expect(page.getByText('Deactivated').first()).toBeVisible();
    await expect(page.getByText('Purged')).toBeVisible();
  });

  test('Given no users match filter, Then empty state message is shown', async ({ page }) => {
    await setupAdminSession(page);
    await mockAdminUsersEndpoint(page, []);
    await page.goto('/admin/users');

    await expect(page.getByText('No users found matching your filters.')).toBeVisible();
  });
});

// --- GDPR Purge ---

test.describe('GDPR purge', () => {
  test('Given purge dialog open, When typing wrong text, Then confirm button stays disabled', async ({ page }) => {
    await setupAdminSession(page);
    await mockAdminUsersEndpoint(page, [mockUsers[0]!]);
    await page.goto('/admin/users');

    await page.getByRole('button', { name: 'Purge' }).click();
    await expect(page.getByText('GDPR Purge')).toBeVisible();

    const confirmButton = page.getByRole('button', { name: 'Purge User' });
    await expect(confirmButton).toBeDisabled();

    await page.getByRole('textbox').fill('delete');
    await expect(confirmButton).toBeDisabled();

    await page.getByRole('textbox').fill('DELETE');
    await expect(confirmButton).toBeEnabled();
  });
});

// --- Mutation Happy Paths ---

test.describe('Mutation happy paths', () => {
  test('Given admin changes role, When confirmed, Then success toast is shown', async ({ page }) => {
    await setupAdminSession(page);
    await mockAdminUsersEndpoint(page, [mockUsers[0]!]);
    await page.goto('/admin/users');
    await expect(page.getByRole('cell', { name: /Alice/ })).toBeVisible();

    // Mock the PATCH role endpoint
    await page.route('**/admin/users/*/role', (route) => {
      if (route.request().method() === 'PATCH') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...mockUsers[0]!, role: 'curator' }),
        });
      }
      return route.continue();
    });

    // Open role select and change to curator (disambiguate from filter combobox)
    await page.getByRole('combobox', { name: /Change role for alice/i }).click();
    await page.getByRole('option', { name: 'Curator' }).click();

    // Confirm dialog appears and click confirm
    await expect(page.getByText('Change User Role')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();

    // Success toast appears
    const toast = page.locator('[data-sonner-toast]').filter({ hasText: /Role updated to curator/i });
    await expect(toast).toBeVisible({ timeout: 5_000 });
  });

  test('Given admin deactivates user, When confirmed, Then success toast is shown', async ({ page }) => {
    await setupAdminSession(page);
    await mockAdminUsersEndpoint(page, [mockUsers[0]!]);
    await page.goto('/admin/users');
    await expect(page.getByRole('cell', { name: /Alice/ })).toBeVisible();

    // Mock the deactivate endpoint
    await page.route('**/admin/users/*/deactivate', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...mockUsers[0]!, deactivated_at: '2026-03-18T00:00:00.000Z' }),
        });
      }
      return route.continue();
    });

    await page.getByRole('button', { name: 'Deactivate' }).click();
    await expect(page.getByText('Deactivate User')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();

    const toast = page.locator('[data-sonner-toast]').filter({ hasText: /alice@example\.com deactivated/i });
    await expect(toast).toBeVisible({ timeout: 5_000 });
  });

  test('Given admin reactivates user, When confirmed, Then success toast is shown', async ({ page }) => {
    await setupAdminSession(page);
    await mockAdminUsersEndpoint(page, [mockUsers[2]!]);
    await page.goto('/admin/users');
    await expect(page.getByRole('cell', { name: /Deactivated User/ })).toBeVisible();

    // Mock the reactivate endpoint
    await page.route('**/admin/users/*/reactivate', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...mockUsers[2]!, deactivated_at: null }),
        });
      }
      return route.continue();
    });

    await page.getByRole('button', { name: 'Reactivate' }).click();
    await expect(page.getByText('Reactivate User')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();

    const toast = page.locator('[data-sonner-toast]').filter({ hasText: /deactivated@example\.com reactivated/i });
    await expect(toast).toBeVisible({ timeout: 5_000 });
  });

  test('Given admin purges user, When confirmed with DELETE, Then success toast is shown', async ({ page }) => {
    await setupAdminSession(page);
    await mockAdminUsersEndpoint(page, [mockUsers[0]!]);
    await page.goto('/admin/users');
    await expect(page.getByRole('cell', { name: /Alice/ })).toBeVisible();

    // Mock the DELETE endpoint — match UUID path segment only
    await page.route(/\/admin\/users\/[0-9a-f-]{36}$/, (route) => {
      if (route.request().method() === 'DELETE') {
        return route.fulfill({ status: 204, body: '' });
      }
      return route.continue();
    });

    await page.getByRole('button', { name: 'Purge' }).click();
    await expect(page.getByText('GDPR Purge')).toBeVisible();
    await page.getByRole('textbox').fill('DELETE');
    await page.getByRole('button', { name: 'Purge User' }).click();

    const toast = page.locator('[data-sonner-toast]').filter({ hasText: /User data purged permanently/i });
    await expect(toast).toBeVisible({ timeout: 5_000 });
  });
});

// --- Server Error Handling ---

test.describe('Server error handling', () => {
  test('Given server returns 403, When mutation attempted, Then ErrorBanner is shown (not toast)', async ({ page }) => {
    await setupAdminSession(page);
    await mockAdminUsersEndpoint(page, [mockUsers[0]!]);
    await page.goto('/admin/users');
    await expect(page.getByRole('cell', { name: /Alice/ })).toBeVisible();

    // Mock deactivate to return 403
    await page.route('**/admin/users/*/deactivate', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Cannot perform this action on your own account' }),
        });
      }
      return route.continue();
    });

    await page.getByRole('button', { name: 'Deactivate' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();

    // ErrorBanner should appear
    await expect(page.getByRole('alert')).toContainText('Cannot perform this action on your own account');

    // No toast should be visible
    await expect(page.locator('[data-sonner-toast]')).not.toBeVisible();
  });

  test('Given server returns 409, When mutation attempted, Then ErrorBanner is shown (not toast)', async ({ page }) => {
    await setupAdminSession(page);
    await mockAdminUsersEndpoint(page, [mockUsers[0]!]);
    await page.goto('/admin/users');
    await expect(page.getByRole('cell', { name: /Alice/ })).toBeVisible();

    // Mock role change to return 409
    await page.route('**/admin/users/*/role', (route) => {
      if (route.request().method() === 'PATCH') {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Cannot demote the last admin' }),
        });
      }
      return route.continue();
    });

    await page.getByRole('combobox', { name: /Change role for alice/i }).click();
    await page.getByRole('option', { name: 'Curator' }).click();
    await expect(page.getByText('Change User Role')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByRole('alert')).toContainText('Cannot demote the last admin');
    await expect(page.locator('[data-sonner-toast]')).not.toBeVisible();
  });
});
