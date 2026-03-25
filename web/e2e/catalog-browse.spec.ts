/**
 * E2E: Catalog Browsing — Franchise list, hub, and items
 *
 * Tests use mocked API responses (page.route()) — no real API server required.
 * See admin-users.spec.ts for the established E2E mocking pattern.
 */

import { test, expect } from './fixtures/e2e-fixtures';
import { mockEmptyCollection } from './fixtures/mock-helpers';

// --- Fixtures ---

const mockFranchiseStats = {
  data: [
    {
      slug: 'transformers',
      name: 'Transformers',
      sort_order: 1,
      notes: 'Robots in disguise',
      item_count: 42,
      continuity_family_count: 3,
      manufacturer_count: 5,
    },
    {
      slug: 'gi-joe',
      name: 'G.I. Joe',
      sort_order: 2,
      notes: null,
      item_count: 10,
      continuity_family_count: 1,
      manufacturer_count: 2,
    },
  ],
};

const mockFranchiseDetail = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  slug: 'transformers',
  name: 'Transformers',
  sort_order: 1,
  notes: 'Robots in disguise',
  created_at: '2026-01-01T00:00:00Z',
};

const mockFacets = {
  manufacturers: [
    { value: 'hasbro', label: 'Hasbro', count: 30 },
    { value: 'takara-tomy', label: 'Takara Tomy', count: 12 },
  ],
  size_classes: [
    { value: 'Deluxe', label: 'Deluxe', count: 20 },
    { value: 'Voyager', label: 'Voyager', count: 15 },
  ],
  toy_lines: [{ value: 'legacy', label: 'Legacy', count: 25 }],
  continuity_families: [{ value: 'g1', label: 'Generation 1', count: 35 }],
  is_third_party: [
    { value: 'false', label: 'Official', count: 38 },
    { value: 'true', label: 'Third Party', count: 4 },
  ],
};

const mockItems = {
  data: [
    {
      id: 'i-1',
      name: 'Legacy Bulkhead',
      slug: 'legacy-bulkhead',
      franchise: { slug: 'transformers', name: 'Transformers' },
      characters: [{ slug: 'bulkhead', name: 'Bulkhead', appearance_slug: 'animated', is_primary: true }],
      manufacturer: { slug: 'hasbro', name: 'Hasbro' },
      toy_line: { slug: 'legacy', name: 'Legacy' },
      thumbnail_url: null,
      size_class: 'Voyager',
      year_released: 2023,
      is_third_party: false,
      data_quality: 'verified',
    },
    {
      id: 'i-2',
      name: 'MP-44 Optimus Prime',
      slug: 'mp-44-optimus-prime',
      franchise: { slug: 'transformers', name: 'Transformers' },
      characters: [{ slug: 'optimus-prime', name: 'Optimus Prime', appearance_slug: 'g1-cartoon', is_primary: true }],
      manufacturer: { slug: 'takara-tomy', name: 'Takara Tomy' },
      toy_line: { slug: 'masterpiece', name: 'Masterpiece' },
      thumbnail_url: null,
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

const mockItemDetail = {
  ...mockItems.data[0],
  characters: [
    {
      slug: 'bulkhead',
      name: 'Bulkhead',
      appearance_slug: 'animated',
      appearance_name: 'Animated',
      appearance_source_media: 'Animated Series',
      appearance_source_name: 'Transformers Animated',
      is_primary: true,
    },
  ],
  description: 'A great figure',
  barcode: null,
  sku: null,
  product_code: null,
  photos: [],
  metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

// --- Helpers ---

async function setupCatalogMocks(page: import('@playwright/test').Page) {
  await mockEmptyCollection(page);

  // Catch-all for unhandled catalog requests — prevents hitting the real API
  await page.route('**/catalog/**', (route) => {
    if (route.request().resourceType() === 'document') return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
  });

  await page.route('**/catalog/franchises/stats', (route) => {
    if (route.request().resourceType() === 'document') return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockFranchiseStats) });
  });

  await page.route('**/catalog/franchises/transformers', (route) => {
    if (route.request().resourceType() === 'document') return route.continue();
    if (route.request().url().includes('/items') || route.request().url().includes('/continuity'))
      return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockFranchiseDetail) });
  });

  // Mock relationships endpoints (item detail sheet fetches these)
  await page.route('**/relationships', (route) => {
    if (route.request().resourceType() === 'document') return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ relationships: [] }) });
  });

  await page.route('**/catalog/franchises/transformers/items/facets**', (route) => {
    if (route.request().resourceType() === 'document') return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockFacets) });
  });

  await page.route('**/catalog/franchises/transformers/items**', (route) => {
    if (route.request().resourceType() === 'document') return route.continue();
    const url = route.request().url();
    // Detail endpoint: /items/<slug> (not /items/facets)
    if (url.match(/\/items\/[a-z]/) && !url.includes('facets')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockItemDetail) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockItems) });
  });

  await page.route('**/catalog/franchises/transformers/continuity-families', (route) => {
    if (route.request().resourceType() === 'document') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: 'cf-1',
            slug: 'g1',
            name: 'Generation 1',
            sort_order: 1,
            notes: null,
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      }),
    });
  });
}

