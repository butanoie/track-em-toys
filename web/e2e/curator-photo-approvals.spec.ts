/**
 * E2E: Curator Photo Approval Dashboard
 *
 * Scenarios mapped 1:1 from docs/test-scenarios/E2E_PHOTO_APPROVAL.md (5b.5 subset).
 *
 * Auth: real curator session via the Playwright `curator` project fixture.
 * Backend: API responses mocked via `MockPhotoApprovalState` (stateful closure
 * mock). The queue-shrink behavior after a decision is driven by
 * TanStack Query broad-prefix invalidation (`['admin', 'photos']`) →
 * refetch → mock returns the updated list.
 *
 * Locator discipline: the near-duplicate banner and the 409 conflict banner
 * are both `role="alert"`. Every alert assertion uses
 * `.filter({ hasText: /.../ })` to disambiguate. Never an unqualified
 * `getByRole('alert')`.
 */

import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/e2e-fixtures';
import {
  MockPhotoApprovalState,
  type MockPhotoApprovalItem,
} from './fixtures/mock-helpers';

// --- Fixtures ---

/**
 * Base factory for a pending photo with schema-complete defaults:
 * public visibility intent (catalog_and_training), can_decide true,
 * no existing photos. Overrides are shallow-merged on top.
 */
function makePendingPhoto(overrides?: Partial<MockPhotoApprovalItem>): MockPhotoApprovalItem {
  const id = crypto.randomUUID();
  return {
    id,
    item: {
      id: crypto.randomUUID(),
      name: 'Legacy Bulkhead',
      slug: 'legacy-bulkhead',
      franchise_slug: 'transformers',
      thumbnail_url: null,
    },
    photo: {
      url: `pending/${id}-original.webp`,
      caption: null,
      visibility: 'public',
    },
    uploader: {
      id: crypto.randomUUID(),
      display_name: 'Test Contributor',
      email: 'contributor@e2e.test',
    },
    contribution: {
      id: crypto.randomUUID(),
      consent_version: 'v1-2026-01-01',
      consent_granted_at: '2026-04-01T10:00:00.000Z',
      intent: 'catalog_and_training',
      contributed_by: crypto.randomUUID(),
    },
    existing_photos: [],
    can_decide: true,
    created_at: '2026-04-08T10:00:00.000Z',
    ...overrides,
  };
}

/**
 * Variant: contributor chose training_only intent. The public Approve
 * button must render disabled because promotion would require re-consent.
 */
function makeTrainingOnlyPhoto(overrides?: Partial<MockPhotoApprovalItem>): MockPhotoApprovalItem {
  const base = makePendingPhoto();
  // `makePendingPhoto` always builds a contribution — the `!` asserts what
  // the base factory guarantees. No defensive `null` branch.
  return {
    ...base,
    photo: { ...base.photo, visibility: 'training_only' },
    contribution: { ...base.contribution!, intent: 'training_only' },
    ...overrides,
  };
}

/**
 * Variant: the active photo has one existing approved photo at Hamming
 * distance 3 for the same item. Triggers the near-duplicate warning
 * banner (threshold is 4 — see `NEAR_DUPLICATE_DISTANCE`).
 */
function makeNearDuplicatePhoto(overrides?: Partial<MockPhotoApprovalItem>): MockPhotoApprovalItem {
  return makePendingPhoto({
    existing_photos: [
      {
        id: crypto.randomUUID(),
        url: 'approved/existing-near-duplicate.webp',
        distance: 3,
      },
    ],
    ...overrides,
  });
}

/**
 * Variant: the curator contributed this photo themselves. The server's
 * `can_decide` SQL expression returns false; all three decision buttons
 * render disabled with the self-review tooltip.
 */
function makeSelfReviewPhoto(overrides?: Partial<MockPhotoApprovalItem>): MockPhotoApprovalItem {
  return makePendingPhoto({
    can_decide: false,
    ...overrides,
  });
}

