/**
 * E2E: Catalog Search — search input, grouped results, detail panels
 *
 * Tests use mocked API responses (page.route()) — no real API server required.
 */

import { test, expect } from '@playwright/test';
import { setupAuthenticated } from './fixtures/auth';

// --- Fixtures ---

const mockSearchResults = {
  data: [
    {
      entity_type: 'character',
      id: 'c-1',
      name: 'Optimus Prime',
      slug: 'optimus-prime',
      franchise: { slug: 'transformers', name: 'Transformers' },
      character: null,
      manufacturer: null,
      toy_line: null,
      size_class: null,
      year_released: null,
      is_third_party: null,
      data_quality: null,
    },
    {
      entity_type: 'item',
      id: 'i-1',
      name: 'MP-44 Optimus Prime',
      slug: 'mp-44-optimus-prime',
      franchise: { slug: 'transformers', name: 'Transformers' },
      character: { slug: 'optimus-prime', name: 'Optimus Prime' },
      manufacturer: { slug: 'takara-tomy', name: 'Takara Tomy' },
      toy_line: { slug: 'masterpiece', name: 'Masterpiece' },
      size_class: 'Leader',
      year_released: 2019,
      is_third_party: false,
      data_quality: 'verified',
    },
  ],
  page: 1,
  limit: 20,
  total_count: 2,
};

const mockEmptyResults = {
  data: [],
  page: 1,
  limit: 20,
  total_count: 0,
};

const mockItemDetail = {
  id: 'i-1',
  name: 'MP-44 Optimus Prime',
  slug: 'mp-44-optimus-prime',
  franchise: { slug: 'transformers', name: 'Transformers' },
  character: { slug: 'optimus-prime', name: 'Optimus Prime' },
  manufacturer: { slug: 'takara-tomy', name: 'Takara Tomy' },
  toy_line: { slug: 'masterpiece', name: 'Masterpiece' },
  size_class: 'Leader',
  year_released: 2019,
  is_third_party: false,
  data_quality: 'verified',
  appearance: null,
  description: 'Masterpiece Optimus Prime',
  barcode: null,
  sku: null,
  product_code: 'MP-44',
  photos: [],
  metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

// --- Helpers ---

async function setupSearchMocks(page: import('@playwright/test').Page) {
  await setupAuthenticated(page);

  await page.route('**/catalog/search**', (route) => {
    // Skip SPA page navigations — only intercept API calls
    if (route.request().resourceType() === 'document') {
      return route.continue();
    }

    const url = new URL(route.request().url());
    const q = url.searchParams.get('q');

    if (!q || q === 'zzzznonexistent') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockEmptyResults),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockSearchResults),
    });
  });

  await page.route('**/catalog/franchises/transformers/items/mp-44-optimus-prime', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockItemDetail),
    })
  );

  await page.route('**/catalog/franchises/transformers/characters/optimus-prime', (route) => {
    if (route.request().resourceType() === 'document') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'c-1',
        name: 'Optimus Prime',
        slug: 'optimus-prime',
        franchise: { slug: 'transformers', name: 'Transformers' },
        faction: { slug: 'autobots', name: 'Autobots' },
        continuity_family: { slug: 'g1', name: 'Generation 1' },
        character_type: 'Transformer',
        alt_mode: 'Truck',
        is_combined_form: false,
        combiner_role: null,
        combined_form: null,
        sub_groups: [],
        appearances: [],
        metadata: {},
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }),
    });
  });
}

// --- Tests ---

test.describe('Catalog Search', () => {
  test('Given search page with no query, Then empty prompt is displayed', async ({ page }) => {
    await setupSearchMocks(page);
    await page.goto('/catalog/search');

    await expect(page.getByText('Search the Catalog')).toBeVisible();
    await expect(page.getByText('Search for characters and items across the catalog.')).toBeVisible();
  });

  test('Given search page with q=optimus, When results load, Then grouped results are displayed', async ({ page }) => {
    await setupSearchMocks(page);
    await page.goto('/catalog/search?q=optimus');

    await expect(page.getByText('2 results for "optimus"')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Characters/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Items/ })).toBeVisible();
    await expect(page.getByText('Optimus Prime', { exact: true })).toBeVisible();
    await expect(page.getByText('MP-44 Optimus Prime', { exact: true })).toBeVisible();
  });

  test('Given search results, When clicking an item, Then item detail panel opens', async ({ page }) => {
    await setupSearchMocks(page);
    await page.goto('/catalog/search?q=optimus');

    await page.getByText('MP-44 Optimus Prime').click();

    // Detail panel should show item information
    const panel = page.getByRole('complementary', { name: /Item detail/ });
    await expect(panel.getByText('Masterpiece', { exact: true })).toBeVisible();
  });

  test('Given search results, When clicking a character, Then character detail panel opens', async ({ page }) => {
    await setupSearchMocks(page);
    await page.goto('/catalog/search?q=optimus');

    // Click the character result (first "Optimus Prime" in the characters section)
    const charList = page.getByRole('listbox', { name: 'Character results' });
    await charList.getByRole('option', { name: /Optimus Prime/ }).click();

    // Character detail panel should show real data
    const panel = page.getByRole('complementary', { name: /Character detail/ });
    await expect(panel.getByText('Autobots')).toBeVisible();
    await expect(panel.getByText('Generation 1')).toBeVisible();
    await expect(page.getByRole('link', { name: /View full profile/ })).toBeVisible();
  });

  test('Given search for nonexistent term, Then no results message is displayed', async ({ page }) => {
    await setupSearchMocks(page);
    await page.goto('/catalog/search?q=zzzznonexistent');

    await expect(page.getByText(/No results for/)).toBeVisible();
  });

  test('Given authenticated user on dashboard, Then search input is visible in header', async ({ page }) => {
    await setupSearchMocks(page);
    await page.goto('/');

    const searchInput = page.getByRole('search').getByRole('searchbox', { name: 'Search catalog' });
    await expect(searchInput).toBeVisible();
  });
});
