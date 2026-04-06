/**
 * E2E: Add by Photo — ML Photo Identification
 *
 * Scenarios from docs/test-scenarios/E2E_ML_PHOTO_IDENTIFICATION.md
 *
 * Auth is handled by e2e-fixtures (user project). ML inference is bypassed via
 * window.__ML_TEST_PREDICTIONS__ (injected by injectTestPredictions), allowing
 * full UI flow testing without actual ONNX model files.
 */

import { test, expect } from './fixtures/e2e-fixtures';
import {
  MockCollectionState,
  MockCollectionPhotoState,
  makeCollectionItem,
} from './fixtures/mock-helpers';
import {
  mockMlModels,
  mockMlModelsEmpty,
  mockMlEvents,
  injectTestPredictions,
  mockPredictionItemDetails,
} from './fixtures/ml-helpers';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Set up all mocks needed for the Add by Photo flow with predictions. */
async function setupPhotoFlow(page: import('@playwright/test').Page, state: MockCollectionState): Promise<void> {
  await state.register(page);
  await mockMlModels(page);
  await mockMlEvents(page);
  await mockPredictionItemDetails(page);
  await injectTestPredictions(page);
}

/** Upload a test image file via the hidden input in the DropZone. */
async function uploadTestPhoto(page: import('@playwright/test').Page): Promise<void> {
  // Create a minimal 1x1 PNG buffer for the file input
  const pngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    'base64'
  );

  const fileInput = page.locator('#photo-file-input');
  await fileInput.setInputFiles({
    name: 'test-toy.png',
    mimeType: 'image/png',
    buffer: pngBuffer,
  });
}

// ─── Sheet Lifecycle ─────────────────────────────────────────────────────────

test.describe('Add by Photo — sheet lifecycle', () => {
  test('Given collection page, When clicking "Add by Photo", Then identification sheet opens', async ({ page }) => {
    const state = new MockCollectionState([makeCollectionItem()]);
    await setupPhotoFlow(page, state);

    await page.goto('/collection');
    await expect(page.getByText('1 item')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Add by Photo/ }).click();
    await expect(page.getByRole('heading', { name: 'Identify by Photo' })).toBeVisible();
    await expect(page.getByText('Drop photos here')).toBeVisible();
  });

  test('Given no ML models, When opening Add by Photo, Then fallback message is shown', async ({ page }) => {
    const state = new MockCollectionState([makeCollectionItem()]);
    await state.register(page);
    await mockMlModelsEmpty(page);
    await mockMlEvents(page);

    await page.goto('/collection');
    await expect(page.getByText('1 item')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Add by Photo/ }).click();
    await expect(page.getByText('Photo identification is not yet available.')).toBeVisible();
    await expect(page.getByRole('link', { name: /Browse Catalog/ })).toBeVisible();
  });
});

// ─── Classification Flow ─────────────────────────────────────────────────────