// --- Tests ---

test.describe('Catalog Browsing', () => {
  test('Given authenticated user, When navigating to /catalog, Then franchise tiles are displayed', async ({
    page,
  }) => {
    await setupCatalogMocks(page);
    await page.goto('/catalog');

    await expect(page.getByRole('heading', { name: 'Catalog' })).toBeVisible();
    await expect(page.getByText('Transformers')).toBeVisible();
    await expect(page.getByText('42 items')).toBeVisible();
    await expect(page.getByText('G.I. Joe')).toBeVisible();
  });

  test('Given franchise list, When toggling to table view, Then table is displayed', async ({ page }) => {
    await setupCatalogMocks(page);
    await page.goto('/catalog');

    await page.getByRole('button', { name: 'Table view' }).click();
    await expect(page.getByRole('columnheader', { name: 'Franchise' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Items' })).toBeVisible();
  });

  test('Given franchise tile, When clicking it, Then navigated to hub page', async ({ page }) => {
    await setupCatalogMocks(page);
    await page.goto('/catalog');

    await page.getByText('Transformers').first().click();
    await expect(page).toHaveURL(/\/catalog\/transformers/);
    await expect(page.getByRole('heading', { name: 'Transformers' })).toBeVisible();
  });

  test('Given hub page, When clicking Browse All Items, Then navigated to items list', async ({ page }) => {
    await setupCatalogMocks(page);
    await page.goto('/catalog/transformers');

    await page.getByRole('link', { name: /Browse All Items/ }).click();
    await expect(page).toHaveURL(/\/catalog\/transformers\/items/);
  });

  test('Given items list, When clicking an item, Then detail sheet shows item data', async ({ page }) => {
    await setupCatalogMocks(page);
    await page.goto('/catalog/transformers/items');

    await page.getByText('Legacy Bulkhead').click();
    await expect(page).toHaveURL(/selected=legacy-bulkhead/);
  });

  test('Given dashboard, When clicking Browse Catalog CTA, Then navigated to /catalog', async ({ page }) => {
    await setupCatalogMocks(page);
    await page.goto('/');

    await page.getByRole('link', { name: /Browse Catalog/ }).click();
    await expect(page).toHaveURL(/\/catalog/);
  });

  test('Given main nav, When on catalog page, Then Catalog link is active', async ({ page }) => {
    await setupCatalogMocks(page);
    await page.goto('/catalog');

    const catalogLink = page.getByRole('link', { name: 'Catalog' });
    await expect(catalogLink).toHaveAttribute('aria-current', 'page');
  });
});
