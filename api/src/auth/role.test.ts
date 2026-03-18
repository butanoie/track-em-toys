import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { hasRequiredRole, isRolePayload, requireRole } from './role.js'

describe('isRolePayload', () => {
  it('returns true for { sub: "uuid", role: "user" }', () => {
    expect(isRolePayload({ sub: 'test-uuid', role: 'user' })).toBe(true)
  })

  it('returns true for { sub: "uuid", role: "curator" }', () => {
    expect(isRolePayload({ sub: 'test-uuid', role: 'curator' })).toBe(true)
  })

  it('returns true for { sub: "uuid", role: "admin" }', () => {
    expect(isRolePayload({ sub: 'test-uuid', role: 'admin' })).toBe(true)
  })

  it('returns false for { sub: "uuid" } (missing role)', () => {
    expect(isRolePayload({ sub: 'test-uuid' })).toBe(false)
  })

  it('returns false for { sub: "uuid", role: "superadmin" } (invalid role)', () => {
    expect(isRolePayload({ sub: 'test-uuid', role: 'superadmin' })).toBe(false)
  })

  it('returns false for null', () => {
    expect(isRolePayload(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isRolePayload(undefined)).toBe(false)
  })

  it('returns false for { role: "admin" } (missing sub)', () => {
    expect(isRolePayload({ role: 'admin' })).toBe(false)
  })

  it('returns false for { sub: 123, role: "user" } (non-string sub)', () => {
    expect(isRolePayload({ sub: 123, role: 'user' })).toBe(false)
  })
})

describe('hasRequiredRole', () => {
  it('admin satisfies admin requirement', () => {
    expect(hasRequiredRole('admin', 'admin')).toBe(true)
  })

  it('admin satisfies curator requirement', () => {
    expect(hasRequiredRole('admin', 'curator')).toBe(true)
  })

  it('admin satisfies user requirement', () => {
    expect(hasRequiredRole('admin', 'user')).toBe(true)
  })

  it('curator satisfies curator requirement', () => {
    expect(hasRequiredRole('curator', 'curator')).toBe(true)
  })

  it('curator satisfies user requirement', () => {
    expect(hasRequiredRole('curator', 'user')).toBe(true)
  })

  it('curator does NOT satisfy admin requirement', () => {
    expect(hasRequiredRole('curator', 'admin')).toBe(false)
  })

  it('user satisfies user requirement', () => {
    expect(hasRequiredRole('user', 'user')).toBe(true)
  })

  it('user does NOT satisfy curator requirement', () => {
    expect(hasRequiredRole('user', 'curator')).toBe(false)
  })

  it('user does NOT satisfy admin requirement', () => {
    expect(hasRequiredRole('user', 'admin')).toBe(false)
  })
})

describe('requireRole', () => {
  let mockReply: FastifyReply

  beforeEach(() => {
    mockReply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply
  })

  it('returns a function (factory pattern)', () => {
    const handler = requireRole('admin')
    expect(typeof handler).toBe('function')
  })

  it('sends 403 when isRolePayload returns false (no role claim)', async () => {
    const handler = requireRole('admin')
    const mockRequest = { user: { sub: 'test-uuid' } } as unknown as FastifyRequest

    await handler(mockRequest, mockReply)

    expect(mockReply.code).toHaveBeenCalledWith(403)
    expect(mockReply.send).toHaveBeenCalledWith({ error: 'Forbidden' })
  })

  it('sends 403 when role is insufficient (user trying admin route)', async () => {
    const handler = requireRole('admin')
    const mockRequest = { user: { sub: 'test-uuid', role: 'user' } } as unknown as FastifyRequest

    await handler(mockRequest, mockReply)

    expect(mockReply.code).toHaveBeenCalledWith(403)
    expect(mockReply.send).toHaveBeenCalledWith({ error: 'Forbidden' })
  })

  it('does NOT send a response when role is sufficient (admin on admin route)', async () => {
    const handler = requireRole('admin')
    const mockRequest = { user: { sub: 'test-uuid', role: 'admin' } } as unknown as FastifyRequest

    await handler(mockRequest, mockReply)

    expect(mockReply.code).not.toHaveBeenCalled()
    expect(mockReply.send).not.toHaveBeenCalled()
  })

  it('does NOT send a response when role exceeds requirement (admin on curator route)', async () => {
    const handler = requireRole('curator')
    const mockRequest = { user: { sub: 'test-uuid', role: 'admin' } } as unknown as FastifyRequest

    await handler(mockRequest, mockReply)

    expect(mockReply.code).not.toHaveBeenCalled()
    expect(mockReply.send).not.toHaveBeenCalled()
  })
})
