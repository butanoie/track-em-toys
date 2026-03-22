import { test, expect } from '@playwright/test';
import { createAuthenticatedContext } from './fixtures/e2e-fixtures';

test.describe('Protected routes', () => {
  test('Given unauthenticated user, When navigating to /, Then redirected to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('Given unauthenticated user, When navigating to /, Then redirect param preserves original URL', async ({
    page,
  }) => {
    // Visit a protected path — should redirect to /login with redirect param
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    // The _authenticated layout passes current href as redirect search param
    await expect(page).toHaveURL(/redirect=/);
  });

  test('Given authenticated user, When navigating to /, Then dashboard is displayed', async ({ browser }) => {
    const { context, page } = await createAuthenticatedContext(browser, 'user');
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /your collection/i })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await context.close();
  });
});
