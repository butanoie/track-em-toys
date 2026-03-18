import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockClient, mockPool, logger, poolConstructorArgs } = vi.hoisted(() => {
  const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
  };
  // Captures the options object passed to new pg.Pool(...) at module load time.
  const poolConstructorArgs: { options?: Record<string, unknown> } = {};
  const mockPool = {
    connect: vi.fn().mockResolvedValue(mockClient),
    on: vi.fn(),
    end: vi.fn(),
  };
  const logger = {
    error: vi.fn(),
    info: vi.fn(),
  };
  return { mockClient, mockPool, logger, poolConstructorArgs };
});

vi.mock('pg', () => ({
  default: {
    Pool: class MockPool {
      constructor(options: Record<string, unknown>) {
        poolConstructorArgs.options = options;
      }
      connect = mockPool.connect;
      on = mockPool.on;
      end = mockPool.end;
    },
  },
}));

vi.mock('pino', () => ({
  default: () => logger,
}));

vi.mock('../config.js', () => ({
  config: {
    nodeEnv: 'test',
    logLevel: 'silent',
    database: { url: 'postgresql://test:test@localhost:5432/testdb', poolMax: 20 },
  },
}));

import { withTransaction } from './pool.js';

/**
 * The pool error handler is registered at module load time (pool.on('error', handler)).
 * Capture it once here, before any beforeEach() vi.clearAllMocks() wipes the call records.
 * Using a getter defers the lookup to after the module is imported above.
 */
function getPoolErrorHandler(): ((err: Error) => void) | undefined {
  const call = mockPool.on.mock.calls.find((args) => args[0] === 'error');
  return call?.[1] as ((err: Error) => void) | undefined;
}

/**
 * The single set_config call emitted after BEGIN.
 * Always uses a $1 parameter — passes '' when userId is null/omitted,
 * or the actual userId when one is provided. One round-trip in all cases.
 */
const SET_USER_ID = "SELECT set_config('app.user_id', $1, true)";

