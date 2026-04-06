import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

const { testPrivatePem, testPublicPem } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required inside vi.hoisted
  const nodeCrypto = require('node:crypto') as typeof import('node:crypto');
  const { privateKey, publicKey } = nodeCrypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  return {
    testPrivatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    testPublicPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
  };
});

vi.mock('../../config.js', () => ({
  config: {
    port: 3000,
    nodeEnv: 'test',
    logLevel: 'silent',
    corsOrigin: 'http://localhost:5173',
    trustProxy: false,
    secureCookies: false,
    cookieSecret: 'test-cookie-secret-32-bytes-long!!',
    database: { url: 'postgresql://test:test@localhost:5432/testdb' },
    jwt: {
      privateKey: testPrivatePem,
      publicKey: testPublicPem,
      keyId: 'quality-test-kid',
      issuer: 'track-em-toys-test',
      audience: 'track-em-toys-api-test',
      accessTokenExpiry: '15m',
    },
    apple: { bundleId: undefined, servicesId: undefined },
    google: { webClientId: undefined, iosClientId: undefined },
    photos: {
      storagePath: '/tmp/trackem-test-photos',
      baseUrl: 'http://localhost:3010/photos',
      maxSizeMb: 10,
    },
    ml: {
      exportPath: '/tmp/trackem-test-ml-export',
      modelsPath: '/tmp/trackem-test-ml-models',
      modelsBaseUrl: 'http://localhost:3010/ml/model-files',
    },
  },
}));

vi.mock('../../db/pool.js', () => ({
  pool: { query: vi.fn(), connect: vi.fn(), on: vi.fn(), end: vi.fn() },
  withTransaction: vi.fn(),
}));

vi.mock('../../auth/key-store.js', () => ({
  initKeyStore: vi.fn(),
  getCurrentKid: vi.fn().mockReturnValue('quality-test-kid'),
  getPublicKeyPem: vi.fn().mockReturnValue(testPublicPem),
}));

const mockScanModels = vi.fn();
vi.mock('./scanner.js', () => ({
  scanModels: (...args: unknown[]) => mockScanModels(...args),
}));

const mockReadModelMetrics = vi.fn();
const mockComputeConfusedPairs = vi.fn();
vi.mock('./quality-reader.js', () => ({
  readModelMetrics: (...args: unknown[]) => mockReadModelMetrics(...args),
  computeConfusedPairs: (...args: unknown[]) => mockComputeConfusedPairs(...args),
}));

// Mock event queries (required by server registration)
vi.mock('../events/queries.js', () => ({
  insertMlEvent: vi.fn(),
  getSummaryStats: vi.fn(),
  getDailyStats: vi.fn(),
  getModelStats: vi.fn(),
}));

let server: FastifyInstance;

function userToken(): string {
  return server.jwt.sign({ sub: 'test-user-id', role: 'user' });
}

function adminToken(): string {
  return server.jwt.sign({ sub: 'test-admin-id', role: 'admin' });
}

beforeAll(async () => {
  const { buildServer } = await import('../../server.js');
  server = await buildServer();
  await server.ready();
});

afterAll(async () => {
  await server.close();
});

const mockMetadata = {
  name: 'primary-classifier',
  version: 'primary-classifier-20260401-c3-a85.0',
  category: 'primary',
  format: 'onnx',
  class_count: 3,
  accuracy: 0.85,
  input_shape: [1, 3, 224, 224],
  input_names: ['input'],
  output_names: ['output'],
  label_map: { '0': 'transformers__optimus-prime', '1': 'transformers__bumblebee', '2': 'gi-joe__snake-eyes' },
  trained_at: '2026-04-01T00:00:00Z',
  exported_at: '2026-04-01T01:00:00Z',
};

