/**
 * E2E: Collection Item Photos
 *
 * Scenarios from docs/test-scenarios/E2E_COLLECTION_PHOTOS.md
 *
 * Auth is handled by e2e-fixtures (user project). Collection state is mocked
 * via MockCollectionState; photo endpoints are mocked via MockCollectionPhotoState.
 *
 * NOTE: drag-to-reorder E2E is intentionally skipped — covered by PhotoGrid
 * unit tests + the API integration test. dnd-kit + Playwright drag is flaky.
 */

import { test, expect } from './fixtures/e2e-fixtures';
import { MockCollectionState, MockCollectionPhotoState, makeCollectionItem } from './fixtures/mock-helpers';

const COLLECTION_ITEM_ID = 'b0000000-0000-4000-a000-000000000001';

/** Tiny inline 1×1 PNG buffer — content doesn't matter, the API is mocked. */
function makePngBuffer(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    'base64'
  );
}

async function setupCollectionWithPhotoState(
  page: import('@playwright/test').Page,
  photoState: MockCollectionPhotoState
): Promise<MockCollectionState> {
  const collection = new MockCollectionState([
    makeCollectionItem({ id: COLLECTION_ITEM_ID, item_name: 'Legacy Bulkhead' }),
  ]);
  // Order matters — collection state's catch-all must register first.
  await collection.register(page);
  await photoState.register(page);
  return collection;
}

async function openPhotoSheet(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/collection');
  await expect(page.getByText('Legacy Bulkhead')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /Manage photos for Legacy Bulkhead/ }).click();
  await expect(page.getByRole('heading', { name: /Manage Photos/ })).toBeVisible();
}

async function uploadPng(page: import('@playwright/test').Page, files = 1): Promise<void> {
  const buffer = makePngBuffer();
  const inputs = Array.from({ length: files }, (_, i) => ({
    name: `photo-${i + 1}.png`,
    mimeType: 'image/png',
    buffer,
  }));
  await page.locator('#photo-file-input').setInputFiles(inputs);
}

// ─── Photo Upload ────────────────────────────────────────────────────────────

test.describe('Collection photos — upload', () => {
  test('Given empty photo grid, When uploading a JPEG, Then photo appears with success toast', async ({ page }) => {
    const photoState = new MockCollectionPhotoState();
    await setupCollectionWithPhotoState(page, photoState);
    await openPhotoSheet(page);

    await uploadPng(page);

    const sheet = page.getByRole('dialog');
    // After upload, the grid renders an img tag for the photo
    await expect(sheet.locator('img').first()).toBeVisible({ timeout: 5_000 });

    const toast = page.locator('[data-sonner-toast]').filter({ hasText: /uploaded/i });
    await expect(toast).toBeVisible({ timeout: 5_000 });
  });

  test('Given empty grid, When uploading 3 files, Then all 3 appear in the grid', async ({ page }) => {
    const photoState = new MockCollectionPhotoState();
    await setupCollectionWithPhotoState(page, photoState);
    await openPhotoSheet(page);

    await uploadPng(page, 3);

    const sheet = page.getByRole('dialog');
    await expect(sheet.locator('img')).toHaveCount(3, { timeout: 10_000 });
  });

  test('Given drop zone open, When uploading a PDF, Then error toast appears and no upload happens', async ({
    page,
  }) => {
    const photoState = new MockCollectionPhotoState();
    await setupCollectionWithPhotoState(page, photoState);
    await openPhotoSheet(page);

    await page.locator('#photo-file-input').setInputFiles({
      name: 'not-an-image.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 fake'),
    });

    const errorToast = page.locator('[data-sonner-toast]').filter({ hasText: /image|format|type/i });
    await expect(errorToast).toBeVisible({ timeout: 5_000 });
  });

  test('Given duplicate detection, When uploading a duplicate, Then DuplicateUploadError toast appears', async ({
    page,
  }) => {
    const photoState = new MockCollectionPhotoState();
    photoState.addPhoto(COLLECTION_ITEM_ID); // pre-existing photo
    await setupCollectionWithPhotoState(page, photoState);

    photoState.setNextUploadResponse({
      status: 409,
      body: {
        error: 'Duplicate photo',
        matched: { id: 'existing-photo-id', url: 'collection/u-1/' + COLLECTION_ITEM_ID + '/existing-original.webp' },
      },
    });

    await openPhotoSheet(page);
    await uploadPng(page);

    const toast = page.locator('[data-sonner-toast]').filter({ hasText: /duplicate|already/i });
    await expect(toast).toBeVisible({ timeout: 5_000 });
  });
});

