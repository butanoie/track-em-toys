/**
 * E2E: Catalog Search — search input, grouped results, detail sheets
 *
 * Tests use mocked API responses (page.route()) — no real API server required.
 */

import { test, expect } from './fixtures/e2e-fixtures';
import { mockEmptyCollection } from './fixtures/mock-helpers';

// --- Fixtures ---

const mockSearchResults = {
  data: [
    {
      entity_type: 'character',
      id: 'c-1',
      name: 'Optimus Prime',
      slug: 'optimus-prime',
      franchise: { slug: 'transformers', name: 'Transformers' },
      continuity_family: { slug: 'g1', name: 'Generation 1' },
      character: null,
      manufacturer: null,
      toy_line: null,
      thumbnail_url: null,
      size_class: null,
      year_released: null,
      product_code: null,
      is_third_party: null,
      data_quality: null,
    },
    {
      entity_type: 'item',
      id: 'i-1',
      name: 'MP-44 Optimus Prime',
      slug: 'mp-44-optimus-prime',
      franchise: { slug: 'transformers', name: 'Transformers' },
      continuity_family: null,
      character: { slug: 'optimus-prime', name: 'Optimus Prime' },
      manufacturer: { slug: 'takara-tomy', name: 'Takara Tomy' },
      toy_line: { slug: 'masterpiece', name: 'Masterpiece' },
      thumbnail_url: null,
      size_class: 'Leader',
      year_released: 2019,
      product_code: 'MP-44',
      is_third_party: false,
      data_quality: 'verified',
    },
  ],
  page: 1,
  limit: 20,
  total_count: 2,
  character_count: 1,
  item_count: 1,
};

const mockEmptyResults = {
  data: [],
  page: 1,
  limit: 20,
  total_count: 0,
  character_count: 0,
  item_count: 0,
};

const mockItemDetail = {
  id: 'i-1',
  name: 'MP-44 Optimus Prime',
  slug: 'mp-44-optimus-prime',
  franchise: { slug: 'transformers', name: 'Transformers' },
  characters: [
    {
      slug: 'optimus-prime',
      name: 'Optimus Prime',
      appearance_slug: 'g1-cartoon',
      appearance_name: 'G1 Cartoon',
      appearance_source_media: 'Animated Series',
      appearance_source_name: 'The Transformers',
      is_primary: true,
    },
  ],
  manufacturer: { slug: 'takara-tomy', name: 'Takara Tomy' },
  toy_line: { slug: 'masterpiece', name: 'Masterpiece' },
  thumbnail_url: null,
  size_class: 'Leader',
  year_released: 2019,
  is_third_party: false,
  data_quality: 'verified',
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
  await mockEmptyCollection(page);

  // Catch-all for unhandled catalog requests — prevents hitting the real API
  await page.route('**/catalog/**', (route) => {
    if (route.request().resourceType() === 'document') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], relationships: [] }),
    });
  });

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

  // Mock relationships endpoints (detail sheets fetch these)
  await page.route('**/relationships', (route) => {
    if (route.request().resourceType() === 'document') return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ relationships: [] }) });
  });

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

  test('Given search page with q=optimus, When results load, Then unified results with type filter are displayed', async ({
    page,
  }) => {
    await setupSearchMocks(page);
    await page.goto('/catalog/search?q=optimus');

    await expect(page.getByText('2 results for "optimus"')).toBeVisible();
    // Type filter chips show per-type counts
    await expect(page.getByRole('button', { name: /All · 2/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Characters · 1/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Items · 1/ })).toBeVisible();
    // Results are in a single unified list
    const resultsList = page.getByRole('listbox', { name: 'Search results' });
    await expect(resultsList.getByText('Optimus Prime', { exact: true })).toBeVisible();
    await expect(resultsList.getByText('MP-44 Optimus Prime [MP-44]', { exact: true })).toBeVisible();
  });

  test('Given search results, When clicking an item, Then item detail sheet opens', async ({ page }) => {
    await setupSearchMocks(page);
    await page.goto('/catalog/search?q=optimus');

    await page.getByText('MP-44 Optimus Prime').click();

    // Detail sheet should show item information
    const sheet = page.getByRole('dialog', { name: /MP-44 Optimus Prime/ });
    await expect(sheet.getByText('Masterpiece', { exact: true })).toBeVisible();
  });

  test('Given search results, When clicking a character, Then character detail sheet opens', async ({ page }) => {
    await setupSearchMocks(page);
    await page.goto('/catalog/search?q=optimus');

    // Click the character result — in the unified list, "Optimus Prime" (exact) is the character
    const resultsList = page.getByRole('listbox', { name: 'Search results' });
    await resultsList.getByText('Optimus Prime', { exact: true }).click();

    // Character detail sheet should show real data
    const sheet = page.getByRole('dialog', { name: /Optimus Prime/ });
    await expect(sheet.getByText('Autobots')).toBeVisible();
    await expect(sheet.getByText('Generation 1')).toBeVisible();
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
