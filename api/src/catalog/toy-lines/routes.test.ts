import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { mockQuery, setupCatalogTest } from '../shared/test-setup.js'

const { buildServer } = await setupCatalogTest()

describe('toy-line routes (franchise-scoped)', () => {
  let server: FastifyInstance
  beforeAll(async () => { server = await buildServer() })
  afterAll(async () => { await server.close() })
  beforeEach(() => { vi.clearAllMocks() })

  const toyLineRow = {
    id: 'tl-1', name: 'Masterpiece', slug: 'masterpiece',
    franchise_slug: 'transformers', franchise_name: 'Transformers',
    manufacturer_slug: 'takara-tomy', manufacturer_name: 'Takara Tomy',
    scale: '1:24', description: 'Premium collector line',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  }

  describe('GET /catalog/franchises/:franchise/toy-lines', () => {
    it('should return 200 with toy line list', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [toyLineRow] })
      const res = await server.inject({
        method: 'GET', url: '/catalog/franchises/transformers/toy-lines',
      })
      expect(res.statusCode).toBe(200)
      const body = res.json<{ data: Array<{ franchise: { slug: string }; manufacturer: { slug: string; name: string } }> }>()
      expect(body.data).toHaveLength(1)
      expect(body.data[0]?.franchise.slug).toBe('transformers')
      expect(body.data[0]?.manufacturer).toEqual({ slug: 'takara-tomy', name: 'Takara Tomy' })
    })
  })

  describe('GET /catalog/franchises/:franchise/toy-lines/:slug', () => {
    it('should return 200 with detail', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [toyLineRow] })
      const res = await server.inject({
        method: 'GET', url: '/catalog/franchises/transformers/toy-lines/masterpiece',
      })
      expect(res.statusCode).toBe(200)
    })

    it('should return 404 when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })
      const res = await server.inject({
        method: 'GET', url: '/catalog/franchises/transformers/toy-lines/nonexistent',
      })
      expect(res.statusCode).toBe(404)
    })
  })
})