describe('withTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPool.connect.mockResolvedValue(mockClient);
  });

  it('should BEGIN, set user_id to empty string, execute function, and COMMIT on success', async () => {
    const callOrder: string[] = [];
    mockClient.query.mockImplementation(async (sql: string) => {
      callOrder.push(sql);
      return { rows: [] };
    });

    const result = await withTransaction(async (client) => {
      await client.query('SELECT 1');
      return 'success';
    });

    expect(result).toBe('success');
    expect(callOrder).toEqual(['BEGIN', SET_USER_ID, 'SELECT 1', 'COMMIT']);
    // Confirm the single set_config call passes '' for unauthenticated transactions
    expect(mockClient.query).toHaveBeenCalledWith(SET_USER_ID, ['']);
  });

  it('should ROLLBACK on error and re-throw', async () => {
    const callOrder: string[] = [];
    mockClient.query.mockImplementation(async (sql: string) => {
      callOrder.push(sql);
      return { rows: [] };
    });

    const error = new Error('DB constraint violation');

    await expect(
      withTransaction(async () => {
        throw error;
      })
    ).rejects.toThrow('DB constraint violation');

    expect(callOrder).toEqual(['BEGIN', SET_USER_ID, 'ROLLBACK']);
  });

  it('should always release the client after success', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    await withTransaction(async () => 'done');

    expect(mockClient.release).toHaveBeenCalledOnce();
  });

  it('should always release the client after failure', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    try {
      await withTransaction(async () => {
        throw new Error('fail');
      });
    } catch {
      // expected
    }

    expect(mockClient.release).toHaveBeenCalledOnce();
  });

  it('should pass the client to the transaction function', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    let receivedClient: unknown;
    await withTransaction(async (client) => {
      receivedClient = client;
    });

    expect(receivedClient).toBe(mockClient);
  });

  it('should return the value from the transaction function', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    const result = await withTransaction(async () => ({
      id: 'user-1',
      name: 'Test',
    }));

    expect(result).toEqual({ id: 'user-1', name: 'Test' });
  });

  it('should set app.user_id to the provided userId in a single set_config call', async () => {
    const callOrder: string[] = [];
    mockClient.query.mockImplementation(async (sql: string) => {
      callOrder.push(sql);
      return { rows: [] };
    });

    await withTransaction(async (client) => {
      await client.query('SELECT 1');
    }, 'user-123');

    // Single set_config call with the userId — no separate reset round-trip
    expect(callOrder).toEqual(['BEGIN', SET_USER_ID, 'SELECT 1', 'COMMIT']);
    expect(mockClient.query).toHaveBeenCalledWith(SET_USER_ID, ['user-123']);
  });

  it('should set app.user_id to empty string when userId is null', async () => {
    const callOrder: string[] = [];
    mockClient.query.mockImplementation(async (sql: string) => {
      callOrder.push(sql);
      return { rows: [] };
    });

    await withTransaction(async (client) => {
      await client.query('SELECT 1');
    }, null);

    // Single set_config call passes '' for null userId — no separate reset round-trip
    expect(callOrder).toEqual(['BEGIN', SET_USER_ID, 'SELECT 1', 'COMMIT']);
    expect(mockClient.query).toHaveBeenCalledWith(SET_USER_ID, ['']);
  });

  it('should set app.user_id to empty string when userId is omitted', async () => {
    const callOrder: string[] = [];
    mockClient.query.mockImplementation(async (sql: string) => {
      callOrder.push(sql);
      return { rows: [] };
    });

    await withTransaction(async (client) => {
      await client.query('SELECT 1');
    });

    // Single set_config call passes '' when userId is omitted — no separate reset round-trip
    expect(callOrder).toEqual(['BEGIN', SET_USER_ID, 'SELECT 1', 'COMMIT']);
    expect(mockClient.query).toHaveBeenCalledWith(SET_USER_ID, ['']);
  });

  it('should ROLLBACK and re-throw when the set_config call fails', async () => {
    const callOrder: string[] = [];
    mockClient.query.mockImplementation(async (sql: string) => {
      callOrder.push(sql);
      if (sql === SET_USER_ID) {
        throw new Error('set_config failed');
      }
      return { rows: [] };
    });

    await expect(withTransaction(async () => 'ok', 'user-123')).rejects.toThrow('set_config failed');

    expect(callOrder).toEqual(['BEGIN', SET_USER_ID, 'ROLLBACK']);
    expect(mockClient.release).toHaveBeenCalledOnce();
  });

  it('should log and re-throw when ROLLBACK itself fails', async () => {
    const callOrder: string[] = [];
    mockClient.query.mockImplementation(async (sql: string) => {
      callOrder.push(sql);
      if (sql === 'ROLLBACK') throw new Error('ROLLBACK failed');
      return { rows: [] };
    });

    await expect(
      withTransaction(async () => {
        throw new Error('original error');
      })
    ).rejects.toThrow('original error');

    expect(callOrder).toContain('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalledOnce();
  });
});

// [T5] pool.on('error') handler test
describe('pool error handler', () => {
  // Capture the error handler before beforeEach() in the outer describe calls
  // vi.clearAllMocks(), which would wipe mockPool.on.mock.calls.
  const poolErrorHandler = getPoolErrorHandler();

  it('should call logger.error with { err } when the pool emits an error', () => {
    // The pool.on('error', handler) registration happens at module load time.
    expect(poolErrorHandler).toBeDefined();

    const testError = new Error('pool connection lost');
    poolErrorHandler!(testError);

    expect(logger.error).toHaveBeenCalledWith({ err: testError }, 'Unexpected pool error');
  });
});

