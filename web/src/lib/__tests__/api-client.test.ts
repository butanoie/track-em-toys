import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { z } from 'zod'
import { ApiError, apiFetch, apiFetchJson } from '../api-client'
import { authStore } from '../auth-store'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Helper to create a Response
function makeResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

describe('ApiError', () => {
  it('has correct name and message', () => {
    const err = new ApiError(401, { error: 'Unauthorized' })
    expect(err.name).toBe('ApiError')
    expect(err.message).toBe('Unauthorized')
    expect(err.status).toBe(401)
    expect(err.body).toEqual({ error: 'Unauthorized' })
  })

  it('is instanceof Error', () => {
    const err = new ApiError(403, { error: 'Forbidden' })
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ApiError)
  })
})

describe('apiFetch', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    authStore.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('sends credentials: include on every request', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ ok: true }))
    await apiFetch('/some-endpoint')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/some-endpoint'),
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('attaches Authorization header when token is set', async () => {
    authStore.setToken('my-jwt-token')
    mockFetch.mockResolvedValueOnce(makeResponse({ ok: true }))
    await apiFetch('/api/toys')
    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = callArgs[1].headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer my-jwt-token')
  })

  it('does NOT attach Authorization header to /auth/signin', async () => {
    authStore.setToken('my-jwt-token')
    mockFetch.mockResolvedValueOnce(makeResponse({ access_token: 't', refresh_token: null, user: {} }))
    await apiFetch('/auth/signin', { method: 'POST' })
    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = callArgs[1].headers as Headers
    expect(headers.get('Authorization')).toBeNull()
  })

  it('does NOT attach Authorization header to /auth/refresh', async () => {
    authStore.setToken('my-jwt-token')
    mockFetch.mockResolvedValueOnce(makeResponse({ access_token: 't', refresh_token: null }))
    await apiFetch('/auth/refresh', { method: 'POST' })
    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = callArgs[1].headers as Headers
    expect(headers.get('Authorization')).toBeNull()
  })

  it('sets Content-Type: application/json on POST requests', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ ok: true }))
    await apiFetch('/api/toys', { method: 'POST', body: JSON.stringify({ name: 'Toy' }) })
    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = callArgs[1].headers as Headers
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('attempts token refresh on 401 and retries original request', async () => {
    authStore.setToken('expired-token')

    // First call returns 401
    mockFetch.mockResolvedValueOnce(makeResponse({ error: 'Unauthorized' }, 401))
    // Refresh call returns 200
    mockFetch.mockResolvedValueOnce(
      makeResponse({ access_token: 'new-token', refresh_token: null })
    )
    // Retry of original request returns 200
    mockFetch.mockResolvedValueOnce(makeResponse({ data: 'success' }))

    const response = await apiFetch('/api/protected')
    expect(response.status).toBe(200)
    expect(authStore.getToken()).toBe('new-token')
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('dispatches auth:sessionexpired event and returns a pending promise on failed refresh after 401', async () => {
    authStore.setToken('expired-token')

    // First call returns 401
    mockFetch.mockResolvedValueOnce(makeResponse({ error: 'Unauthorized' }, 401))
    // Refresh call also fails
    mockFetch.mockResolvedValueOnce(makeResponse({ error: 'Unauthorized' }, 401))

    const eventSpy = vi.fn()
    window.addEventListener('auth:sessionexpired', eventSpy)

    // apiFetch must not resolve — it returns a never-resolving promise
    let resolved = false
    void apiFetch('/api/protected').then(() => { resolved = true })

    // Wait for both fetch calls to complete
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))

    expect(eventSpy).toHaveBeenCalledTimes(1)
    expect(resolved).toBe(false)

    window.removeEventListener('auth:sessionexpired', eventSpy)
  })

  it('does NOT refresh on 401 from /auth/refresh (avoids infinite loop)', async () => {
    authStore.setToken('token')
    mockFetch.mockResolvedValueOnce(makeResponse({ error: 'Unauthorized' }, 401))

    const response = await apiFetch('/auth/refresh', { method: 'POST' })
    expect(response.status).toBe(401)
    // Should only have been called once (no retry)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})

describe('apiFetchJson', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    authStore.clear()
  })

  it('returns parsed JSON on success', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ name: 'Toy' }))
    const schema = z.object({ name: z.string() })
    const result = await apiFetchJson('/api/toys/1', schema)
    expect(result).toEqual({ name: 'Toy' })
  })

  it('throws ApiError on non-2xx response', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ error: 'Not Found' }, 404))
    await expect(apiFetchJson('/api/toys/999', z.unknown())).rejects.toBeInstanceOf(ApiError)
  })

  it('throws ApiError with correct status and body', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ error: 'Forbidden' }, 403))
    try {
      await apiFetchJson('/api/forbidden', z.unknown())
      expect.fail('Should have thrown')
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      expect(err.status).toBe(403)
      expect(err.body.error).toBe('Forbidden')
    }
  })

  it('handles non-JSON error response bodies gracefully', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 })
    )
    try {
      await apiFetchJson('/api/crash', z.unknown())
      expect.fail('Should have thrown')
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      expect(err.status).toBe(500)
      expect(err.body.error).toBe('HTTP 500')
    }
  })

  it('throws ZodError when response body does not match schema', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ unexpected: 'shape' }))
    const schema = z.object({ name: z.string() })
    await expect(apiFetchJson('/api/toys/1', schema)).rejects.toThrow()
  })
})