test.describe('Add by Photo — classification', () => {
  test('Given photo uploaded, When classification completes, Then prediction cards are shown', async ({ page }) => {
    const state = new MockCollectionState([makeCollectionItem()]);
    await setupPhotoFlow(page, state);

    await page.goto('/collection');
    await expect(page.getByText('1 item')).toBeVisible({ timeout: 10_000 });

    // Open sheet and upload photo
    await page.getByRole('button', { name: /Add by Photo/ }).click();
    await expect(page.getByText('Drop photos here')).toBeVisible();

    await uploadTestPhoto(page);

    // Wait for results — scope to the sheet to avoid matching collection grid items
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('Possible matches')).toBeVisible({ timeout: 10_000 });

    // Check that prediction cards display item names (fetched from item detail)
    await expect(sheet.getByText('Legacy Bulkhead')).toBeVisible();
    await expect(sheet.getByText('MP-44 Optimus Prime')).toBeVisible();
    await expect(sheet.getByText('Classified Snake Eyes')).toBeVisible();

    // Check confidence percentages
    await expect(sheet.getByText('72.0%')).toBeVisible();
    await expect(sheet.getByText('15.0%')).toBeVisible();
    await expect(sheet.getByText('8.0%')).toBeVisible();

    // Check action buttons
    await expect(sheet.getByRole('button', { name: /Browse catalog/ })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /Try another photo/ })).toBeVisible();
  });

  test('Given prediction results, When clicking "Add" on a prediction, Then collection dialog opens', async ({
    page,
  }) => {
    const state = new MockCollectionState([makeCollectionItem()]);
    await setupPhotoFlow(page, state);

    await page.goto('/collection');
    await expect(page.getByText('1 item')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Add by Photo/ }).click();
    await uploadTestPhoto(page);

    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('Possible matches')).toBeVisible({ timeout: 10_000 });

    // Wait for item details to load (Add button becomes enabled when itemDetail is fetched)
    const firstAddButton = sheet.getByRole('button', { name: 'Add' }).first();
    await expect(firstAddButton).toBeEnabled({ timeout: 10_000 });
    await firstAddButton.click();

    // Collection already has Legacy Bulkhead (from makeCollectionItem), so dialog says "Add Another Copy"
    const addDialog = page.getByRole('dialog', { name: /Add Another Copy/ });
    await expect(addDialog).toBeVisible({ timeout: 5_000 });

    // Select condition and confirm
    await addDialog.getByRole('button', { name: /Loose Complete/ }).click();
    await addDialog.getByRole('button', { name: 'Add to Collection' }).click();

    // Success toast
    const toast = page.locator('[data-sonner-toast]').filter({ hasText: /Legacy Bulkhead added to your collection/ });
    await expect(toast).toBeVisible({ timeout: 5_000 });
  });

  test('Given prediction results, When item already owned, Then "Owned" badge is shown', async ({ page }) => {
    // Start with Legacy Bulkhead already in collection
    const state = new MockCollectionState([
      makeCollectionItem({
        item_id: 'a0000000-0000-4000-a000-000000000001',
        item_name: 'Legacy Bulkhead',
        item_slug: 'legacy-bulkhead',
      }),
    ]);
    await setupPhotoFlow(page, state);

    await page.goto('/collection');
    await expect(page.getByText('1 item')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Add by Photo/ }).click();
    await uploadTestPhoto(page);

    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('Possible matches')).toBeVisible({ timeout: 10_000 });

    // The first prediction (Legacy Bulkhead) should show "Owned" badge
    await expect(sheet.getByText('Owned')).toBeVisible();
  });
});

// ─── Reset and Retry ─────────────────────────────────────────────────────────

test.describe('Add by Photo — reset and retry', () => {
  test('Given results shown, When clicking "Try another photo", Then drop zone reappears', async ({ page }) => {
    const state = new MockCollectionState([makeCollectionItem()]);
    await setupPhotoFlow(page, state);

    await page.goto('/collection');
    await expect(page.getByText('1 item')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Add by Photo/ }).click();
    await uploadTestPhoto(page);

    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('Possible matches')).toBeVisible({ timeout: 10_000 });

    // Click "Try another photo"
    await sheet.getByRole('button', { name: /Try another photo/ }).click();

    // Drop zone should reappear, results should be gone
    await expect(sheet.getByText('Drop photos here')).toBeVisible();
    await expect(sheet.getByText('Possible matches')).not.toBeVisible();
  });
});

// ─── Item Details in Predictions ─────────────────────────────────────────────

// ─── Add-by-Photo Integration (Slice 4: Photo Options) ─────────────────────

