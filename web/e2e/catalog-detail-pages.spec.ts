/**
 * E2E: Catalog Detail Pages — Character and item standalone pages
 *
 * Tests use mocked API responses (page.route()) — no real API server required.
 */

import { test, expect } from './fixtures/e2e-fixtures';
import { mockEmptyCollection } from './fixtures/mock-helpers';

// --- Fixtures ---

const mockFranchiseDetail = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  slug: 'transformers',
  name: 'Transformers',
  sort_order: 1,
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
};

const mockCharacterDetail = {
  id: 'c-1',
  name: 'Optimus Prime',
  slug: 'optimus-prime',
  franchise: { slug: 'transformers', name: 'Transformers' },
  faction: { slug: 'autobots', name: 'Autobots' },
  continuity_family: { slug: 'g1', name: 'Generation 1' },
  character_type: 'Transformer',
  alt_mode: 'Truck',
  is_combined_form: false,
  sub_groups: [{ slug: 'convoy', name: 'Convoy' }],
  appearances: [
    {
      id: 'a-1',
      slug: 'g1-cartoon',
      name: 'G1 Cartoon',
      source_media: 'Animated Series',
      source_name: 'The Transformers',
      year_start: 1984,
      year_end: 1987,
      description: null,
    },
  ],
  metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockItemDetail = {
  id: 'i-1',
  name: 'Legacy Bulkhead',
  slug: 'legacy-bulkhead',
  franchise: { slug: 'transformers', name: 'Transformers' },
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
  manufacturer: { slug: 'hasbro', name: 'Hasbro' },
  toy_line: { slug: 'legacy', name: 'Legacy' },
  thumbnail_url: null,
  size_class: 'Voyager',
  year_released: 2023,
  is_third_party: false,
  data_quality: 'verified',
  description: 'A great figure from the Legacy line.',
  barcode: null,
  sku: null,
  product_code: 'F3055',
  photos: [
    { id: 'p-1', url: 'https://example.com/photo1.jpg', caption: 'Front view', is_primary: true, sort_order: 0 },
    { id: 'p-2', url: 'https://example.com/photo2.jpg', caption: 'Side view', is_primary: false, sort_order: 1 },
  ],
  metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockGestaltCharacter = {
  ...mockCharacterDetail,
  id: 'c-2',
  name: 'Devastator',
  slug: 'devastator',
  is_combined_form: true,
  faction: { slug: 'decepticons', name: 'Decepticons' },
  sub_groups: [],
  appearances: [],
};

const mockRelatedItems = {
  data: [
    {
      id: 'i-2',
      name: 'Masterpiece Optimus Prime',
      slug: 'masterpiece-optimus-prime',
      franchise: { slug: 'transformers', name: 'Transformers' },
      characters: [{ slug: 'optimus-prime', name: 'Optimus Prime', appearance_slug: 'g1-cartoon', is_primary: true }],
      manufacturer: { slug: 'takara-tomy', name: 'Takara Tomy' },
      toy_line: { slug: 'masterpiece', name: 'Masterpiece' },
      thumbnail_url: null,
      size_class: 'Leader',
      year_released: 2019,
      product_code: null,
      is_third_party: false,
      data_quality: 'verified',
    },
  ],
  page: 1,
  limit: 20,
  total_count: 1,
};

// --- Helpers ---

async function setupDetailMocks(page: import('@playwright/test').Page) {
  await page.route('**/catalog/franchises/transformers', (route) => {
    if (route.request().resourceType() === 'document') return route.continue();
    if (
      route.request().url().includes('/items') ||
      route.request().url().includes('/characters') ||
      route.request().url().includes('/continuity')
    )
      return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockFranchiseDetail) });
  });

  await page.route('**/catalog/franchises/transformers/characters/optimus-prime', (route) => {
    if (route.request().resourceType() === 'document') return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCharacterDetail) });
  });

  await page.route('**/catalog/franchises/transformers/characters/devastator', (route) => {
    if (route.request().resourceType() === 'document') return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockGestaltCharacter) });
  });

  await page.route('**/catalog/franchises/transformers/characters/nonexistent', (route) => {
    if (route.request().resourceType() === 'document') return route.continue();
    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Character not found' }),
    });
  });

  await page.route('**/catalog/franchises/transformers/items/legacy-bulkhead', (route) => {
    if (route.request().resourceType() === 'document') return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockItemDetail) });
  });

  await page.route('**/catalog/franchises/transformers/items/nonexistent', (route) => {
    if (route.request().resourceType() === 'document') return route.continue();
    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Item not found' }),
    });
  });

  // Related items for character detail pages
  await page.route('**/catalog/franchises/transformers/items?*character=devastator*', (route) => {
    if (route.request().resourceType() === 'document') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], page: 1, limit: 20, total_count: 0 }),
    });
  });

  await page.route('**/catalog/franchises/transformers/items?*character=optimus-prime*', (route) => {
    if (route.request().resourceType() === 'document') return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockRelatedItems) });
  });

  // Mock relationships endpoints (character and item detail pages fetch these)
  await page.route('**/relationships', (route) => {
    if (route.request().resourceType() === 'document') return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ relationships: [] }) });
  });

  await mockEmptyCollection(page);

  // Catch-all for other items requests (facets, list without character filter)
  await page.route('**/catalog/franchises/transformers/items**', (route) => {
    if (route.request().resourceType() === 'document') return route.continue();
    const url = route.request().url();
    // Let specific routes handle these — fall through to next matching route
    if (url.includes('legacy-bulkhead') || url.includes('nonexistent')) return route.fallback();
    if (url.includes('facets')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          manufacturers: [],
          size_classes: [],
          toy_lines: [],
          continuity_families: [],
          is_third_party: [],
        }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockRelatedItems) });
  });
}

