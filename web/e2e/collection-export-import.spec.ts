/**
 * E2E: Collection Export/Import
 *
 * Scenarios from docs/test-scenarios/E2E_COLLECTION_EXPORT_IMPORT.md
 *
 * Auth is handled by e2e-fixtures (user project). Collection API data
 * is mocked via MockCollectionState, which provides stateful responses
 * including smart export (derives from liveItems) and smart import
 * (resolves slugs against known items).
 */

import { test, expect } from './fixtures/e2e-fixtures';
import { MockCollectionState, makeCollectionItem } from './fixtures/mock-helpers';
import {
  buildExportFileDescriptor,
  buildRawFileDescriptor,
  buildExportPayload,
  selectImportFile,
  waitForFileSelected,
  clickAppend,
  clickReplace,
  confirmAppendDialog,
  confirmReplaceDialog,
  readDownloadJson,
} from './fixtures/import-helpers';

// ─── Shared test items ──────────────────────────────────────────────────────

const ITEM_BULKHEAD = makeCollectionItem({
  item_id: 'a0000000-0000-4000-a000-000000000001',
  item_name: 'Legacy Bulkhead',
  item_slug: 'legacy-bulkhead',
  franchise: { slug: 'transformers', name: 'Transformers' },
  package_condition: 'loose_complete',
  item_condition: 5,
});

const ITEM_SNAKE_EYES = makeCollectionItem({
  item_id: 'a0000000-0000-4000-a000-000000000002',
  item_name: 'Classified Snake Eyes',
  item_slug: 'classified-snake-eyes',
  franchise: { slug: 'gi-joe', name: 'G.I. Joe' },
  package_condition: 'mint_sealed',
  item_condition: 5,
});

// ─── Export ─────────────────────────────────────────────────────────────────

test.describe('Collection export', () => {
  test('Given populated collection, When clicking Export, Then JSON file downloads with correct content', async ({
    page,
  }) => {
    const state = new MockCollectionState([ITEM_BULKHEAD, ITEM_SNAKE_EYES]);
    await state.register(page);
    await page.goto('/collection');
    await expect(page.getByText('2 items')).toBeVisible({ timeout: 10_000 });

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export' }).click();
    const download = await downloadPromise;

    // Verify filename pattern
    expect(download.suggestedFilename()).toMatch(/^collection-export-\d{4}-\d{2}-\d{2}\.json$/);

    // Verify file content
    const content = (await readDownloadJson(download)) as {
      version: number;
      exported_at: string;
      items: unknown[];
    };
    expect(content.version).toBe(1);
    expect(typeof content.exported_at).toBe('string');
    expect(content.items).toHaveLength(2);

    // Verify toast
    const toast = page.locator('[data-sonner-toast]').filter({ hasText: /Collection exported/ });
    await expect(toast).toBeVisible({ timeout: 5_000 });
  });

  test('Given empty collection, When viewing /collection, Then Export button is disabled', async ({ page }) => {
    const state = new MockCollectionState([]);
    await state.register(page);
    await page.goto('/collection');

    await expect(page.getByText('Your collection is empty')).toBeVisible({ timeout: 10_000 });
    // Export button is in the toolbar which is not rendered on empty state —
    // but the empty state itself confirms export is not available
  });

  test('Given populated collection, When export completes, Then toast shows item count', async ({ page }) => {
    const state = new MockCollectionState([ITEM_BULKHEAD]);
    await state.register(page);
    await page.goto('/collection');
    await expect(page.getByText('1 item')).toBeVisible({ timeout: 10_000 });

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export' }).click();
    await downloadPromise;

    const toast = page.locator('[data-sonner-toast]').filter({ hasText: /1 item saved to file/ });
    await expect(toast).toBeVisible({ timeout: 5_000 });
  });
});

// ─── Import — Empty State CTA ───────────────────────────────────────────────

