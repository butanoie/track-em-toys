import { test, expect } from '@playwright/test'
import { setupAuthenticated, mockRefreshFailure } from './fixtures/auth'

test.describe('Session persistence', () => {
  test('session survives page reload (refresh called again, dashboard shows)', async ({ page }) => {
    await setupAuthenticated(page)
    await page.goto('/')

    await expect(page.getByRole('heading', { name: /your collection/i })).toBeVisible()

    // Reload the page — addInitScript re-populates storage, mock intercepts refresh
    await page.reload()

    await expect(page.getByRole('heading', { name: /your collection/i })).toBeVisible()
  })

  test('session lost when refresh token expired (401 → redirected to login)', async ({ page }) => {
    await setupAuthenticated(page)
    await page.goto('/')

    await expect(page.getByRole('heading', { name: /your collection/i })).toBeVisible()

    // Replace the refresh mock with a failing one for the next page load
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await mockRefreshFailure(page)

    // Remove addInitScript effect by evaluating after routes are set up
    // When we reload, addInitScript still sets localStorage, but the refresh
    // mock now returns 401. AuthProvider.init() will see the session flag,
    // call refresh (which fails), and clear the session.
    await page.reload()

    // AuthProvider detects failed refresh → clears session → redirects to login
    await expect(page).toHaveURL(/\/login/)

    // Session flag should be cleared by AuthProvider after failed refresh
    const hasSession = await page.evaluate(() =>
      localStorage.getItem('trackem:has_session'),
    )
    expect(hasSession).toBeNull()
  })
})
