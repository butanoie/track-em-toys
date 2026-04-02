/**
 * E2E: Collection Management
 *
 * Scenarios from docs/test-scenarios/E2E_COLLECTION_MANAGEMENT.md
 *
 * Auth is handled by e2e-fixtures (user project). Collection API data
 * is mocked via MockCollectionState, which provides stateful responses
 * so mutation chains (add, remove, restore) reflect in subsequent GETs.
 */

import { test, expect } from './fixtures/e2e-fixtures';
import { MockCollectionState, makeCollectionItem, setupCatalogForAddFlow } from './fixtures/mock-helpers';

// ─── Empty State ──────────────────────────────────────────────────────────────

test.describe('Collection empty state', () => {
  test('Given empty collection, When navigating to /collection, Then empty state CTA is displayed', async ({
    page,
  }) => {
    const state = new MockCollectionState([]);
    await state.register(page);
    await page.goto('/collection');

    await expect(page.getByRole('heading', { name: 'My Collection' })).toBeVisible();
    await expect(page.getByText('Your collection is empty')).toBeVisible();
    await expect(page.getByRole('link', { name: /Browse Catalog/ })).toHaveAttribute('href', '/catalog');
  });

  test('Given empty collection, When navigating to /, Then dashboard shows empty collection CTA', async ({ page }) => {
    const state = new MockCollectionState([]);
    await state.register(page);
    await page.goto('/');

    await expect(page.getByText(/Start building your collection/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Browse Catalog/ })).toBeVisible();
  });
});

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

test.describe('Dashboard populated stats', () => {
  test('Given populated collection, When navigating to /, Then stats cards are shown', async ({ page }) => {
    const state = new MockCollectionState([
      makeCollectionItem({ package_condition: 'mint_sealed' }),
      makeCollectionItem({ package_condition: 'mint_sealed' }),
      makeCollectionItem({ package_condition: 'loose_complete' }),
      makeCollectionItem({
        item_id: 'a0000000-0000-4000-a000-000000000002',
        item_name: 'MP-44 Optimus Prime',
        item_slug: 'mp-44-optimus-prime',
        package_condition: 'loose_complete',
      }),
      makeCollectionItem({
        item_id: 'a0000000-0000-4000-a000-000000000003',
        item_name: 'Classified Snake Eyes',
        item_slug: 'classified-snake-eyes',
        franchise: { slug: 'gi-joe', name: 'G.I. Joe' },
        package_condition: 'loose_complete',
      }),
    ]);
    await state.register(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Your Collection' })).toBeVisible();

    const grid = page.locator('.grid');
    await expect(grid.locator('div').filter({ hasText: /^5Copies$/ })).toBeVisible();
    await expect(grid.locator('div').filter({ hasText: /^3Unique Items$/ })).toBeVisible();
    await expect(grid.locator('div').filter({ hasText: /^2Franchises$/ })).toBeVisible();
    await expect(grid.locator('div').filter({ hasText: /^2Mint Sealed$/ })).toBeVisible();

    await expect(page.getByRole('link', { name: /View All/ })).toBeVisible();
  });
});

// ─── Add to Collection (from Catalog) ─────────────────────────────────────────

test.describe('Add to collection from catalog', () => {
  test('Given catalog item detail, When adding to collection, Then success toast and badge appear', async ({
    page,
  }) => {
    const state = new MockCollectionState([]);
    await state.register(page);
    await setupCatalogForAddFlow(page);

    await page.goto('/catalog/transformers/items/legacy-bulkhead');
    await expect(page.getByRole('heading', { name: 'Legacy Bulkhead' })).toBeVisible({ timeout: 10_000 });

    const addButton = page.getByRole('button', { name: 'Add to Collection' });
    await expect(addButton).toBeVisible();
    await addButton.click();

    await expect(page.getByRole('heading', { name: 'Add to Collection' })).toBeVisible();
    await page.getByRole('button', { name: /Loose Complete/ }).click();
    await page.getByRole('button', { name: 'Add to Collection' }).last().click();

    const toast = page.locator('[data-sonner-toast]').filter({ hasText: /Legacy Bulkhead added to your collection/ });
    await expect(toast).toBeVisible({ timeout: 5_000 });

    await expect(page.getByText('In Collection (1)')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: 'Add Copy' })).toBeVisible();
  });

  test('Given item already in collection, When adding a second copy, Then count increments to 2', async ({ page }) => {
    // Start with one copy already in collection
    const state = new MockCollectionState([
      makeCollectionItem({
        item_id: 'a0000000-0000-4000-a000-000000000001',
        package_condition: 'loose_complete',
      }),
    ]);
    await state.register(page);
    await setupCatalogForAddFlow(page);

    await page.goto('/catalog/transformers/items/legacy-bulkhead');
    await expect(page.getByRole('heading', { name: 'Legacy Bulkhead' })).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText('In Collection (1)')).toBeVisible({ timeout: 5_000 });
    const addCopyButton = page.getByRole('button', { name: 'Add Copy' });
    await expect(addCopyButton).toBeVisible();
    await addCopyButton.click();

    await expect(page.getByRole('heading', { name: 'Add Another Copy' })).toBeVisible();
    await page.getByRole('button', { name: 'Add to Collection' }).click();

    const toast = page.locator('[data-sonner-toast]').filter({ hasText: /Legacy Bulkhead added to your collection/ });
    await expect(toast).toBeVisible({ timeout: 5_000 });

    await expect(page.getByText('In Collection (2)')).toBeVisible({ timeout: 5_000 });
  });
});

