import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockClient, mockPool } = vi.hoisted(() => {
  const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
  }
  const mockPool = {
    connect: vi.fn().mockResolvedValue(mockClient),
    on: vi.fn(),
    end: vi.fn(),
  }
  return { mockClient, mockPool }
})

vi.mock('pg', () => ({
  default: {
    Pool: class MockPool {
      connect = mockPool.connect
      on = mockPool.on
      end = mockPool.end
    },
  },
}))

vi.mock('pino', () => ({
  default: () => ({
    error: vi.fn(),
    info: vi.fn(),
  }),
}))

vi.mock('../config.js', () => ({
  config: {
    database: { url: 'postgresql://test:test@localhost:5432/testdb' },
  },
}))

import { withTransaction } from './pool.js'

describe('withTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPool.connect.mockResolvedValue(mockClient)
  })

  it('should BEGIN, execute function, and COMMIT on success', async () => {
    const callOrder: string[] = []
    mockClient.query.mockImplementation(async (sql: string) => {
      callOrder.push(sql)
      return { rows: [] }
    })

    const result = await withTransaction(async (client) => {
      await client.query('SELECT 1')
      return 'success'
    })

    expect(result).toBe('success')
    expect(callOrder).toEqual(['BEGIN', 'SELECT 1', 'COMMIT'])
  })

  it('should ROLLBACK on error and re-throw', async () => {
    const callOrder: string[] = []
    mockClient.query.mockImplementation(async (sql: string) => {
      callOrder.push(sql)
      return { rows: [] }
    })

    const error = new Error('DB constraint violation')

    await expect(
      withTransaction(async () => {
        throw error
      }),
    ).rejects.toThrow('DB constraint violation')

    expect(callOrder).toEqual(['BEGIN', 'ROLLBACK'])
  })

  it('should always release the client after success', async () => {
    mockClient.query.mockResolvedValue({ rows: [] })

    await withTransaction(async () => 'done')

    expect(mockClient.release).toHaveBeenCalledOnce()
  })

  it('should always release the client after failure', async () => {
    mockClient.query.mockResolvedValue({ rows: [] })

    try {
      await withTransaction(async () => {
        throw new Error('fail')
      })
    } catch {
      // expected
    }

    expect(mockClient.release).toHaveBeenCalledOnce()
  })

  it('should pass the client to the transaction function', async () => {
    mockClient.query.mockResolvedValue({ rows: [] })

    let receivedClient: unknown
    await withTransaction(async (client) => {
      receivedClient = client
    })

    expect(receivedClient).toBe(mockClient)
  })

  it('should return the value from the transaction function', async () => {
    mockClient.query.mockResolvedValue({ rows: [] })

    const result = await withTransaction(async () => ({
      id: 'user-1',
      name: 'Test',
    }))

    expect(result).toEqual({ id: 'user-1', name: 'Test' })
  })

  it('should set app.user_id when userId is provided', async () => {
    const callOrder: string[] = []
    mockClient.query.mockImplementation(async (sql: string) => {
      callOrder.push(sql)
      return { rows: [] }
    })

    await withTransaction(async (client) => {
      await client.query('SELECT 1')
    }, 'user-123')

    expect(callOrder).toEqual([
      'BEGIN',
      "SELECT set_config('app.user_id', $1, true)",
      'SELECT 1',
      'COMMIT',
    ])
    expect(mockClient.query).toHaveBeenCalledWith(
      "SELECT set_config('app.user_id', $1, true)",
      ['user-123'],
    )
  })

  it('should not set app.user_id when userId is null', async () => {
    const callOrder: string[] = []
    mockClient.query.mockImplementation(async (sql: string) => {
      callOrder.push(sql)
      return { rows: [] }
    })

    await withTransaction(async (client) => {
      await client.query('SELECT 1')
    }, null)

    expect(callOrder).toEqual(['BEGIN', 'SELECT 1', 'COMMIT'])
  })

  it('should not set app.user_id when userId is omitted', async () => {
    const callOrder: string[] = []
    mockClient.query.mockImplementation(async (sql: string) => {
      callOrder.push(sql)
      return { rows: [] }
    })

    await withTransaction(async (client) => {
      await client.query('SELECT 1')
    })

    expect(callOrder).toEqual(['BEGIN', 'SELECT 1', 'COMMIT'])
  })

  it('should ROLLBACK when set_config fails', async () => {
    const callOrder: string[] = []
    mockClient.query.mockImplementation(async (sql: string) => {
      callOrder.push(sql)
      if (sql.includes('set_config')) {
        throw new Error('set_config failed')
      }
      return { rows: [] }
    })

    await expect(
      withTransaction(async () => 'ok', 'user-123'),
    ).rejects.toThrow('set_config failed')

    expect(callOrder).toEqual([
      'BEGIN',
      "SELECT set_config('app.user_id', $1, true)",
      'ROLLBACK',
    ])
    expect(mockClient.release).toHaveBeenCalledOnce()
  })
})