// --- Helpers ---

/**
 * Install the mock state on the page, suppress the auto-opening keyboard
 * shortcut overlay (first-visit localStorage gate), navigate to the
 * approval dashboard, and wait for the page heading to render.
 *
 * Navigation lives per-test (via this helper) rather than in a
 * `beforeEach` so scenarios that need a custom queue (S6 empty state,
 * S8 primed 409) can construct the state before calling setup.
 */
async function setupApprovalPage(page: Page, state: MockPhotoApprovalState): Promise<void> {
  await state.register(page);
  // Suppress the first-visit auto-open overlay so decision hotkeys aren't
  // intercepted by the shortcut dialog. Must run before goto so it's in
  // place when the page script first reads localStorage.
  await page.addInitScript(() => {
    localStorage.setItem('photo-approval-shortcuts-seen', 'true');
  });
  await page.goto('/admin/photo-approvals');
  await expect(
    page.getByRole('heading', { name: 'Photo Approvals', level: 1 })
  ).toBeVisible({ timeout: 10_000 });
}

function actionToolbar(page: Page) {
  return page.getByRole('toolbar', { name: 'Photo decision actions' });
}

// --- Scenarios ---

test.describe('Photo approval decisions', () => {
  test('Given a pending photo, When the curator presses A, Then the photo is approved publicly and removed', async ({
    page,
  }) => {
    const photo = makePendingPhoto();
    const state = new MockPhotoApprovalState([photo]);
    await setupApprovalPage(page, state);
    await expect(actionToolbar(page)).toBeVisible();

    const [request] = await Promise.all([
      page.waitForRequest(
        (req) =>
          req.url().includes(`/admin/photos/${photo.id}/status`) && req.method() === 'PATCH',
        { timeout: 5_000 }
      ),
      page.keyboard.press('a'),
    ]);

    expect(request.postDataJSON()).toEqual({ status: 'approved' });

    // Queue shrinks → empty state renders (was a single-photo queue).
    await expect(
      page.getByRole('heading', { name: 'No pending photos', level: 2 })
    ).toBeVisible();
  });

  test('Given a pending photo, When the curator presses T, Then the photo is approved as training_only', async ({
    page,
  }) => {
    const photo = makePendingPhoto();
    const state = new MockPhotoApprovalState([photo]);
    await setupApprovalPage(page, state);
    await expect(actionToolbar(page)).toBeVisible();

    const [request] = await Promise.all([
      page.waitForRequest(
        (req) =>
          req.url().includes(`/admin/photos/${photo.id}/status`) && req.method() === 'PATCH',
        { timeout: 5_000 }
      ),
      page.keyboard.press('t'),
    ]);

    expect(request.postDataJSON()).toEqual({
      status: 'approved',
      visibility: 'training_only',
    });

    await expect(
      page.getByRole('heading', { name: 'No pending photos', level: 2 })
    ).toBeVisible();
  });

  test('Given a pending photo, When the curator rejects via R then Blurry, Then the photo is rejected with code blurry', async ({
    page,
  }) => {
    const photo = makePendingPhoto();
    const state = new MockPhotoApprovalState([photo]);
    await setupApprovalPage(page, state);
    await expect(actionToolbar(page)).toBeVisible();

    await page.keyboard.press('r');

    const blurryButton = page.getByRole('button', { name: /Blurry/ });
    await expect(blurryButton).toBeVisible();

    const [request] = await Promise.all([
      page.waitForRequest(
        (req) =>
          req.url().includes(`/admin/photos/${photo.id}/status`) && req.method() === 'PATCH',
        { timeout: 5_000 }
      ),
      blurryButton.click(),
    ]);

    const body = request.postDataJSON() as Record<string, unknown>;
    expect(body.status).toBe('rejected');
    expect(body.rejection_reason_code).toBe('blurry');
    expect(body.rejection_reason_text).toBeUndefined();
  });
});