// [T7] Pool max configuration test
describe('pool max configuration', () => {
  it('should construct the pool with the configured poolMax value', () => {
    // The module-level mock loaded pool.ts with poolMax: 20.
    // poolConstructorArgs.options was captured by the MockPool constructor.
    expect(poolConstructorArgs.options?.max).toBe(20);
  });

  it('should use a custom poolMax value from config', async () => {
    vi.resetModules();
    vi.doMock('../config.js', () => ({
      config: {
        nodeEnv: 'test',
        logLevel: 'silent',
        database: { url: 'postgresql://test:test@localhost:5432/testdb', poolMax: 5 },
      },
    }));
    await import('./pool.js');
    expect(poolConstructorArgs.options?.max).toBe(5);
    vi.doUnmock('../config.js');
    vi.resetModules();
  });
});

// [T6] Pool SSL configuration tests
// Each test re-imports pool.ts after overriding the config mock so we can
// assert the options passed to new pg.Pool() for different nodeEnv values.
describe('pool SSL configuration', () => {
  it('should set ssl: undefined for nodeEnv "test"', () => {
    // The module-level mock already loaded pool.ts with nodeEnv: 'test'.
    // poolConstructorArgs.options was captured by the MockPool constructor.
    expect(poolConstructorArgs.options?.ssl).toBeUndefined();
  });

  it('should set ssl: { rejectUnauthorized: true } for nodeEnv "production" without sslCa', async () => {
    vi.resetModules();
    vi.doMock('../config.js', () => ({
      config: {
        nodeEnv: 'production',
        logLevel: 'silent',
        database: { url: 'postgresql://test:test@localhost:5432/testdb', sslCa: undefined, poolMax: 20 },
      },
    }));
    await import('./pool.js');
    expect(poolConstructorArgs.options?.ssl).toEqual({ rejectUnauthorized: true });
    vi.doUnmock('../config.js');
    vi.resetModules();
  });

  it('should set ssl: { rejectUnauthorized: true, ca } for nodeEnv "production" with sslCa', async () => {
    vi.resetModules();
    vi.doMock('../config.js', () => ({
      config: {
        nodeEnv: 'production',
        logLevel: 'silent',
        database: { url: 'postgresql://test:test@localhost:5432/testdb', sslCa: 'CERT_PEM', poolMax: 20 },
      },
    }));
    await import('./pool.js');
    expect(poolConstructorArgs.options?.ssl).toEqual({ rejectUnauthorized: true, ca: 'CERT_PEM' });
    vi.doUnmock('../config.js');
    vi.resetModules();
  });

  it('should set ssl: { rejectUnauthorized: true } for nodeEnv "staging" without sslCa', async () => {
    vi.resetModules();
    vi.doMock('../config.js', () => ({
      config: {
        nodeEnv: 'staging',
        logLevel: 'silent',
        database: { url: 'postgresql://test:test@localhost:5432/testdb', sslCa: undefined, poolMax: 20 },
      },
    }));
    await import('./pool.js');
    expect(poolConstructorArgs.options?.ssl).toEqual({ rejectUnauthorized: true });
    vi.doUnmock('../config.js');
    vi.resetModules();
  });

  it('should set ssl: { rejectUnauthorized: true, ca } for nodeEnv "staging" with sslCa', async () => {
    vi.resetModules();
    vi.doMock('../config.js', () => ({
      config: {
        nodeEnv: 'staging',
        logLevel: 'silent',
        database: { url: 'postgresql://test:test@localhost:5432/testdb', sslCa: 'CERT_PEM', poolMax: 20 },
      },
    }));
    await import('./pool.js');
    expect(poolConstructorArgs.options?.ssl).toEqual({ rejectUnauthorized: true, ca: 'CERT_PEM' });
    vi.doUnmock('../config.js');
    vi.resetModules();
  });

  it('should set ssl: undefined for nodeEnv "development"', async () => {
    vi.resetModules();
    vi.doMock('../config.js', () => ({
      config: {
        nodeEnv: 'development',
        logLevel: 'silent',
        database: { url: 'postgresql://test:test@localhost:5432/testdb', sslCa: undefined, poolMax: 20 },
      },
    }));
    await import('./pool.js');
    expect(poolConstructorArgs.options?.ssl).toBeUndefined();
    vi.doUnmock('../config.js');
    vi.resetModules();
  });
});
