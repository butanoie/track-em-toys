import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

// ─── Generate a real EC key pair before vi.mock() hoisting ───────────────────
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
      keyId: 'ml-models-test-kid',
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
  getCurrentKid: vi.fn().mockReturnValue('ml-models-test-kid'),
  getPublicKeyPem: vi.fn().mockReturnValue(testPublicPem),
}));

vi.mock('./scanner.js', () => ({
  scanModels: vi.fn(),
}));

import { scanModels } from './scanner.js';

const mockScanModels = vi.mocked(scanModels);

let server: FastifyInstance;

function tokenHelper(): string {
  return server.jwt.sign({ sub: 'test-user-id', role: 'user' });
}

beforeAll(async () => {
  const { buildServer } = await import('../../server.js');
  server = await buildServer();
  await server.ready();
});

afterAll(async () => {
  await server.close();
});

describe('GET /ml/models', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/ml/models',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns empty models array when scanner returns no models', async () => {
    mockScanModels.mockResolvedValue([]);

    const token = tokenHelper();
    const res = await server.inject({
      method: 'GET',
      url: '/ml/models',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({ models: [] });
  });

  it('returns model summaries with download and metadata URLs', async () => {
    mockScanModels.mockResolvedValue([
      {
        metadata: {
          name: 'primary-classifier',
          version: 'primary-classifier-20260331-c117-a83.8',
          category: 'primary',
          format: 'onnx',
          class_count: 117,
          accuracy: 0.838,
          input_shape: [1, 3, 224, 224],
          input_names: ['input'],
          output_names: ['output'],
          label_map: { '0': 'transformers__optimus-prime' },
          trained_at: '2026-03-31T00:59:50.123Z',
          exported_at: '2026-03-31T01:10:30.456Z',
        },
        metadataFilename: 'primary-classifier-20260331-c117-a83.8-metadata.json',
        onnxFilename: 'primary-classifier-20260331-c117-a83.8.onnx',
        sizeBytes: 6_300_000,
      },
    ]);

    const token = tokenHelper();
    const res = await server.inject({
      method: 'GET',
      url: '/ml/models',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.models).toHaveLength(1);

    const model = body.models[0];
    expect(model).toBeDefined();
    expect(model.name).toBe('primary-classifier');
    expect(model.version).toBe('primary-classifier-20260331-c117-a83.8');
    expect(model.category).toBe('primary');
    expect(model.format).toBe('onnx');
    expect(model.class_count).toBe(117);
    expect(model.accuracy).toBe(0.838);
    expect(model.input_shape).toEqual([1, 3, 224, 224]);
    expect(model.size_bytes).toBe(6_300_000);
    expect(model.download_url).toBe('http://localhost:3010/ml/model-files/primary-classifier-20260331-c117-a83.8.onnx');
    expect(model.metadata_url).toBe(
      'http://localhost:3010/ml/model-files/primary-classifier-20260331-c117-a83.8-metadata.json'
    );
    expect(model.trained_at).toBe('2026-03-31T00:59:50.123Z');
    expect(model.exported_at).toBe('2026-03-31T01:10:30.456Z');
  });

  it('returns null download_url when ONNX file is missing', async () => {
    mockScanModels.mockResolvedValue([
      {
        metadata: {
          name: 'secondary-classifier',
          version: 'secondary-v1',
          category: 'secondary',
          format: 'onnx',
          class_count: 50,
          accuracy: 0.75,
          input_shape: [1, 3, 224, 224],
          input_names: ['input'],
          output_names: ['output'],
          label_map: {},
          trained_at: '2026-03-31T00:00:00Z',
          exported_at: '2026-03-31T00:00:00Z',
        },
        metadataFilename: 'secondary-v1-metadata.json',
        onnxFilename: null,
        sizeBytes: 0,
      },
    ]);

    const token = tokenHelper();
    const res = await server.inject({
      method: 'GET',
      url: '/ml/models',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const model = res.json().models[0];
    expect(model).toBeDefined();
    expect(model.download_url).toBeNull();
    expect(model.size_bytes).toBe(0);
  });

  it('excludes label_map from response', async () => {
    mockScanModels.mockResolvedValue([
      {
        metadata: {
          name: 'primary-classifier',
          version: 'primary-v1',
          category: 'primary',
          format: 'onnx',
          class_count: 10,
          accuracy: 0.9,
          input_shape: [1, 3, 224, 224],
          input_names: ['input'],
          output_names: ['output'],
          label_map: { '0': 'a', '1': 'b', '2': 'c' },
          trained_at: '2026-03-31T00:00:00Z',
          exported_at: '2026-03-31T00:00:00Z',
        },
        metadataFilename: 'primary-v1-metadata.json',
        onnxFilename: 'primary-v1.onnx',
        sizeBytes: 1000,
      },
    ]);

    const token = tokenHelper();
    const res = await server.inject({
      method: 'GET',
      url: '/ml/models',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const model = res.json().models[0];
    expect(model).toBeDefined();
    expect(model).not.toHaveProperty('label_map');
    expect(model).not.toHaveProperty('input_names');
    expect(model).not.toHaveProperty('output_names');
  });
});
