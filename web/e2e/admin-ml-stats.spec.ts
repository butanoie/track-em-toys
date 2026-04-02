/**
 * E2E: Admin ML Stats Dashboard
 *
 * Scenarios from docs/test-scenarios/E2E_ML_PHOTO_IDENTIFICATION.md (Admin section)
 *
 * Auth is handled by e2e-fixtures (admin project). ML stats API data
 * is mocked via page.route().
 */

import { test, expect, createAuthenticatedContext } from './fixtures/e2e-fixtures';
import { mockMlStats } from './fixtures/ml-helpers';

// ─── Access Guard ────────────────────────────────────────────────────────────

test.describe('ML Stats access guard', () => {
  test('Given non-admin user, When navigating to /admin/ml, Then redirected to /', async ({ browser }) => {
    const { context, page } = await createAuthenticatedContext(browser, 'user');
    await page.goto('/admin/ml');
    await expect(page).toHaveURL('/');
    await context.close();
  });

  test('Given admin user, When navigating to /admin, Then redirected to /admin/ml', async ({ page }) => {
    await mockMlStats(page);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/ml/, { timeout: 10_000 });
  });
});

// ─── Dashboard Display ───────────────────────────────────────────────────────

test.describe('ML Stats dashboard', () => {
  test('Given admin on /admin/ml, Then stat cards are displayed', async ({ page }) => {
    await mockMlStats(page);
    await page.goto('/admin/ml');

    await expect(page.getByRole('heading', { name: 'ML Stats' })).toBeVisible({ timeout: 10_000 });

    // Stat cards — scope to the stats grid to avoid matching recharts legend text
    const statsGrid = page.locator('.grid').first();
    await expect(statsGrid.getByText('Total Scans')).toBeVisible();
    await expect(statsGrid.getByText('150')).toBeVisible();

    await expect(statsGrid.getByText('Acceptance Rate')).toBeVisible();
    await expect(statsGrid.getByText('30.0%')).toBeVisible();

    await expect(statsGrid.getByText('Error Rate')).toBeVisible();
    await expect(statsGrid.getByText('5.3%')).toBeVisible();

    await expect(statsGrid.getByText('Completed')).toBeVisible();
    await expect(statsGrid.getByText('120')).toBeVisible();
  });

  test('Given admin on /admin/ml, Then daily activity chart is rendered', async ({ page }) => {
    await mockMlStats(page);
    await page.goto('/admin/ml');

    await expect(page.getByText('Daily Activity')).toBeVisible({ timeout: 10_000 });

    // recharts renders SVG — check for the chart container
    const dailyChart = page.locator('.recharts-responsive-container').first();
    await expect(dailyChart).toBeVisible();
  });

  test('Given admin on /admin/ml, Then model comparison chart is rendered', async ({ page }) => {
    await mockMlStats(page);
    await page.goto('/admin/ml');

    // Both chart section titles should be visible
    await expect(page.getByText('Daily Activity')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Model Comparison')).toBeVisible();

    // The model comparison card should contain a recharts chart
    const modelCard = page.locator('text=Model Comparison').locator('..').locator('..');
    await expect(modelCard.locator('.recharts-responsive-container')).toBeVisible();
  });
});

// ─── Date Range Selector ─────────────────────────────────────────────────────

test.describe('ML Stats date range', () => {
  test('Given admin on /admin/ml, When selecting "Last 30 days", Then URL updates', async ({ page }) => {
    await mockMlStats(page);
    await page.goto('/admin/ml');

    await expect(page.getByRole('heading', { name: 'ML Stats' })).toBeVisible({ timeout: 10_000 });

    // Open the days selector and change range
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Last 30 days' }).click();

    await expect(page).toHaveURL(/days=30/);
  });

  test('Given admin visits /admin/ml?days=90, Then "Last 90 days" is shown in selector', async ({ page }) => {
    await mockMlStats(page);
    await page.goto('/admin/ml?days=90');

    await expect(page.getByRole('heading', { name: 'ML Stats' })).toBeVisible({ timeout: 10_000 });

    // The selector should display "Last 90 days"
    await expect(page.getByRole('combobox')).toContainText('Last 90 days');
  });
});

// ─── Navigation ──────────────────────────────────────────────────────────────

test.describe('ML Stats navigation', () => {
  test('Given admin on /admin/ml, Then sidebar shows ML Stats as active', async ({ page }) => {
    await mockMlStats(page);
    await page.goto('/admin/ml');

    await expect(page.getByRole('heading', { name: 'ML Stats' })).toBeVisible({ timeout: 10_000 });

    // Sidebar link should be highlighted (bg-accent class indicates active)
    const mlLink = page.locator('aside').getByRole('link', { name: 'ML Stats' });
    await expect(mlLink).toBeVisible();
    await expect(mlLink).toHaveClass(/bg-accent/);
  });
});
