import { test, expect } from '@playwright/test'

test.describe('Login page', () => {
  test('renders heading and Apple sign-in button', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByRole('heading', { name: /Track.em Toys/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in with apple/i })).toBeVisible()
  })
})