test.describe('Add by Photo — photo options integration', () => {
  /** Set up everything needed to reach the AddToCollectionDialog from a prediction. */
  async function reachAddDialog(page: import('@playwright/test').Page): Promise<void> {
    const state = new MockCollectionState([makeCollectionItem()]);
    const photoState = new MockCollectionPhotoState();
    await setupPhotoFlow(page, state);
    await photoState.register(page); // photo upload mock for the chained flow

    await page.goto('/collection');
    await expect(page.getByText('1 item')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Add by Photo/ }).click();
    await uploadTestPhoto(page);

    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('Possible matches')).toBeVisible({ timeout: 10_000 });

    const firstAdd = sheet.getByRole('button', { name: 'Add' }).first();
    await expect(firstAdd).toBeEnabled({ timeout: 10_000 });
    await firstAdd.click();
  }

  test('Given Add to Collection dialog from Add-by-Photo, Then Photo Options section is shown with default state', async ({
    page,
  }) => {
    await reachAddDialog(page);

    const dialog = page.getByRole('dialog', { name: /Add Another Copy|Add to Collection/ });
    await expect(dialog.getByText('Photo Options')).toBeVisible();
    await expect(dialog.getByLabel(/Save this photo/)).toBeChecked();
    await expect(dialog.getByLabel(/Contribute this photo/)).not.toBeChecked();
  });

  test('Given default checkboxes (save only), When submitting, Then item is created and photo is uploaded', async ({
    page,
  }) => {
    await reachAddDialog(page);

    const dialog = page.getByRole('dialog', { name: /Add Another Copy|Add to Collection/ });
    await dialog.getByRole('button', { name: 'Add to Collection' }).click();

    const successToast = page.locator('[data-sonner-toast]').filter({
      hasText: /Legacy Bulkhead added to your collection/,
    });
    await expect(successToast).toBeVisible({ timeout: 5_000 });

    // Contribute toast should NOT appear when contribute is unchecked
    const contributeToast = page.locator('[data-sonner-toast]').filter({
      hasText: /Photo contributed for review/,
    });
    await expect(contributeToast).not.toBeVisible();
  });

  test('Given save and contribute checked, When submitting, Then both upload and contribute toasts fire', async ({
    page,
  }) => {
    await reachAddDialog(page);

    const dialog = page.getByRole('dialog', { name: /Add Another Copy|Add to Collection/ });
    await dialog.getByLabel(/Contribute this photo/).click();

    // Inline disclaimer expands when contribute is checked
    await expect(dialog.getByText(/perpetual, non-exclusive, royalty-free license/)).toBeVisible();

    await dialog.getByRole('button', { name: 'Add to Collection' }).click();

    const addedToast = page.locator('[data-sonner-toast]').filter({
      hasText: /Legacy Bulkhead added to your collection/,
    });
    await expect(addedToast).toBeVisible({ timeout: 5_000 });

    const contributeToast = page.locator('[data-sonner-toast]').filter({
      hasText: /Photo contributed for review/,
    });
    await expect(contributeToast).toBeVisible({ timeout: 5_000 });
  });

  test('Given save unchecked, Then contribute checkbox is hidden', async ({ page }) => {
    await reachAddDialog(page);

    const dialog = page.getByRole('dialog', { name: /Add Another Copy|Add to Collection/ });
    await expect(dialog.getByLabel(/Contribute this photo/)).toBeVisible();

    await dialog.getByLabel(/Save this photo/).click();
    await expect(dialog.getByLabel(/Contribute this photo/)).not.toBeVisible();
  });

  test('Given Add to Collection from catalog item page (no photoFile), Then Photo Options section is hidden', async ({
    page,
  }) => {
    // Use the existing catalog setup helper — this opens AddToCollectionDialog
    // without going through Add-by-Photo, so no photoFile prop is passed.
    const { setupCatalogForAddFlow } = await import('./fixtures/mock-helpers');
    const state = new MockCollectionState([]);
    await state.register(page);
    await setupCatalogForAddFlow(page);

    await page.goto('/catalog/transformers/items/legacy-bulkhead');
    await expect(page.getByRole('heading', { name: 'Legacy Bulkhead' })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Add to Collection' }).click();
    const dialog = page.getByRole('dialog', { name: /Add to Collection/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Photo Options')).not.toBeVisible();
    await expect(dialog.getByLabel(/Save this photo/)).not.toBeVisible();
  });
});

test.describe('Add by Photo — prediction details', () => {
  test('Given results shown, Then each card shows franchise, manufacturer, and product code', async ({ page }) => {
    const state = new MockCollectionState([makeCollectionItem()]);
    await setupPhotoFlow(page, state);

    await page.goto('/collection');
    await expect(page.getByText('1 item')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Add by Photo/ }).click();
    await uploadTestPhoto(page);

    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('Possible matches')).toBeVisible({ timeout: 10_000 });

    // First prediction: Legacy Bulkhead with product code and details
    await expect(sheet.getByText('[F3055]')).toBeVisible();
    await expect(sheet.getByText('Transformers, Hasbro, Legacy')).toBeVisible();

    // Second prediction: MP-44 Optimus Prime
    await expect(sheet.getByText('[MP-44]')).toBeVisible();
    await expect(sheet.getByText('Transformers, Takara Tomy, Masterpiece')).toBeVisible();

    // Third prediction: Classified Snake Eyes (no product code)
    await expect(sheet.getByText('G.I. Joe, Hasbro, Classified Series')).toBeVisible();
  });
});