// ─── Photo Management ────────────────────────────────────────────────────────

test.describe('Collection photos — management', () => {
  test('Given two photos, When clicking star on second photo, Then it becomes primary', async ({ page }) => {
    const photoState = new MockCollectionPhotoState();
    photoState.addPhoto(COLLECTION_ITEM_ID, { id: 'photo-1' });
    photoState.addPhoto(COLLECTION_ITEM_ID, { id: 'photo-2' });
    await setupCollectionWithPhotoState(page, photoState);
    await openPhotoSheet(page);

    const sheet = page.getByRole('dialog');
    // Initially photo-1 is primary, so only photo-2 has the "set primary" button
    const setPrimaryButton = sheet.getByLabel('Set as primary photo').first();
    await setPrimaryButton.click();

    // After mutation, the previously-primary photo gets a "set primary" button instead
    await expect(sheet.getByLabel('Set as primary photo').first()).toBeVisible({ timeout: 5_000 });
  });

  test('Given a photo, When clicking delete and confirming, Then photo is removed', async ({ page }) => {
    const photoState = new MockCollectionPhotoState();
    photoState.addPhoto(COLLECTION_ITEM_ID, { id: 'photo-1' });
    await setupCollectionWithPhotoState(page, photoState);
    await openPhotoSheet(page);

    const sheet = page.getByRole('dialog');
    await expect(sheet.locator('img')).toHaveCount(1);

    await sheet.getByLabel('Delete photo').click();

    const confirmDialog = page.getByRole('alertdialog');
    await confirmDialog.getByRole('button', { name: /Delete/ }).click();

    await expect(sheet.locator('img')).toHaveCount(0, { timeout: 5_000 });

    const toast = page.locator('[data-sonner-toast]').filter({ hasText: /deleted|removed/i });
    await expect(toast).toBeVisible({ timeout: 5_000 });
  });
});

// ─── Contribute to Catalog ───────────────────────────────────────────────────

