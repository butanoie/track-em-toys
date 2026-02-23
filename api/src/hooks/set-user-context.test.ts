import { describe, it, expect } from 'vitest'

describe('set-user-context', () => {
  it('RLS context is now set inside withTransaction (see db/pool.test.ts)', () => {
    // The onRequest hook was removed because set_config must execute on the
    // same DB connection as the business logic. RLS context setup is tested
    // in db/pool.test.ts via the withTransaction userId parameter.
    expect(true).toBe(true)
  })
})
