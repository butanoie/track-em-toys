/**
 * Shared mock helpers for E2E tests.
 *
 * Provides:
 * - MockCollectionState: stateful mock for collection API endpoints
 * - mockEmptyCollection(): empty collection mocks for catalog tests
 * - makeCollectionItem(): factory for CollectionItem-shaped objects
 * - setupCatalogForAddFlow(): catalog route mocks for the "add from catalog" flow
 */

import type { Page, Route } from '@playwright/test';

// ─── Primitive helpers ────────────────────────────────────────────────────────

function isDocRequest(route: Route): boolean {
  return route.request().resourceType() === 'document';
}

function jsonResponse(body: unknown, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

export interface MockCollectionItem {
  id: string;
  item_id: string;
  item_name: string;
  item_slug: string;
  franchise: { slug: string; name: string };
  manufacturer: { slug: string; name: string } | null;
  toy_line: { slug: string; name: string };
  thumbnail_url: string | null;
  condition: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function makeCollectionItem(overrides?: Partial<MockCollectionItem>): MockCollectionItem {
  return {
    id: crypto.randomUUID(),
    item_id: 'a0000000-0000-4000-a000-000000000001',
    item_name: 'Legacy Bulkhead',
    item_slug: 'legacy-bulkhead',
    franchise: { slug: 'transformers', name: 'Transformers' },
    manufacturer: { slug: 'hasbro', name: 'Hasbro' },
    toy_line: { slug: 'legacy', name: 'Legacy' },
    thumbnail_url: null,
    condition: 'loose_complete',
    notes: null,
    created_at: '2026-01-15T10:00:00.000Z',
    updated_at: '2026-01-15T10:00:00.000Z',
    ...overrides,
  };
}

// ─── Empty collection mock (for catalog/search specs) ────────────────────────

/**
 * Install empty-collection route mocks so catalog pages don't hit the real API
 * for collection endpoints (useCollectionCheck, stats, list).
 *
 * Registration order: catch-all first (lowest priority), then specifics.
 */
export async function mockEmptyCollection(page: Page): Promise<void> {
  await page.route('**/collection/**', (route) => {
    if (isDocRequest(route)) return route.continue();
    return route.fulfill(jsonResponse({ items: {} }));
  });
  await page.route(/\/collection(\?.*)?$/, (route) => {
    if (isDocRequest(route)) return route.continue();
    return route.fulfill(jsonResponse({ data: [], page: 1, limit: 20, total_count: 0 }));
  });
  await page.route('**/collection/stats', (route) => {
    if (isDocRequest(route)) return route.continue();
    return route.fulfill(
      jsonResponse({ total_copies: 0, unique_items: 0, deleted_count: 0, by_franchise: [], by_condition: [] })
    );
  });
}

// ─── MockCollectionState ──────────────────────────────────────────────────────

/**
 * Stateful mock for collection API endpoints.
 *
 * Route handlers read from this object at request time (via closures),
 * so mutations like addItem() are reflected in subsequent GET responses
 * without re-registering routes.
 */
export class MockCollectionState {
  private _items: MockCollectionItem[];
  private _deleted = new Set<string>();

  constructor(initialItems: MockCollectionItem[] = []) {
    this._items = [...initialItems];
  }

  get liveItems(): MockCollectionItem[] {
    return this._items.filter((i) => !this._deleted.has(i.id));
  }

  get stats() {
    const live = this.liveItems;
    const franchiseMap = new Map<string, { slug: string; name: string; count: number }>();
    const conditionMap = new Map<string, number>();

    for (const item of live) {
      const fKey = item.franchise.slug;
      const existing = franchiseMap.get(fKey);
      if (existing) {
        existing.count++;
      } else {
        franchiseMap.set(fKey, { slug: fKey, name: item.franchise.name, count: 1 });
      }
      conditionMap.set(item.condition, (conditionMap.get(item.condition) ?? 0) + 1);
    }

    const uniqueItemIds = new Set(live.map((i) => i.item_id));

    return {
      total_copies: live.length,
      unique_items: uniqueItemIds.size,
      deleted_count: this._deleted.size,
      by_franchise: Array.from(franchiseMap.values()),
      by_condition: Array.from(conditionMap.entries()).map(([condition, count]) => ({ condition, count })),
    };
  }

  addItem(partial: { item_id: string; condition?: string; notes?: string }): MockCollectionItem {
    const existing = this._items.find((i) => i.item_id === partial.item_id);
    const newItem = makeCollectionItem({
      item_id: partial.item_id,
      item_name: existing?.item_name ?? 'Unknown Item',
      item_slug: existing?.item_slug ?? 'unknown-item',
      franchise: existing?.franchise ?? { slug: 'unknown', name: 'Unknown' },
      manufacturer: existing?.manufacturer ?? null,
      toy_line: existing?.toy_line ?? { slug: 'unknown', name: 'Unknown' },
      condition: partial.condition ?? 'unknown',
      notes: partial.notes?.trim() || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    this._items.push(newItem);
    return newItem;
  }

  removeItem(id: string): void {
    this._deleted.add(id);
  }

  restoreItem(id: string): MockCollectionItem | null {
    this._deleted.delete(id);
    return this._items.find((i) => i.id === id) ?? null;
  }

  patchItem(id: string, updates: { condition?: string; notes?: string | null }): MockCollectionItem | null {
    const item = this._items.find((i) => i.id === id);
    if (!item) return null;
    if (updates.condition !== undefined) item.condition = updates.condition;
    if (updates.notes !== undefined) item.notes = updates.notes;
    item.updated_at = new Date().toISOString();
    return item;
  }

  /**
   * Install all collection API route handlers on the page.
   * Call this BEFORE page.goto().
   *
   * Registration order matters: Playwright matches last-registered first.
   * Catch-all is registered first (lowest priority), specifics later (highest priority).
   */
  async register(page: Page): Promise<void> {
    // 1. Catch-all for /collection/** — lowest priority fallback
    await page.route('**/collection/**', (route) => {
      if (isDocRequest(route)) return route.continue();
      return route.fulfill(jsonResponse({ data: [], page: 1, limit: 20, total_count: 0 }));
    });

    // 2. GET /collection (list) + POST /collection (add)
    await page.route(/\/collection(\?.*)?$/, (route) => {
      if (isDocRequest(route)) return route.continue();
      const method = route.request().method();

      if (method === 'GET') {
        const url = new URL(route.request().url());
        const reqPage = Number(url.searchParams.get('page') ?? '1');
        const reqLimit = Number(url.searchParams.get('limit') ?? '20');
        const offset = (reqPage - 1) * reqLimit;
        const pageData = this.liveItems.slice(offset, offset + reqLimit);
        return route.fulfill(
          jsonResponse({
            data: pageData,
            page: reqPage,
            limit: reqLimit,
            total_count: this.liveItems.length,
          })
        );
      }

      if (method === 'POST') {
        const body = route.request().postDataJSON() as { item_id: string; condition?: string; notes?: string };
        const newItem = this.addItem(body);
        return route.fulfill(jsonResponse(newItem, 201));
      }

      return route.fallback();
    });

    // 3. GET /collection/stats
    await page.route('**/collection/stats', (route) => {
      if (isDocRequest(route)) return route.continue();
      return route.fulfill(jsonResponse(this.stats));
    });

    // 4. GET /collection/check?itemIds=...
    await page.route('**/collection/check**', (route) => {
      if (isDocRequest(route)) return route.continue();
      const url = new URL(route.request().url());
      const itemIds = url.searchParams.get('itemIds')?.split(',').filter(Boolean) ?? [];

      const items: Record<string, { count: number; collection_ids: string[] }> = {};
      for (const itemId of itemIds) {
        const matching = this.liveItems.filter((i) => i.item_id === itemId);
        items[itemId] = {
          count: matching.length,
          collection_ids: matching.map((i) => i.id),
        };
      }

      return route.fulfill(jsonResponse({ items }));
    });

    // 5. GET /collection/export
    await page.route('**/collection/export**', (route) => {
      if (isDocRequest(route)) return route.continue();
      if (route.request().method() !== 'GET') return route.fallback();
      const url = new URL(route.request().url());
      const includeDeleted = url.searchParams.get('include_deleted') === 'true';
      const source = includeDeleted ? this._items : this.liveItems;
      const payload = {
        version: 1,
        exported_at: new Date().toISOString(),
        items: source.map((i) => ({
          franchise_slug: i.franchise.slug,
          item_slug: i.item_slug,
          condition: i.condition,
          notes: i.notes,
          added_at: i.created_at,
          deleted_at: this._deleted.has(i.id) ? i.updated_at : null,
        })),
      };
      return route.fulfill(jsonResponse(payload));
    });

    // 6. POST /collection/import
    await page.route('**/collection/import', (route) => {
      if (isDocRequest(route)) return route.continue();
      if (route.request().method() !== 'POST') return route.fallback();

      const body = route.request().postDataJSON() as {
        version: number;
        mode?: 'append' | 'overwrite';
        items: Array<{
          franchise_slug: string;
          item_slug: string;
          condition: string;
          notes?: string | null;
          added_at?: string;
        }>;
      };

      // Overwrite mode: soft-delete all live items first (snapshot to avoid mutation during iteration)
      let overwrittenCount = 0;
      if (body.mode === 'overwrite') {
        const toRemove = this.liveItems.map((i) => i.id);
        overwrittenCount = toRemove.length;
        for (const id of toRemove) {
          this.removeItem(id);
        }
      }

      // Resolve each incoming item against known items
      const imported: Array<{ franchise_slug: string; item_slug: string; item_name: string; condition: string }> = [];
      const unresolved: Array<{ franchise_slug: string; item_slug: string; reason: string }> = [];

      for (const entry of body.items) {
        const match = this._items.find(
          (i) => i.item_slug === entry.item_slug && i.franchise.slug === entry.franchise_slug
        );
        if (match) {
          this.addItem({ item_id: match.item_id, condition: entry.condition, notes: entry.notes ?? undefined });
          imported.push({
            franchise_slug: entry.franchise_slug,
            item_slug: entry.item_slug,
            item_name: match.item_name,
            condition: entry.condition,
          });
        } else {
          unresolved.push({
            franchise_slug: entry.franchise_slug,
            item_slug: entry.item_slug,
            reason: 'Item not found in catalog',
          });
        }
      }

      return route.fulfill(jsonResponse({ imported, unresolved, overwritten_count: overwrittenCount }));
    });

    // 7. POST /collection/:id/restore
    await page.route(/\/collection\/[0-9a-f-]{36}\/restore$/, (route) => {
      if (isDocRequest(route)) return route.continue();
      if (route.request().method() !== 'POST') return route.fallback();

      const urlPath = new URL(route.request().url()).pathname;
      const id = urlPath.split('/').at(-2)!;
      const restored = this.restoreItem(id);
      if (restored) {
        return route.fulfill(jsonResponse(restored));
      }
      return route.fulfill(jsonResponse({ error: 'Not found' }, 404));
    });

    // 8. PATCH /collection/:id + DELETE /collection/:id
    await page.route(/\/collection\/[0-9a-f-]{36}$/, (route) => {
      if (isDocRequest(route)) return route.continue();
      const method = route.request().method();
      const urlPath = new URL(route.request().url()).pathname;
      const id = urlPath.split('/').pop()!;

      if (method === 'PATCH') {
        const body = route.request().postDataJSON() as { condition?: string; notes?: string | null };
        const patched = this.patchItem(id, body);
        if (patched) return route.fulfill(jsonResponse(patched));
        return route.fulfill(jsonResponse({ error: 'Not found' }, 404));
      }

      if (method === 'DELETE') {
        this.removeItem(id);
        return route.fulfill({ status: 204, body: '' });
      }

      return route.fallback();
    });
  }
}

// ─── Catalog mocks for "add from catalog" flow ───────────────────────────────

const MOCK_FRANCHISE_DETAIL = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  slug: 'transformers',
  name: 'Transformers',
  sort_order: 1,
  notes: 'Robots in disguise',
  created_at: '2026-01-01T00:00:00Z',
};

const MOCK_ITEM_DETAIL = {
  id: 'a0000000-0000-4000-a000-000000000001',
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
  description: 'A great figure',
  barcode: null,
  sku: null,
  product_code: null,
  photos: [],
  metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

/**
 * Install catalog route mocks needed for the "add from catalog" item detail page.
 * The item detail page fetches: franchise detail, item detail, character detail,
 * relationships, and collection check (handled by MockCollectionState).
 */
export async function setupCatalogForAddFlow(page: Page): Promise<void> {
  // Catch-all for unhandled catalog requests
  await page.route('**/catalog/**', (route) => {
    if (isDocRequest(route)) return route.continue();
    return route.fulfill(jsonResponse({ data: [] }));
  });

  // Relationships endpoint (item detail page fetches this)
  await page.route('**/relationships', (route) => {
    if (isDocRequest(route)) return route.continue();
    return route.fulfill(jsonResponse({ relationships: [] }));
  });

  // Character detail (fetched by ItemDetailPage for the primary character)
  await page.route('**/catalog/franchises/transformers/characters/**', (route) => {
    if (isDocRequest(route)) return route.continue();
    return route.fulfill(
      jsonResponse({
        id: 'c0000000-0000-4000-a000-000000000001',
        slug: 'bulkhead',
        name: 'Bulkhead',
        franchise: { slug: 'transformers', name: 'Transformers' },
        faction: { slug: 'autobots', name: 'Autobots' },
        continuity_family: { slug: 'animated', name: 'Animated' },
        character_type: null,
        alt_mode: 'SWAT Vehicle',
        is_combined_form: false,
        sub_groups: [],
        appearances: [
          { slug: 'animated', name: 'Animated', source_media: 'Animated Series', source_name: 'Transformers Animated' },
        ],
        metadata: {},
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      })
    );
  });

  // Franchise detail
  await page.route('**/catalog/franchises/transformers', (route) => {
    if (isDocRequest(route)) return route.continue();
    if (route.request().url().includes('/items') || route.request().url().includes('/characters'))
      return route.fallback();
    return route.fulfill(jsonResponse(MOCK_FRANCHISE_DETAIL));
  });

  // Item detail — matches /items/<slug> but not /items/facets
  await page.route('**/catalog/franchises/transformers/items/**', (route) => {
    if (isDocRequest(route)) return route.continue();
    return route.fulfill(jsonResponse(MOCK_ITEM_DETAIL));
  });
}