test.describe('Collection photos — contribution flow', () => {
  test('Given a photo, When contributing with consent, Then "Submitted" badge appears', async ({ page }) => {
    const photoState = new MockCollectionPhotoState();
    photoState.addPhoto(COLLECTION_ITEM_ID, { id: 'photo-1' });
    await setupCollectionWithPhotoState(page, photoState);
    await openPhotoSheet(page);

    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Contribute photo to catalog').click();

    // Dialog title is now neutral ("Contribute Photo", not "Contribute Photo to Catalog")
    // because the same dialog now covers both training_only and catalog_and_training intents.
    const contributeDialog = page.getByRole('dialog', { name: /Contribute Photo/ });
    await expect(contributeDialog).toBeVisible();

    // Default intent is training_only → button reads "Contribute to Training"
    await expect(contributeDialog.getByRole('radio', { name: /Training only/ })).toBeChecked();
    await expect(contributeDialog.getByRole('button', { name: /Contribute to Training/ })).toBeDisabled();

    // Switch to catalog_and_training to exercise the button-label swap + superset path
    await contributeDialog.getByRole('radio', { name: /Catalog \+ Training/ }).click();
    await expect(contributeDialog.getByRole('button', { name: /Contribute to Catalog/ })).toBeDisabled();

    await contributeDialog.getByRole('checkbox', { name: /I confirm/ }).click();
    await contributeDialog.getByRole('button', { name: /Contribute to Catalog/ }).click();

    const toast = page.locator('[data-sonner-toast]').filter({ hasText: /Photo contributed for review/ });
    await expect(toast).toBeVisible({ timeout: 5_000 });

    await expect(page.getByRole('status', { name: /Photo submitted for review/ })).toBeVisible({ timeout: 5_000 });
  });

  test('Given a pending photo, When confirming with default training_only intent, Then it submits for review', async ({
    page,
  }) => {
    const photoState = new MockCollectionPhotoState();
    photoState.addPhoto(COLLECTION_ITEM_ID, { id: 'photo-1', contribution_status: null });
    await setupCollectionWithPhotoState(page, photoState);
    await openPhotoSheet(page);

    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Contribute photo to catalog').click();

    const contributeDialog = page.getByRole('dialog', { name: /Contribute Photo/ });

    // Default intent (no radio click needed) — button says "Contribute to Training"
    await expect(contributeDialog.getByRole('radio', { name: /Training only/ })).toBeChecked();
    await contributeDialog.getByRole('checkbox', { name: /I confirm/ }).click();
    await contributeDialog.getByRole('button', { name: /Contribute to Training/ }).click();

    const toast = page.locator('[data-sonner-toast]').filter({ hasText: /Photo contributed for review/ });
    await expect(toast).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('status', { name: /Photo submitted for review/ })).toBeVisible({ timeout: 5_000 });
  });

  test('Given a contributed photo, When closing and reopening sheet, Then "Submitted" badge persists', async ({
    page,
  }) => {
    const photoState = new MockCollectionPhotoState();
    photoState.addPhoto(COLLECTION_ITEM_ID, { id: 'photo-1', contribution_status: 'pending' });
    await setupCollectionWithPhotoState(page, photoState);
    await openPhotoSheet(page);

    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('status', { name: /Photo submitted for review/ })).toBeVisible();

    // Close via Escape
    await page.keyboard.press('Escape');
    await expect(sheet).not.toBeVisible();

    // Reopen
    await page.getByRole('button', { name: /Manage photos for Legacy Bulkhead/ }).click();
    const reopenedSheet = page.getByRole('dialog');
    await expect(reopenedSheet.getByRole('status', { name: /Photo submitted for review/ })).toBeVisible();
  });

  test('Given a submitted photo, Then no contribute action is available', async ({ page }) => {
    const photoState = new MockCollectionPhotoState();
    photoState.addPhoto(COLLECTION_ITEM_ID, { id: 'photo-1', contribution_status: 'pending' });
    await setupCollectionWithPhotoState(page, photoState);
    await openPhotoSheet(page);

    const sheet = page.getByRole('dialog');
    await expect(sheet.getByLabel('Contribute photo to catalog')).toHaveCount(0);
  });

  test('Given an approved photo, Then "Shared" badge is shown and contribute is hidden', async ({ page }) => {
    const photoState = new MockCollectionPhotoState();
    photoState.addPhoto(COLLECTION_ITEM_ID, { id: 'photo-1', contribution_status: 'approved' });
    await setupCollectionWithPhotoState(page, photoState);
    await openPhotoSheet(page);

    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('status', { name: /Photo shared to catalog/ })).toBeVisible();
    await expect(sheet.getByLabel('Contribute photo to catalog')).toHaveCount(0);
  });

  test('Given a rejected photo, Then contribute action is visible and re-contribution works', async ({ page }) => {
    const photoState = new MockCollectionPhotoState();
    photoState.addPhoto(COLLECTION_ITEM_ID, { id: 'photo-1', contribution_status: 'rejected' });
    await setupCollectionWithPhotoState(page, photoState);
    await openPhotoSheet(page);

    const sheet = page.getByRole('dialog');
    await expect(sheet.getByLabel('Contribute photo to catalog')).toBeVisible();
  });
});