const mockMetrics = {
  model_stem: 'primary-classifier-20260401-c3-a85.0',
  category: 'primary',
  class_count: 3,
  best_val_accuracy: 0.85,
  top3_accuracy: 0.95,
  label_map: { '0': 'transformers__optimus-prime', '1': 'transformers__bumblebee', '2': 'gi-joe__snake-eyes' },
  per_class_accuracy: {
    'transformers__optimus-prime': 0.9,
    transformers__bumblebee: 0.8,
    'gi-joe__snake-eyes': 0.85,
  },
  confusion_matrix: [
    [9, 1, 0],
    [2, 8, 0],
    [0, 1, 9],
  ],
  hyperparams: { lr: 0.001, epochs: 25 },
  seed: 42,
  trained_at: '2026-04-01T00:00:00Z',
  data_dir: '/tmp/training',
};

describe('GET /ml/stats/model-quality', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/ml/stats/model-quality',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for non-admin users', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/ml/stats/model-quality',
      headers: { authorization: `Bearer ${userToken()}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns model quality data for admin', async () => {
    mockScanModels.mockResolvedValue([
      {
        metadata: mockMetadata,
        metadataFilename: 'primary-classifier-20260401-c3-a85.0-metadata.json',
        onnxFilename: 'primary-classifier-20260401-c3-a85.0.onnx',
        sizeBytes: 7_000_000,
      },
    ]);
    mockReadModelMetrics.mockResolvedValue(mockMetrics);
    mockComputeConfusedPairs.mockReturnValue([
      {
        true_label: 'transformers__bumblebee',
        predicted_label: 'transformers__optimus-prime',
        count: 2,
        pct_of_true_class: 0.2,
      },
    ]);

    const res = await server.inject({
      method: 'GET',
      url: '/ml/stats/model-quality',
      headers: { authorization: `Bearer ${adminToken()}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.models).toHaveLength(1);

    const model = body.models[0];
    expect(model.name).toBe('primary-classifier');
    expect(model.accuracy).toBe(0.85);
    expect(model.top3_accuracy).toBe(0.95);
    expect(model.metrics_available).toBe(true);
    expect(model.quality_gates.accuracy_pass).toBe(true);
    expect(model.quality_gates.size_pass).toBe(true);
    expect(model.per_class_accuracy).toHaveLength(3);
    // Sorted worst-first
    expect(model.per_class_accuracy[0].label).toBe('transformers__bumblebee');
    expect(model.per_class_accuracy[0].accuracy).toBe(0.8);
    expect(model.confused_pairs).toHaveLength(1);
    expect(model.confused_pairs[0].true_label).toBe('transformers__bumblebee');
  });

  it('returns metrics_available: false when metrics file is missing', async () => {
    mockScanModels.mockResolvedValue([
      {
        metadata: mockMetadata,
        metadataFilename: 'primary-classifier-20260401-c3-a85.0-metadata.json',
        onnxFilename: 'primary-classifier-20260401-c3-a85.0.onnx',
        sizeBytes: 7_000_000,
      },
    ]);
    mockReadModelMetrics.mockResolvedValue(null);

    const res = await server.inject({
      method: 'GET',
      url: '/ml/stats/model-quality',
      headers: { authorization: `Bearer ${adminToken()}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.models).toHaveLength(1);
    expect(body.models[0].metrics_available).toBe(false);
    expect(body.models[0].top3_accuracy).toBeNull();
    expect(body.models[0].per_class_accuracy).toBeNull();
    expect(body.models[0].confused_pairs).toBeNull();
    expect(body.models[0].hyperparams).toBeNull();
  });

  it('returns empty models when no models found', async () => {
    mockScanModels.mockResolvedValue([]);

    const res = await server.inject({
      method: 'GET',
      url: '/ml/stats/model-quality',
      headers: { authorization: `Bearer ${adminToken()}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().models).toEqual([]);
  });

  it('marks size_pass: false when model exceeds 10MB', async () => {
    mockScanModels.mockResolvedValue([
      {
        metadata: mockMetadata,
        metadataFilename: 'test-metadata.json',
        onnxFilename: 'test.onnx',
        sizeBytes: 15_000_000,
      },
    ]);
    mockReadModelMetrics.mockResolvedValue(null);

    const res = await server.inject({
      method: 'GET',
      url: '/ml/stats/model-quality',
      headers: { authorization: `Bearer ${adminToken()}` },
    });

    expect(res.statusCode).toBe(200);
    const model = res.json().models[0];
    expect(model.quality_gates.size_pass).toBe(false);
  });
});
