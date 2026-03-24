/**
 * Reusable helpers for collection export/import E2E tests.
 *
 * Provides: export file builders, dialog interaction primitives,
 * and download content readers.
 */

import type { Page, Download } from '@playwright/test';
import type { MockCollectionItem } from './mock-helpers';

// ─── Export file builders ────────────────────────────────────────────────────

/**
 * Build a valid CollectionExportPayload object from mock items.
 * The shape matches CollectionExportPayloadSchema exactly.
 */
export function buildExportPayload(
  items: MockCollectionItem[],
  overrides?: { version?: number; exported_at?: string }
) {
  return {
    version: overrides?.version ?? 1,
    exported_at: overrides?.exported_at ?? new Date().toISOString(),
    items: items.map((i) => ({
      franchise_slug: i.franchise.slug,
      item_slug: i.item_slug,
      condition: i.condition,
      notes: i.notes,
      added_at: i.created_at,
      deleted_at: null,
    })),
  };
}

/**
 * Build an export file as a Playwright-compatible file descriptor.
 * Use with page.locator('input[type="file"]').setInputFiles(descriptor).
 */
export function buildExportFileDescriptor(
  items: MockCollectionItem[],
  overrides?: { version?: number; exported_at?: string; filename?: string }
) {
  const payload = buildExportPayload(items, overrides);
  return {
    name: overrides?.filename ?? 'collection-export.json',
    mimeType: 'application/json' as const,
    buffer: Buffer.from(JSON.stringify(payload)),
  };
}

/**
 * Build a raw JSON file descriptor from arbitrary content.
 * Use for error-state tests (invalid JSON, bad schema, etc).
 */
export function buildRawFileDescriptor(content: string, filename = 'test-import.json') {
  return {
    name: filename,
    mimeType: 'application/json' as const,
    buffer: Buffer.from(content),
  };
}

// ─── Dialog interaction helpers ──────────────────────────────────────────────

/**
 * Select a file in the import dialog by setting the hidden file input.
 * Waits for the file-selected phase (preview visible) before returning.
 */
export async function selectImportFile(
  page: Page,
  descriptor: { name: string; mimeType: string; buffer: Buffer }
): Promise<void> {
  await page.locator('[role="dialog"] input[type="file"]').setInputFiles(descriptor);
}

/**
 * Wait for the import dialog to reach the file-selected phase.
 */
export async function waitForFileSelected(page: Page): Promise<void> {
  await page.getByText('Choose how to import').waitFor({ state: 'visible', timeout: 5_000 });
}

/**
 * Click the Append button in the file-selected phase footer.
 */
export async function clickAppend(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Append$/i }).click();
}

/**
 * Click the Replace (overwrite) button in the dialog footer.
 * ImportPreview also renders a "Replace" button (to pick a different file),
 * so we use .nth(1) — the footer button is always the second match.
 */
export async function clickReplace(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /^Replace$/i })
    .nth(1)
    .click();
}

/**
 * Confirm the append AlertDialog by clicking the action button.
 */
export async function confirmAppendDialog(page: Page): Promise<void> {
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: /Append \d+ items?/i }).click();
}

/**
 * Confirm the standard overwrite AlertDialog by clicking "Replace collection".
 */
export async function confirmReplaceDialog(page: Page): Promise<void> {
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: /^Replace collection$/i }).click();
}

/**
 * Confirm the size-warning AlertDialog by clicking "Yes, replace collection".
 */
export async function confirmSizeWarningDialog(page: Page): Promise<void> {
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: /Yes, replace collection/i }).click();
}

// ─── Download helpers ────────────────────────────────────────────────────────

/**
 * Read a Playwright Download object's content as parsed JSON.
 */
export async function readDownloadJson(download: Download): Promise<unknown> {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Download stream is null');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as unknown;
}
