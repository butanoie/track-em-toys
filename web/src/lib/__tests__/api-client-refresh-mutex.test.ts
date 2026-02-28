import { describe, it, expect, beforeEach, vi } from 'vitest'
import { apiFetch } from '../api-client'
import { authStore } from '../auth-store'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('apiFetch refresh mutex (concurrent 401 handling)', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    authStore.clear()
  })

  it('concurrent 401s share a single refresh call (refresh called exactly once)', async () => {
    authStore.setToken('expired-token')

    // Call 1 → 401, Call 2 → 401, then refresh → 200, retry 1 → 200, retry 2 → 200
    mockFetch
      .mockResolvedValueOnce(makeResponse({ error: 'Unauthorized' }, 401)) // call 1
      .mockResolvedValueOnce(makeResponse({ error: 'Unauthorized' }, 401)) // call 2
      .mockResolvedValueOnce(makeResponse({ access_token: 'new-tok', refresh_token: null })) // refresh
      .mockResolvedValueOnce(makeResponse({ data: 'a' })) // retry 1
      .mockResolvedValueOnce(makeResponse({ data: 'b' })) // retry 2

    const [res1, res2] = await Promise.all([
      apiFetch('/api/resource-a'),
      apiFetch('/api/resource-b'),
    ])

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)

    // Count refresh calls: /auth/refresh should appear exactly once
    const refreshCalls = mockFetch.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('/auth/refresh'),
    )
    expect(refreshCalls).toHaveLength(1)
  })

  it('both concurrent calls receive successful retry after shared refresh', async () => {
    authStore.setToken('expired-token')

    mockFetch
      .mockResolvedValueOnce(makeResponse({ error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(makeResponse({ error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(makeResponse({ access_token: 'fresh-tok', refresh_token: null }))
      .mockResolvedValueOnce(makeResponse({ result: 'first' }))
      .mockResolvedValueOnce(makeResponse({ result: 'second' }))

    const [res1, res2] = await Promise.all([
      apiFetch('/api/one'),
      apiFetch('/api/two'),
    ])

    const body1 = await res1.json()
    const body2 = await res2.json()

    expect(body1).toEqual({ result: 'first' })
    expect(body2).toEqual({ result: 'second' })
    expect(authStore.getToken()).toBe('fresh-tok')
  })

  it('both get auth:sessionexpired when shared refresh fails', async () => {
    authStore.setToken('expired-token')

    mockFetch
      .mockResolvedValueOnce(makeResponse({ error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(makeResponse({ error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(makeResponse({ error: 'Unauthorized' }, 401)) // refresh fails

    const eventSpy = vi.fn()
    window.addEventListener('auth:sessionexpired', eventSpy)

    // Both calls should return never-resolving promises — track resolution
    let resolved1 = false
    let resolved2 = false
    void apiFetch('/api/one').then(() => { resolved1 = true })
    void apiFetch('/api/two').then(() => { resolved2 = true })

    // Wait for all fetch calls to complete
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3))

    // The event should fire (at least once — both callers share the same refresh)
    expect(eventSpy).toHaveBeenCalled()
    expect(resolved1).toBe(false)
    expect(resolved2).toBe(false)

    window.removeEventListener('auth:sessionexpired', eventSpy)
  })
})