// ─── Collection Page Display and Filtering ────────────────────────────────────

test.describe('Collection page display and filtering', () => {
  test('Given populated collection, When navigating to /collection, Then stats bar and items are visible', async ({
    page,
  }) => {
    const state = new MockCollectionState([
      makeCollectionItem({ package_condition: 'loose_complete' }),
      makeCollectionItem({
        item_id: 'a0000000-0000-4000-a000-000000000002',
        item_name: 'Classified Snake Eyes',
        item_slug: 'classified-snake-eyes',
        franchise: { slug: 'gi-joe', name: 'G.I. Joe' },
        package_condition: 'mint_sealed',
      }),
    ]);
    await state.register(page);
    await page.goto('/collection');

    await expect(page.getByText('2 items')).toBeVisible({ timeout: 10_000 });

    // Franchise pills
    await expect(page.getByRole('button', { name: 'All' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Transformers/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /G\.I\. Joe/ })).toBeVisible();

    // Item cards with condition badges
    await expect(page.getByText('Legacy Bulkhead')).toBeVisible();
    await expect(page.getByText('Classified Snake Eyes')).toBeVisible();
    await expect(page.getByText('LC')).toBeVisible();
    await expect(page.getByText('MISB')).toBeVisible();
  });

  test('Given collection page, When clicking franchise pill and condition filter, Then URL updates', async ({
    page,
  }) => {
    const state = new MockCollectionState([
      makeCollectionItem({ package_condition: 'loose_complete' }),
      makeCollectionItem({
        item_id: 'a0000000-0000-4000-a000-000000000002',
        item_name: 'Classified Snake Eyes',
        item_slug: 'classified-snake-eyes',
        franchise: { slug: 'gi-joe', name: 'G.I. Joe' },
        package_condition: 'mint_sealed',
      }),
    ]);
    await state.register(page);
    await page.goto('/collection');
    await expect(page.getByText('2 items')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Transformers/ }).click();
    await expect(page).toHaveURL(/franchise=transformers/);

    await page.getByRole('combobox', { name: /Filter by package condition/ }).click();
    await page.getByRole('option', { name: 'Loose Complete' }).click();
    await expect(page).toHaveURL(/package_condition=loose_complete/);
  });

  test('Given collection page, When typing in search, Then URL updates after debounce', async ({ page }) => {
    const state = new MockCollectionState([makeCollectionItem()]);
    await state.register(page);
    await page.goto('/collection');
    await expect(page.getByText('1 item')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('textbox', { name: /Search collection/ }).fill('bulkhead');

    // Wait for debounce (300ms) + URL navigation
    await expect(page).toHaveURL(/search=bulkhead/, { timeout: 2_000 });
  });
});

// ─── Edit and Remove ──────────────────────────────────────────────────────────

test.describe('Edit and remove collection items', () => {
  test('Given collection item, When editing condition, Then success toast appears', async ({ page }) => {
    const state = new MockCollectionState([makeCollectionItem({ package_condition: 'unknown' })]);
    await state.register(page);
    await page.goto('/collection');
    await expect(page.getByText('Legacy Bulkhead')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Edit Legacy Bulkhead/ }).click();
    await expect(page.getByRole('heading', { name: 'Edit Collection Item' })).toBeVisible();

    await page.getByRole('button', { name: /OC Opened Complete/ }).click();
    await page.getByRole('button', { name: 'Save Changes' }).click();

    const toast = page.locator('[data-sonner-toast]').filter({ hasText: /Collection entry updated/ });
    await expect(toast).toBeVisible({ timeout: 5_000 });
  });

  test('Given collection item, When removing and clicking Undo, Then item is restored', async ({ page }) => {
    const state = new MockCollectionState([makeCollectionItem()]);
    await state.register(page);
    await page.goto('/collection');
    await expect(page.getByText('Legacy Bulkhead')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Edit Legacy Bulkhead/ }).click();
    await expect(page.getByRole('heading', { name: 'Edit Collection Item' })).toBeVisible();
    await page.getByRole('button', { name: 'Remove' }).click();

    const removeToast = page.locator('[data-sonner-toast]').filter({ hasText: /Removed from collection/ });
    await expect(removeToast).toBeVisible({ timeout: 5_000 });
    await expect(removeToast).toContainText('Legacy Bulkhead');

    await removeToast.getByRole('button', { name: 'Undo' }).click();

    const restoreToast = page.locator('[data-sonner-toast]').filter({ hasText: /Restored to collection/ });
    await expect(restoreToast).toBeVisible({ timeout: 5_000 });
  });
});