// --- Tests ---

test.describe('Character Detail Page', () => {
  test('Given valid character slug, When navigating to character page, Then character detail is displayed', async ({
    page,
  }) => {
    await setupDetailMocks(page);
    await page.goto('/catalog/transformers/characters/optimus-prime');

    await expect(page.getByRole('heading', { name: 'Optimus Prime' })).toBeVisible();
    await expect(page.getByText('Autobots')).toBeVisible();
    await expect(page.getByText('Generation 1')).toBeVisible();
    await expect(page.getByText('Truck')).toBeVisible();
  });

  test('Given character with appearances, When on character page, Then appearances table is displayed', async ({
    page,
  }) => {
    await setupDetailMocks(page);
    await page.goto('/catalog/transformers/characters/optimus-prime');

    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'G1 Cartoon' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Animated Series' })).toBeVisible();
  });

  test('Given character with sub-groups, When on character page, Then sub-groups are displayed', async ({ page }) => {
    await setupDetailMocks(page);
    await page.goto('/catalog/transformers/characters/optimus-prime');

    await expect(page.getByText('Convoy')).toBeVisible();
  });

  test('Given character page, Then breadcrumb shows correct path', async ({ page }) => {
    await setupDetailMocks(page);
    await page.goto('/catalog/transformers/characters/optimus-prime');

    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(breadcrumb.getByText('Catalog')).toBeVisible();
    await expect(breadcrumb.getByText('Transformers')).toBeVisible();
    await expect(breadcrumb.getByText('Optimus Prime')).toBeVisible();
  });

  // TODO: This test needs rework — component_characters moved to the relationships API.
  // The CharacterRelationships component fetches /:slug/relationships separately.
  // Skipped until relationship mocks are added to the E2E test infrastructure.
  test.skip('Given combined form character, When on character page, Then component characters are listed with links', async ({
    page,
  }) => {
    await setupDetailMocks(page);
    await page.goto('/catalog/transformers/characters/devastator');

    await expect(page.getByRole('heading', { name: 'Devastator' })).toBeVisible();
  });

  test('Given invalid character slug, When navigating, Then not found message is displayed', async ({ page }) => {
    await setupDetailMocks(page);
    await page.goto('/catalog/transformers/characters/nonexistent');

    // TanStack Query retries 404s before entering error state — allow extra time
    await expect(page.getByRole('heading', { name: 'Character not found' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: /Back to/ })).toBeVisible();
  });
});

test.describe('Item Detail Page', () => {
  test('Given valid item slug, When navigating to item page, Then item detail is displayed', async ({ page }) => {
    await setupDetailMocks(page);
    await page.goto('/catalog/transformers/items/legacy-bulkhead');

    const main = page.getByRole('main');
    await expect(page.getByRole('heading', { name: 'Legacy Bulkhead [F3055]' })).toBeVisible();
    await expect(main.getByText('Voyager')).toBeVisible();
    await expect(main.getByRole('definition').filter({ hasText: 'F3055' })).toBeVisible();
  });

  test('Given item with photos, When on item page, Then photo gallery is displayed', async ({ page }) => {
    // Use a real item with uploaded photos — no mocks, hits the real API
    await page.goto('/catalog/transformers/items/fm-02-margh');

    // The photo gallery renders an "Enlarge photo" button wrapping the main image
    await expect(page.getByRole('button', { name: /Enlarge photo/ })).toBeVisible({ timeout: 10_000 });
  });

  test('Given item page, When clicking character link, Then navigated to character page', async ({ page }) => {
    await setupDetailMocks(page);
    await page.goto('/catalog/transformers/items/legacy-bulkhead');

    // Scope to the first "Bulkhead" link in the item detail section (not the
    // CharacterRelationships heading link that also contains the character name)
    const charLink = page.getByRole('link', { name: 'Bulkhead' }).first();
    await expect(charLink).toBeVisible();
    await expect(charLink).toHaveAttribute('href', /\/catalog\/transformers\/characters\/bulkhead/);
  });

  test('Given item page, Then breadcrumb shows correct path', async ({ page }) => {
    await setupDetailMocks(page);
    await page.goto('/catalog/transformers/items/legacy-bulkhead');

    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(breadcrumb.getByText('Catalog')).toBeVisible();
    await expect(breadcrumb.getByText('Transformers')).toBeVisible();
    await expect(breadcrumb.getByText('Items')).toBeVisible();
    await expect(breadcrumb.getByText('Legacy Bulkhead')).toBeVisible();
  });

  test('Given invalid item slug, When navigating, Then not found message is displayed', async ({ page }) => {
    await setupDetailMocks(page);
    await page.goto('/catalog/transformers/items/nonexistent');

    // TanStack Query retries 404s before entering error state — allow extra time
    await expect(page.getByRole('heading', { name: 'Item not found' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: /Back to/ })).toBeVisible();
  });
});
