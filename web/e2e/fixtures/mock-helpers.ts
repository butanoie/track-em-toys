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
  collection_photo_count: number;
  product_code: string | null;
  package_condition: string;
  item_condition: number;
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
    collection_photo_count: 0,
    product_code: null,
    package_condition: 'loose_complete',
    item_condition: 5,
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
      jsonResponse({
        total_copies: 0,
        unique_items: 0,
        deleted_count: 0,
        by_franchise: [],
        by_toy_line: [],
        by_package_condition: [],
        by_item_condition: [],
      })
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
    const packageConditionMap = new Map<string, number>();
    const itemConditionMap = new Map<number, number>();

    const toyLineMap = new Map<string, { slug: string; name: string; count: number }>();
    for (const item of live) {
      const fKey = item.franchise.slug;
      const existing = franchiseMap.get(fKey);
      if (existing) {
        existing.count++;
      } else {
        franchiseMap.set(fKey, { slug: fKey, name: item.franchise.name, count: 1 });
      }
      const tlKey = item.toy_line.slug;
      const existingTl = toyLineMap.get(tlKey);
      if (existingTl) {
        existingTl.count++;
      } else {
        toyLineMap.set(tlKey, { slug: tlKey, name: item.toy_line.name, count: 1 });
      }
      packageConditionMap.set(item.package_condition, (packageConditionMap.get(item.package_condition) ?? 0) + 1);
      itemConditionMap.set(item.item_condition, (itemConditionMap.get(item.item_condition) ?? 0) + 1);
    }

    const uniqueItemIds = new Set(live.map((i) => i.item_id));

    return {
      total_copies: live.length,
      unique_items: uniqueItemIds.size,
      deleted_count: this._deleted.size,
      by_franchise: Array.from(franchiseMap.values()),
      by_toy_line: Array.from(toyLineMap.values()),
      by_package_condition: Array.from(packageConditionMap.entries()).map(([package_condition, count]) => ({
        package_condition,
        count,
      })),
      by_item_condition: Array.from(itemConditionMap.entries()).map(([item_condition, count]) => ({
        item_condition,
        count,
      })),
    };
  }

  addItem(partial: {
    item_id: string;
    package_condition?: string;
    item_condition?: number;
    notes?: string;
  }): MockCollectionItem {
    const existing = this._items.find((i) => i.item_id === partial.item_id);
    const newItem = makeCollectionItem({
      item_id: partial.item_id,
      item_name: existing?.item_name ?? 'Unknown Item',
      item_slug: existing?.item_slug ?? 'unknown-item',
      franchise: existing?.franchise ?? { slug: 'unknown', name: 'Unknown' },
      manufacturer: existing?.manufacturer ?? null,
      toy_line: existing?.toy_line ?? { slug: 'unknown', name: 'Unknown' },
      package_condition: partial.package_condition ?? 'unknown',
      item_condition: partial.item_condition ?? 5,
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

  patchItem(
    id: string,
    updates: { package_condition?: string; item_condition?: number; notes?: string | null }
  ): MockCollectionItem | null {
    const item = this._items.find((i) => i.id === id);
    if (!item) return null;
    if (updates.package_condition !== undefined) item.package_condition = updates.package_condition;
    if (updates.item_condition !== undefined) item.item_condition = updates.item_condition;
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
        const body = route.request().postDataJSON() as {
          item_id: string;
          package_condition?: string;
          item_condition?: number;
          notes?: string;
        };
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
          package_condition: i.package_condition,
          item_condition: i.item_condition,
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
          package_condition: string;
          item_condition?: number;
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
      const imported: Array<{
        franchise_slug: string;
        item_slug: string;
        item_name: string;
        package_condition: string;
        item_condition: number;
      }> = [];
      const unresolved: Array<{ franchise_slug: string; item_slug: string; reason: string }> = [];

      for (const entry of body.items) {
        const match = this._items.find(
          (i) => i.item_slug === entry.item_slug && i.franchise.slug === entry.franchise_slug
        );
        if (match) {
          this.addItem({
            item_id: match.item_id,
            package_condition: entry.package_condition,
            item_condition: entry.item_condition ?? 5,
            notes: entry.notes ?? undefined,
          });
          imported.push({
            franchise_slug: entry.franchise_slug,
            item_slug: entry.item_slug,
            item_name: match.item_name,
            package_condition: entry.package_condition,
            item_condition: entry.item_condition ?? 5,
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
        const body = route.request().postDataJSON() as {
          package_condition?: string;
          item_condition?: number;
          notes?: string | null;
        };
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

// ─── MockCollectionPhotoState ────────────────────────────────────────────────

export interface MockCollectionPhoto {
  id: string;
  url: string;
  caption: string | null;
  is_primary: boolean;
  sort_order: number;
  contribution_status: 'pending' | 'approved' | 'rejected' | null;
}

/**
 * Stateful mock for `/collection/:id/photos*` endpoints.
 *
 * Mirrors `MockCollectionState`'s closure-based pattern: route handlers read
 * from `_photosByItem` at request time, so mutations are reflected without
 * re-registering routes.
 *
 * **Registration order matters.** This MUST be registered AFTER
 * `MockCollectionState.register(page)`, because that catch-all on
 * `**\/collection\/**` would otherwise win for photo paths.
 *
 * Response shapes intentionally follow the schema split: POST/PATCH/DELETE
 * use the **base** photo shape (no `contribution_status`), while GET list
 * uses the **extended** shape (with `contribution_status`). The web client's
 * Zod parsers will reject mismatches, so the split is load-bearing.
 */
export class MockCollectionPhotoState {
  private _photosByItem = new Map<string, MockCollectionPhoto[]>();
  private _nextUploadResponse: { status: number; body: unknown } | null = null;

  constructor(initial?: Record<string, Partial<MockCollectionPhoto>[]>) {
    if (initial) {
      for (const [itemId, photos] of Object.entries(initial)) {
        for (const partial of photos) {
          this.addPhoto(itemId, partial);
        }
      }
    }
  }

  addPhoto(collectionItemId: string, partial: Partial<MockCollectionPhoto> = {}): MockCollectionPhoto {
    const list = this._photosByItem.get(collectionItemId) ?? [];
    const photo: MockCollectionPhoto = {
      id: partial.id ?? crypto.randomUUID(),
      url: partial.url ?? `collection/u-1/${collectionItemId}/${crypto.randomUUID()}-original.webp`,
      caption: partial.caption ?? null,
      is_primary: partial.is_primary ?? list.length === 0,
      sort_order: partial.sort_order ?? list.length,
      contribution_status: partial.contribution_status ?? null,
    };
    list.push(photo);
    this._photosByItem.set(collectionItemId, list);
    return photo;
  }

  listPhotos(collectionItemId: string): MockCollectionPhoto[] {
    return [...(this._photosByItem.get(collectionItemId) ?? [])].sort((a, b) => {
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
      return a.sort_order - b.sort_order;
    });
  }

  setPrimary(collectionItemId: string, photoId: string): MockCollectionPhoto | null {
    const list = this._photosByItem.get(collectionItemId);
    if (!list) return null;
    let target: MockCollectionPhoto | null = null;
    for (const p of list) {
      if (p.id === photoId) {
        p.is_primary = true;
        target = p;
      } else {
        p.is_primary = false;
      }
    }
    return target;
  }

  deletePhoto(collectionItemId: string, photoId: string): void {
    const list = this._photosByItem.get(collectionItemId);
    if (!list) return;
    this._photosByItem.set(
      collectionItemId,
      list.filter((p) => p.id !== photoId)
    );
  }

  contribute(collectionItemId: string, photoId: string): void {
    const photo = this._photosByItem.get(collectionItemId)?.find((p) => p.id === photoId);
    if (photo) photo.contribution_status = 'pending';
  }

  revokeContribution(collectionItemId: string, photoId: string): void {
    const photo = this._photosByItem.get(collectionItemId)?.find((p) => p.id === photoId);
    if (photo) photo.contribution_status = null;
  }

  /**
   * One-shot override for the next POST /photos request. Cleared after use.
   * Use this to test 409 duplicate detection.
   */
  setNextUploadResponse(response: { status: number; body: unknown }): void {
    this._nextUploadResponse = response;
  }

  private toBaseShape(photo: MockCollectionPhoto) {
    // POST/PATCH/DELETE responses — no contribution_status field
    return {
      id: photo.id,
      url: photo.url,
      caption: photo.caption,
      is_primary: photo.is_primary,
      sort_order: photo.sort_order,
    };
  }

  async register(page: Page): Promise<void> {
    // POST/GET /collection/:id/photos
    await page.route(/\/collection\/[0-9a-f-]{36}\/photos(\?.*)?$/, (route) => {
      if (isDocRequest(route)) return route.continue();
      const url = new URL(route.request().url());
      const itemId = url.pathname.split('/').slice(-2, -1)[0]!;
      const method = route.request().method();

      if (method === 'GET') {
        return route.fulfill(
          jsonResponse({
            photos: this.listPhotos(itemId).map((p) => ({
              ...this.toBaseShape(p),
              contribution_status: p.contribution_status,
            })),
          })
        );
      }

      if (method === 'POST') {
        if (this._nextUploadResponse) {
          const response = this._nextUploadResponse;
          this._nextUploadResponse = null;
          return route.fulfill(jsonResponse(response.body, response.status));
        }
        const photo = this.addPhoto(itemId);
        return route.fulfill(jsonResponse({ photos: [this.toBaseShape(photo)] }, 201));
      }

      return route.fallback();
    });

    // DELETE /collection/:id/photos/:photoId — register FIRST so more-specific
    // suffix routes (primary, contribute, contribution, reorder) registered
    // later take priority via Playwright's last-wins rule.
    await page.route(/\/collection\/[0-9a-f-]{36}\/photos\/[^/]+$/, (route) => {
      if (isDocRequest(route)) return route.continue();
      if (route.request().method() !== 'DELETE') return route.fallback();
      const parts = new URL(route.request().url()).pathname.split('/');
      const itemId = parts.at(-3)!;
      const photoId = parts.at(-1)!;
      this.deletePhoto(itemId, photoId);
      return route.fulfill({ status: 204, body: '' });
    });

    // PATCH /collection/:id/photos/reorder
    await page.route(/\/collection\/[0-9a-f-]{36}\/photos\/reorder$/, (route) => {
      if (isDocRequest(route)) return route.continue();
      const itemId = new URL(route.request().url()).pathname.split('/').slice(-3, -2)[0]!;
      const body = route.request().postDataJSON() as { photos: Array<{ id: string; sort_order: number }> };
      const list = this._photosByItem.get(itemId) ?? [];
      for (const update of body.photos) {
        const photo = list.find((p) => p.id === update.id);
        if (photo) photo.sort_order = update.sort_order;
      }
      return route.fulfill(jsonResponse({ photos: this.listPhotos(itemId).map((p) => this.toBaseShape(p)) }));
    });

    // PATCH /collection/:id/photos/:photoId/primary
    await page.route(/\/collection\/[0-9a-f-]{36}\/photos\/[^/]+\/primary$/, (route) => {
      if (isDocRequest(route)) return route.continue();
      const parts = new URL(route.request().url()).pathname.split('/');
      const itemId = parts.at(-4)!;
      const photoId = parts.at(-2)!;
      const photo = this.setPrimary(itemId, photoId);
      if (!photo) return route.fulfill(jsonResponse({ error: 'Not found' }, 404));
      return route.fulfill(jsonResponse(this.toBaseShape(photo)));
    });

    // POST /collection/:id/photos/:photoId/contribute
    await page.route(/\/collection\/[0-9a-f-]{36}\/photos\/[^/]+\/contribute$/, (route) => {
      if (isDocRequest(route)) return route.continue();
      const parts = new URL(route.request().url()).pathname.split('/');
      const itemId = parts.at(-4)!;
      const photoId = parts.at(-2)!;
      this.contribute(itemId, photoId);
      return route.fulfill(jsonResponse({ contribution_id: 'mock-contribution-' + photoId }, 201));
    });

    // DELETE /collection/:id/photos/:photoId/contribution
    await page.route(/\/collection\/[0-9a-f-]{36}\/photos\/[^/]+\/contribution$/, (route) => {
      if (isDocRequest(route)) return route.continue();
      const parts = new URL(route.request().url()).pathname.split('/');
      const itemId = parts.at(-4)!;
      const photoId = parts.at(-2)!;
      this.revokeContribution(itemId, photoId);
      return route.fulfill(jsonResponse({ revoked: true }));
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
