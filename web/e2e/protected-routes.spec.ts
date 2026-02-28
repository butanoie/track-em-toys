import { test, expect } from '@playwright/test'
import { setupAuthenticated } from './fixtures/auth'

test.describe('Protected routes', () => {
  test('unauthenticated user redirected to /login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('redirect param preserved in URL', async ({ page }) => {
    // Visit a protected path — should redirect to /login with redirect param
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
    // The _authenticated layout passes current href as redirect search param
    await expect(page).toHaveURL(/redirect=/)
  })

  test('authenticated user accesses dashboard directly', async ({ page }) => {
    await setupAuthenticated(page)
    await page.goto('/')

    await expect(page.getByRole('heading', { name: /your collection/i })).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
  })
})
