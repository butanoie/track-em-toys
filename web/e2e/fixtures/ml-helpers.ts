/**
 * Mock helpers for ML photo identification E2E tests.
 *
 * Provides:
 * - mockMlModels(): mock GET /ml/models with configurable model list
 * - mockMlModelsEmpty(): mock GET /ml/models with empty models
 * - mockMlEvents(): sink for POST /ml/events (telemetry, always 204)
 * - mockMlStats(): mock admin stats endpoints (summary, daily, models)
 * - injectTestPredictions(): inject predictions via window.__ML_TEST_PREDICTIONS__
 * - MOCK_PREDICTIONS: shared prediction fixtures
 */

import type { Page, Route } from '@playwright/test';

function isDocRequest(route: Route): boolean {
  return route.request().resourceType() === 'document';
}

function jsonResponse(body: unknown, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

// ─── Model metadata fixtures ────────────────────────────────────────────────

const MOCK_PRIMARY_MODEL = {
  name: 'primary-classifier-test',
  version: 'v1-test',
  category: 'primary',
  format: 'onnx',
  class_count: 5,
  accuracy: 0.85,
  input_shape: [1, 3, 224, 224],
  size_bytes: 1024,
  download_url: 'https://localhost:3010/ml/model-files/primary-test.onnx',
  metadata_url: 'https://localhost:3010/ml/model-files/primary-test-metadata.json',
  trained_at: '2026-03-30T00:00:00Z',
  exported_at: '2026-03-30T00:00:00Z',
};

const MOCK_SECONDARY_MODEL = {
  name: 'secondary-classifier-test',
  version: 'v1-test',
  category: 'secondary',
  format: 'onnx',
  class_count: 5,
  accuracy: 0.8,
  input_shape: [1, 3, 224, 224],
  size_bytes: 1024,
  download_url: 'https://localhost:3010/ml/model-files/secondary-test.onnx',
  metadata_url: 'https://localhost:3010/ml/model-files/secondary-test-metadata.json',
  trained_at: '2026-03-30T00:00:00Z',
  exported_at: '2026-03-30T00:00:00Z',
};

// ─── Prediction fixtures ────────────────────────────────────────────────────

export const MOCK_PREDICTIONS = [
  {
    label: 'transformers__legacy-bulkhead',
    franchiseSlug: 'transformers',
    itemSlug: 'legacy-bulkhead',
    confidence: 0.72,
  },
  {
    label: 'transformers__mp-44-optimus-prime',
    franchiseSlug: 'transformers',
    itemSlug: 'mp-44-optimus-prime',
    confidence: 0.15,
  },
  {
    label: 'gi-joe__classified-snake-eyes',
    franchiseSlug: 'gi-joe',
    itemSlug: 'classified-snake-eyes',
    confidence: 0.08,
  },
];

// ─── Mock ML models endpoint ────────────────────────────────────────────────

export async function mockMlModels(page: Page, models = [MOCK_PRIMARY_MODEL, MOCK_SECONDARY_MODEL]): Promise<void> {
  await page.route('**/ml/models', (route) => {
    if (isDocRequest(route)) return route.continue();
    return route.fulfill(jsonResponse({ models }));
  });
}

export async function mockMlModelsEmpty(page: Page): Promise<void> {
  await mockMlModels(page, []);
}

// ─── Mock ML events (telemetry sink) ────────────────────────────────────────

export async function mockMlEvents(page: Page): Promise<void> {
  await page.route('**/ml/events', (route) => {
    if (isDocRequest(route)) return route.continue();
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fallback();
  });
}

// ─── Inject test predictions ────────────────────────────────────────────────

/**
 * Inject mock predictions via window.__ML_TEST_PREDICTIONS__ so usePhotoIdentify
 * bypasses ONNX inference and returns these predictions directly.
 *
 * Call BEFORE page.goto() — uses addInitScript.
 */
export async function injectTestPredictions(page: Page, predictions = MOCK_PREDICTIONS): Promise<void> {
  await page.addInitScript((preds) => {
    (window as unknown as Record<string, unknown>).__ML_TEST_PREDICTIONS__ = preds;
  }, predictions);
}

// ─── Mock item detail for predictions ───────────────────────────────────────

const MOCK_ITEM_DETAILS: Record<string, object> = {
  'legacy-bulkhead': {
    id: 'a0000000-0000-4000-a000-000000000001',
    name: 'Legacy Bulkhead',
    slug: 'legacy-bulkhead',
    franchise: { slug: 'transformers', name: 'Transformers' },
    characters: [],
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
    product_code: 'F3055',
    photos: [],
    metadata: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  'mp-44-optimus-prime': {
    id: 'a0000000-0000-4000-a000-000000000002',
    name: 'MP-44 Optimus Prime',
    slug: 'mp-44-optimus-prime',
    franchise: { slug: 'transformers', name: 'Transformers' },
    characters: [],
    manufacturer: { slug: 'takara-tomy', name: 'Takara Tomy' },
    toy_line: { slug: 'masterpiece', name: 'Masterpiece' },
    thumbnail_url: null,
    size_class: null,
    year_released: 2019,
    is_third_party: false,
    data_quality: 'verified',
    description: null,
    barcode: null,
    sku: null,
    product_code: 'MP-44',
    photos: [],
    metadata: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  'classified-snake-eyes': {
    id: 'a0000000-0000-4000-a000-000000000003',
    name: 'Classified Snake Eyes',
    slug: 'classified-snake-eyes',
    franchise: { slug: 'gi-joe', name: 'G.I. Joe' },
    characters: [],
    manufacturer: { slug: 'hasbro', name: 'Hasbro' },
    toy_line: { slug: 'classified-series', name: 'Classified Series' },
    thumbnail_url: null,
    size_class: null,
    year_released: 2020,
    is_third_party: false,
    data_quality: 'verified',
    description: null,
    barcode: null,
    sku: null,
    product_code: null,
    photos: [],
    metadata: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
};

/**
 * Mock catalog item detail endpoints for items that appear in predictions.
 * PredictionCard eagerly fetches item detail, so these must be mocked.
 */
export async function mockPredictionItemDetails(page: Page): Promise<void> {
  // Catch-all for catalog requests — lowest priority
  await page.route('**/catalog/**', (route) => {
    if (isDocRequest(route)) return route.continue();
    return route.fulfill(jsonResponse({ data: [] }));
  });

  // Item detail routes — match /catalog/franchises/:franchise/items/:slug
  await page.route('**/catalog/franchises/*/items/*', (route) => {
    if (isDocRequest(route)) return route.continue();
    const url = new URL(route.request().url());
    const slug = url.pathname.split('/').pop();
    const detail = slug ? MOCK_ITEM_DETAILS[slug] : undefined;
    if (detail) {
      return route.fulfill(jsonResponse(detail));
    }
    return route.fulfill(jsonResponse({ error: 'Not found' }, 404));
  });
}

// ─── Mock admin ML stats endpoints ──────────────────────────────────────────

const MOCK_STATS_SUMMARY = {
  total_scans: 150,
  scans_completed: 120,
  scans_failed: 8,
  predictions_accepted: 45,
  acceptance_rate: 0.3,
  error_rate: 0.053,
  by_model: [
    { model_name: 'primary-classifier', scans: 100, accepted: 30 },
    { model_name: 'secondary-classifier', scans: 50, accepted: 15 },
  ],
};

const MOCK_STATS_DAILY = {
  data: [
    { date: '2026-03-28', scans_completed: 15, predictions_accepted: 5, scans_failed: 1 },
    { date: '2026-03-29', scans_completed: 20, predictions_accepted: 8, scans_failed: 2 },
    { date: '2026-03-30', scans_completed: 25, predictions_accepted: 10, scans_failed: 0 },
    { date: '2026-03-31', scans_completed: 30, predictions_accepted: 12, scans_failed: 3 },
  ],
};

const MOCK_STATS_MODELS = {
  data: [
    {
      model_name: 'primary-classifier',
      total_scans: 100,
      predictions_accepted: 30,
      scans_failed: 5,
      avg_confidence: 0.68,
    },
    {
      model_name: 'secondary-classifier',
      total_scans: 50,
      predictions_accepted: 15,
      scans_failed: 3,
      avg_confidence: 0.55,
    },
  ],
};

export async function mockMlStats(page: Page): Promise<void> {
  await page.route('**/ml/stats/summary*', (route) => {
    if (isDocRequest(route)) return route.continue();
    return route.fulfill(jsonResponse(MOCK_STATS_SUMMARY));
  });

  await page.route('**/ml/stats/daily*', (route) => {
    if (isDocRequest(route)) return route.continue();
    return route.fulfill(jsonResponse(MOCK_STATS_DAILY));
  });

  await page.route('**/ml/stats/models*', (route) => {
    if (isDocRequest(route)) return route.continue();
    return route.fulfill(jsonResponse(MOCK_STATS_MODELS));
  });
}
