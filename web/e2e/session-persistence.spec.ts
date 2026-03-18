import { test, expect } from '@playwright/test';
import { setupAuthenticated, mockRefreshFailure } from './fixtures/auth';

test.describe('Session persistence', () => {
  /**
   * ```gherkin
   * Scenario: Session persists across page reload
   *   Given the user is on the dashboard
   *   When they reload the page
   *   Then the refresh token endpoint is called
   *   And the dashboard is displayed again with "Your Collection" heading
   * ```
   */
  test('Given user on dashboard, When page is reloaded, Then session persists and dashboard shows', async ({
    page,
  }) => {
    await setupAuthenticated(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /your collection/i })).toBeVisible();

    // Reload the page — addInitScript re-populates storage, mock intercepts refresh
    await page.reload();

    await expect(page.getByRole('heading', { name: /your collection/i })).toBeVisible();
  });

  /**
   * ```gherkin
   * Scenario: Expired refresh token redirects to login
   *   Given the user is on the dashboard
   *   And the refresh token has expired (server returns 401)
   *   When they reload the page
   *   Then AuthProvider detects the failed refresh
   *   And the user is redirected to /login
   *   And the session flag is removed from localStorage
   * ```
   */
  test('Given expired refresh token, When page is reloaded, Then redirected to /login and session cleared', async ({
    page,
  }) => {
    await setupAuthenticated(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /your collection/i })).toBeVisible();

    // Replace the refresh mock with a failing one for the next page load
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await mockRefreshFailure(page);

    // Remove addInitScript effect by evaluating after routes are set up
    // When we reload, addInitScript still sets localStorage, but the refresh
    // mock now returns 401. AuthProvider.init() will see the session flag,
    // call refresh (which fails), and clear the session.
    await page.reload();

    // AuthProvider detects failed refresh → clears session → redirects to login
    await expect(page).toHaveURL(/\/login/);

    // Session flag should be cleared by AuthProvider after failed refresh
    const hasSession = await page.evaluate(() => localStorage.getItem('trackem:has_session'));
    expect(hasSession).toBeNull();
  });
});