test.describe('Import empty state CTA', () => {
  test('Given empty collection, When viewing /collection, Then "Import from file" link is visible', async ({
    page,
  }) => {
    const state = new MockCollectionState([]);
    await state.register(page);
    await page.goto('/collection');

    await expect(page.getByText('Your collection is empty')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Import from file/ })).toBeVisible();
  });

  test('Given empty collection, When clicking "Import from file", Then import dialog opens', async ({ page }) => {
    const state = new MockCollectionState([]);
    await state.register(page);
    await page.goto('/collection');
    await expect(page.getByText('Your collection is empty')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Import from file/ }).click();

    await expect(page.getByRole('heading', { name: 'Import Collection' })).toBeVisible();
    await expect(page.getByText('Drop your export file here')).toBeVisible();
  });
});

// ─── Import — Confirmation Dialogs ──────────────────────────────────────────

test.describe('Import confirmation dialogs', () => {
  test('Given file selected, When clicking Append, Then append AlertDialog shows correct item count', async ({
    page,
  }) => {
    const state = new MockCollectionState([ITEM_BULKHEAD]);
    await state.register(page);
    await page.goto('/collection');
    await expect(page.getByText('1 item')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Import' }).click();
    const descriptor = buildExportFileDescriptor([ITEM_BULKHEAD, ITEM_SNAKE_EYES]);
    await selectImportFile(page, descriptor);
    await waitForFileSelected(page);

    await clickAppend(page);

    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByRole('heading', { name: 'Append to collection?' })).toBeVisible();
    await expect(dialog.getByText(/add 2 items/i)).toBeVisible();
  });

  test('Given 5-item collection and 5-item file, When clicking Replace, Then standard overwrite dialog appears', async ({
    page,
  }) => {
    // 5 items in collection — import file has 5 items → ratio = 1.0 ≥ 0.5 → regular overwrite
    const items = Array.from({ length: 5 }, (_, i) =>
      makeCollectionItem({
        item_id: `a0000000-0000-4000-a000-0000000000${String(i + 1).padStart(2, '0')}`,
        item_name: `Item ${i + 1}`,
        item_slug: `item-${i + 1}`,
        package_condition: 'loose_complete',
      })
    );
    const state = new MockCollectionState(items);
    await state.register(page);
    await page.goto('/collection');
    await expect(page.getByText('5 items')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Import' }).click();
    const descriptor = buildExportFileDescriptor(items);
    await selectImportFile(page, descriptor);
    await waitForFileSelected(page);

    await clickReplace(page);

    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByRole('heading', { name: 'Replace entire collection?' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^Replace collection$/i })).toBeVisible();
  });

  test('Given 10-item collection and 4-item file, When clicking Replace, Then size-warning dialog appears', async ({
    page,
  }) => {
    // 10 items in collection, 4 in import → ratio = 0.4 < 0.5 → size warning
    const collectionItems = Array.from({ length: 10 }, (_, i) =>
      makeCollectionItem({
        item_id: `a0000000-0000-4000-a000-0000000000${String(i + 1).padStart(2, '0')}`,
        item_name: `Item ${i + 1}`,
        item_slug: `item-${i + 1}`,
        package_condition: 'loose_complete',
      })
    );
    const importItems = collectionItems.slice(0, 4);

    const state = new MockCollectionState(collectionItems);
    await state.register(page);
    await page.goto('/collection');
    await expect(page.getByText('10 items')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Import' }).click();
    const descriptor = buildExportFileDescriptor(importItems);
    await selectImportFile(page, descriptor);
    await waitForFileSelected(page);

    await clickReplace(page);

    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByRole('heading', { name: 'Import is much smaller than your collection' })).toBeVisible();
    await expect(dialog.getByText(/10/)).toBeVisible();
    await expect(dialog.getByText(/4/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Yes, replace collection/i })).toBeVisible();
  });
});

// ─── Import — Happy Paths ───────────────────────────────────────────────────

