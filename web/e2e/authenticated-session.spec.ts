import { test, expect } from './fixtures/e2e-fixtures';
import { TEST_USERS } from './fixtures/test-users';

test.describe('Authenticated session', () => {
  test('Given valid session, When navigating to /, Then dashboard shows collection heading and user name', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /your collection/i })).toBeVisible();
    await expect(page.getByText(TEST_USERS.user.display_name)).toBeVisible();
  });

  /**
   * ```gherkin
   * Scenario: User signs out successfully
   *   Given the user is on the dashboard
   *   When they click the "Sign Out" button
   *   Then they are redirected to /login
   *   And the session flag is removed from localStorage
   * ```
   */
  test('Given user on dashboard, When clicking sign out, Then redirected to /login and session cleared', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /your collection/i })).toBeVisible();

    await page.getByRole('button', { name: /sign out/i }).click();

    await expect(page).toHaveURL(/\/login/);

    const hasSession = await page.evaluate(() => localStorage.getItem('trackem:has_session'));
    expect(hasSession).toBeNull();
  });
});