// ─── View Toggle ──────────────────────────────────────────────────────────────

test.describe('View toggle', () => {
  test('Given grid view, When switching to table view, Then table is shown and persists', async ({ page }) => {
    const state = new MockCollectionState([makeCollectionItem()]);
    await state.register(page);
    await page.goto('/collection');
    await expect(page.getByText('Legacy Bulkhead')).toBeVisible({ timeout: 10_000 });

    await expect(page.getByRole('radio', { name: 'Card view' })).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('radio', { name: 'Table view' }).click();
    await expect(page.getByRole('columnheader', { name: 'Item' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Condition' })).toBeVisible();

    const viewMode = await page.evaluate(() => localStorage.getItem('trackem:collection-view'));
    expect(viewMode).toBe('"table"');

    // Navigate away and back — table view persists
    await page.goto('/');
    await page.goto('/collection');
    await expect(page.getByRole('columnheader', { name: 'Item' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('radio', { name: 'Table view' })).toHaveAttribute('aria-checked', 'true');
  });
});

// ─── Navigation ───────────────────────────────────────────────────────────────

test.describe('Collection navigation', () => {
  test('Given user on /collection, Then My Collection nav link has aria-current="page"', async ({ page }) => {
    const state = new MockCollectionState([makeCollectionItem()]);
    await state.register(page);
    await page.goto('/collection');

    const collectionLink = page.getByRole('link', { name: 'My Collection' });
    await expect(collectionLink).toHaveAttribute('aria-current', 'page');
  });
});

// ─── Pagination ───────────────────────────────────────────────────────────────

test.describe('Collection pagination', () => {
  function makeItems(count: number) {
    return Array.from({ length: count }, (_, i) =>
      makeCollectionItem({
        item_id: `a0000000-0000-4000-a000-${String(i + 1).padStart(12, '0')}`,
        item_name: `Item ${String(i + 1).padStart(3, '0')}`,
        item_slug: `item-${String(i + 1).padStart(3, '0')}`,
      })
    );
  }

  test('Given >20 items, When on page 1, Then pagination controls are visible with page 1 active', async ({ page }) => {
    const state = new MockCollectionState(makeItems(25));
    await state.register(page);
    await page.goto('/collection');

    const pagination = page.getByRole('navigation', { name: 'Collection pagination' });
    await expect(pagination).toBeVisible();
    await expect(pagination.getByRole('button', { name: '1' })).toHaveAttribute('aria-current', 'page');
    await expect(pagination.getByRole('button', { name: '2' })).toBeVisible();
  });

  test('Given >20 items, When clicking page 2, Then URL updates and second page items are shown', async ({ page }) => {
    const state = new MockCollectionState(makeItems(25));
    await state.register(page);
    await page.goto('/collection');

    const pagination = page.getByRole('navigation', { name: 'Collection pagination' });
    await pagination.getByRole('button', { name: '2' }).click();

    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText('25 items')).toBeVisible();
  });

  test('Given page 2 active, When changing franchise filter, Then URL resets to page 1', async ({ page }) => {
    const state = new MockCollectionState(makeItems(25));
    await state.register(page);
    await page.goto('/collection?page=2');

    // Apply a filter — this should reset page
    const franchiseFilter = page.getByRole('combobox', { name: /Filter by franchise/ });
    await franchiseFilter.click();
    await page.getByRole('option', { name: /Transformers/ }).click();

    // URL should NOT contain page=2
    await expect(page).toHaveURL(/franchise=transformers/);
    expect(page.url()).not.toContain('page=2');
  });

  test('Given <=20 items, Then pagination is not rendered', async ({ page }) => {
    const state = new MockCollectionState(makeItems(5));
    await state.register(page);
    await page.goto('/collection');

    await expect(page.getByText('5 items')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Collection pagination' })).not.toBeVisible();
  });
});