test.describe('Decision gating', () => {
  test('Given a training_only intent photo, When it renders, Then the public Approve button is disabled', async ({
    page,
  }) => {
    const state = new MockPhotoApprovalState([makeTrainingOnlyPhoto()]);
    await setupApprovalPage(page, state);

    const toolbar = actionToolbar(page);
    await expect(toolbar).toBeVisible();

    const approveButton = toolbar.getByRole('button', { name: /Approve\s+A$/ });
    const approveTrainingOnlyButton = toolbar.getByRole('button', {
      name: /Approve training only/,
    });
    const rejectButton = toolbar.getByRole('button', { name: /^Reject\s/ });

    await expect(approveButton).toBeDisabled();
    await expect(approveButton).toHaveAttribute('title', /training-only/);
    await expect(approveTrainingOnlyButton).toBeEnabled();
    await expect(rejectButton).toBeEnabled();
  });

  test('Given a photo the curator contributed, When it renders, Then all decision buttons are disabled', async ({
    page,
  }) => {
    const state = new MockPhotoApprovalState([makeSelfReviewPhoto()]);
    await setupApprovalPage(page, state);

    const toolbar = actionToolbar(page);
    await expect(toolbar).toBeVisible();

    const approveButton = toolbar.getByRole('button', { name: /Approve\s+A$/ });
    const approveTrainingOnlyButton = toolbar.getByRole('button', {
      name: /Approve training only/,
    });
    const rejectButton = toolbar.getByRole('button', { name: /^Reject\s/ });
    const prevButton = toolbar.getByRole('button', { name: /Prev\s/ });
    const nextButton = toolbar.getByRole('button', { name: /Next\s/ });

    await expect(approveButton).toBeDisabled();
    await expect(approveTrainingOnlyButton).toBeDisabled();
    await expect(rejectButton).toBeDisabled();
    await expect(approveButton).toHaveAttribute('title', /You contributed this photo/);
    // Navigation remains enabled so curators can skip past their own contributions.
    await expect(prevButton).toBeEnabled();
    await expect(nextButton).toBeEnabled();
  });
});

test.describe('Warnings and empty states', () => {
  test('Given an existing photo at distance 3, When the photo renders, Then the near-duplicate banner shows', async ({
    page,
  }) => {
    const state = new MockPhotoApprovalState([makeNearDuplicatePhoto()]);
    await setupApprovalPage(page, state);

    const banner = page.getByRole('alert').filter({ hasText: /Possible duplicate/ });
    await expect(banner).toBeVisible();
    // The banner surfaces the actual distance (3) for transparency.
    await expect(banner).toContainText('3');
  });

  test('Given one pending photo, When it is approved, Then the empty state is shown', async ({
    page,
  }) => {
    const state = new MockPhotoApprovalState([makePendingPhoto()]);
    await setupApprovalPage(page, state);
    await expect(actionToolbar(page)).toBeVisible();

    await page.keyboard.press('a');

    await expect(
      page.getByRole('heading', { name: 'No pending photos', level: 2 })
    ).toBeVisible();
    await expect(page.getByText(/You're all caught up/)).toBeVisible();
    // Triage view and action toolbar are gone.
    await expect(actionToolbar(page)).not.toBeVisible();
  });
});

test.describe('Conflict handling', () => {
  test('Given a primed 409 response, When the curator approves, Then the conflict banner shows and dismisses', async ({
    page,
  }) => {
    const state = new MockPhotoApprovalState([makePendingPhoto()]);
    state.setNextDecideResponse({
      status: 409,
      body: {
        error: 'Photo is not pending',
        current_status: 'approved',
      },
    });
    await setupApprovalPage(page, state);
    await expect(actionToolbar(page)).toBeVisible();

    await page.keyboard.press('a');

    const banner = page.getByRole('alert').filter({ hasText: /no longer pending/ });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('approved');

    await banner.getByRole('button', { name: 'Dismiss' }).click();
    await expect(banner).not.toBeVisible();
  });
});
