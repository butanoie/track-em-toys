import { test, expect } from '@playwright/test'
import { setupAuthenticated, validUser } from './fixtures/auth'

test.describe('Authenticated session', () => {
  test('authenticated user sees dashboard with collection heading and user name', async ({ page }) => {
    await setupAuthenticated(page)
    await page.goto('/')

    await expect(page.getByRole('heading', { name: /your collection/i })).toBeVisible()
    await expect(page.getByText(validUser.display_name!)).toBeVisible()
  })

  test('sign out redirects to /login and clears session flag', async ({ page }) => {
    await setupAuthenticated(page)
    await page.goto('/')

    await expect(page.getByRole('heading', { name: /your collection/i })).toBeVisible()

    await page.getByRole('button', { name: /sign out/i }).click()

    await expect(page).toHaveURL(/\/login/)

    const hasSession = await page.evaluate(() =>
      localStorage.getItem('trackem:has_session'),
    )
    expect(hasSession).toBeNull()
  })
})