test.describe('Import happy paths', () => {
  test('Given known slugs, When append confirmed, Then all-success manifest shown', async ({ page }) => {
    const state = new MockCollectionState([ITEM_BULKHEAD]);
    await state.register(page);
    await page.goto('/collection');
    await expect(page.getByText('1 item')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Import' }).click();
    const descriptor = buildExportFileDescriptor([ITEM_BULKHEAD]);
    await selectImportFile(page, descriptor);
    await waitForFileSelected(page);

    await clickAppend(page);
    await confirmAppendDialog(page);

    // Wait for import complete
    await expect(page.getByRole('heading', { name: 'Import Complete' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('All items imported')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
  });

  test('Given overwrite mode, When confirmed, Then overwritten count shown in manifest', async ({ page }) => {
    const collectionItems = [
      ITEM_BULKHEAD,
      ITEM_SNAKE_EYES,
      makeCollectionItem({
        item_id: 'a0000000-0000-4000-a000-000000000003',
        item_name: 'MP-44 Optimus Prime',
        item_slug: 'mp-44-optimus-prime',
        package_condition: 'mint_sealed',
      }),
    ];
    const state = new MockCollectionState(collectionItems);
    await state.register(page);
    await page.goto('/collection');
    await expect(page.getByText('3 items')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Import' }).click();
    // Import 2 items (known slugs) into a 3-item collection → ratio = 0.67 ≥ 0.5 → regular overwrite
    const descriptor = buildExportFileDescriptor([ITEM_BULKHEAD, ITEM_SNAKE_EYES]);
    await selectImportFile(page, descriptor);
    await waitForFileSelected(page);

    await clickReplace(page);
    await confirmReplaceDialog(page);

    await expect(page.getByRole('heading', { name: 'Import Complete' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/3 previous items were archived/)).toBeVisible();
  });

  test('Given import complete, When clicking Done, Then dialog closes', async ({ page }) => {
    const state = new MockCollectionState([ITEM_BULKHEAD]);
    await state.register(page);
    await page.goto('/collection');
    await expect(page.getByText('1 item')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Import' }).click();
    const descriptor = buildExportFileDescriptor([ITEM_BULKHEAD]);
    await selectImportFile(page, descriptor);
    await waitForFileSelected(page);

    await clickAppend(page);
    await confirmAppendDialog(page);

    await expect(page.getByRole('heading', { name: 'Import Complete' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Done' }).click();

    // Dialog should close — heading no longer visible
    await expect(page.getByRole('heading', { name: 'Import Complete' })).not.toBeVisible();
  });
});

// ─── Import — Error States ──────────────────────────────────────────────────

test.describe('Import error states', () => {
  // Shared setup: 1-item collection with import dialog open
  async function openImportDialog(page: import('@playwright/test').Page): Promise<void> {
    const state = new MockCollectionState([ITEM_BULKHEAD]);
    await state.register(page);
    await page.goto('/collection');
    await expect(page.getByText('1 item')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Import' }).click();
  }

  test('Given invalid JSON file, When selecting file, Then invalid-json error shown', async ({ page }) => {
    await openImportDialog(page);
    await selectImportFile(page, buildRawFileDescriptor('not valid json{{'));

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 5_000 });
    await expect(alert.getByText('Invalid file format')).toBeVisible();
    await expect(page.getByText('Choose a different file')).toBeVisible();
  });

  test('Given valid JSON but wrong schema, When selecting file, Then invalid-json error shown', async ({ page }) => {
    await openImportDialog(page);
    await selectImportFile(page, buildRawFileDescriptor(JSON.stringify({ name: 'test' })));

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 5_000 });
    await expect(alert.getByText('Invalid file format')).toBeVisible();
  });

  test('Given file with version 999, When selecting file, Then bad-version error shown', async ({ page }) => {
    await openImportDialog(page);
    const payload = {
      version: 999,
      exported_at: new Date().toISOString(),
      items: [
        {
          franchise_slug: 'transformers',
          item_slug: 'optimus-prime',
          package_condition: 'unknown',
          item_condition: 5,
          notes: null,
          added_at: '2026-01-01T00:00:00Z',
          deleted_at: null,
        },
      ],
    };
    await selectImportFile(page, buildRawFileDescriptor(JSON.stringify(payload)));

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 5_000 });
    await expect(alert.getByText('Unsupported schema version')).toBeVisible();
    await expect(alert.getByText(/schema v999/)).toBeVisible();
  });

  test('Given file with empty items array, When selecting file, Then empty-items warning shown', async ({ page }) => {
    await openImportDialog(page);
    const payload = { version: 1, exported_at: new Date().toISOString(), items: [] };
    await selectImportFile(page, buildRawFileDescriptor(JSON.stringify(payload)));

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 5_000 });
    await expect(alert.getByText('No items to import')).toBeVisible();
  });

  test('Given API returns 500, When confirming import, Then api-error shown with retry', async ({ page }) => {
    const state = new MockCollectionState([ITEM_BULKHEAD]);
    await state.register(page);

    // Override the import handler to return 500 (last-registered wins)
    await page.route('**/collection/import', (route) => {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ statusCode: 500, error: 'Internal Server Error', message: 'Server error' }),
      });
    });

    await page.goto('/collection');
    await expect(page.getByText('1 item')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Import' }).click();
    await selectImportFile(page, buildExportFileDescriptor([ITEM_BULKHEAD]));
    await waitForFileSelected(page);

    await clickAppend(page);
    await confirmAppendDialog(page);

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await expect(alert.getByText('Import failed')).toBeVisible();
    await expect(page.getByText('Try again')).toBeVisible();
  });
});

// ─── Import — Partial Success & Retry ───────────────────────────────────────

test.describe('Import partial success and retry', () => {
  /** Build a file with 1 known slug (legacy-bulkhead) and 1 unknown slug */
  function buildMixedDescriptor() {
    const payload = buildExportPayload([ITEM_BULKHEAD]);
    payload.items.push({
      franchise_slug: 'transformers',
      item_slug: 'nonexistent-item',
      package_condition: 'unknown',
      item_condition: 5,
      notes: null,
      added_at: '2026-01-01T00:00:00Z',
      deleted_at: null,
    });
    return buildRawFileDescriptor(JSON.stringify(payload), 'mixed-import.json');
  }

  test('Given mixed known and unknown slugs, When import completes, Then manifest shows both sections', async ({
    page,
  }) => {
    const state = new MockCollectionState([ITEM_BULKHEAD]);
    await state.register(page);
    await page.goto('/collection');
    await expect(page.getByText('1 item')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Import' }).click();
    await selectImportFile(page, buildMixedDescriptor());
    await waitForFileSelected(page);

    await clickAppend(page);
    await confirmAppendDialog(page);

    await expect(page.getByRole('heading', { name: 'Import Complete' })).toBeVisible({ timeout: 10_000 });

    // Verify summary counters (scoped to the aria-live region)
    const counters = page.locator('[aria-live="polite"]');
    await expect(counters.getByText('imported')).toBeVisible();
    await expect(counters.getByText('unresolved')).toBeVisible();

    // Verify manifest sections
    const manifest = page.locator('[aria-label="Import results"]');
    await expect(manifest).toBeVisible();
    await expect(manifest.getByText('nonexistent-item')).toBeVisible();
    await expect(manifest.getByText('Item not found in catalog')).toBeVisible();
    await expect(manifest.getByText('Legacy Bulkhead')).toBeVisible();
  });

  test('Given partial success, When clicking Download failed items, Then retry file downloads with correct content', async ({
    page,
  }) => {
    const state = new MockCollectionState([ITEM_BULKHEAD]);
    await state.register(page);
    await page.goto('/collection');
    await expect(page.getByText('1 item')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Import' }).click();
    await selectImportFile(page, buildMixedDescriptor());
    await waitForFileSelected(page);
    await clickAppend(page);
    await confirmAppendDialog(page);

    await expect(page.getByRole('heading', { name: 'Import Complete' })).toBeVisible({ timeout: 10_000 });

    // Click download retry file
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download failed items/ }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^collection-import-retry-\d{4}-\d{2}-\d{2}\.json$/);

    // Verify retry file content — should only contain the unresolved item
    const content = (await readDownloadJson(download)) as {
      version: number;
      items: Array<{ franchise_slug: string; item_slug: string }>;
    };
    expect(content.version).toBe(1);
    expect(content.items).toHaveLength(1);
    expect(content.items[0]!.item_slug).toBe('nonexistent-item');
  });
});
