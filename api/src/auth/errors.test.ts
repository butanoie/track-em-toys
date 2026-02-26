/**
 * Unit tests for ProviderVerificationError and isNetworkError (auth/errors.ts).
 */

import { describe, it, expect } from 'vitest'
import { HttpError, ProviderVerificationError, isNetworkError } from './errors.js'

describe('HttpError', () => {
  it('is an instance of Error', () => {
    const err = new HttpError(401, { error: 'Unauthorized' })
    expect(err).toBeInstanceOf(Error)
  })

  it('has the correct statusCode', () => {
    const err = new HttpError(409, { error: 'Conflict' })
    expect(err.statusCode).toBe(409)
  })

  it('has the correct body', () => {
    const body = { error: 'Account deactivated' }
    const err = new HttpError(403, body)
    expect(err.body).toEqual(body)
  })

  it('has the correct name property', () => {
    const err = new HttpError(500, { error: 'Internal' })
    expect(err.name).toBe('HttpError')
  })
})

describe('ProviderVerificationError', () => {
  it('is an instance of Error', () => {
    const err = new ProviderVerificationError('bad token')
    expect(err).toBeInstanceOf(Error)
  })

  it('has the correct message', () => {
    const err = new ProviderVerificationError('audience mismatch')
    expect(err.message).toBe('audience mismatch')
  })

  it('has the correct name property', () => {
    const err = new ProviderVerificationError('expired')
    expect(err.name).toBe('ProviderVerificationError')
  })
})

describe('isNetworkError', () => {
  it('returns true for ECONNRESET', () => {
    const err = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
    expect(isNetworkError(err)).toBe(true)
  })

  it('returns true for ETIMEDOUT', () => {
    const err = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })
    expect(isNetworkError(err)).toBe(true)
  })

  it('returns true for ENOTFOUND', () => {
    const err = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
    expect(isNetworkError(err)).toBe(true)
  })

  it('returns true for ECONNREFUSED', () => {
    const err = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' })
    expect(isNetworkError(err)).toBe(true)
  })

  it('returns false for a plain Error with no code', () => {
    const err = new Error('something went wrong')
    expect(isNetworkError(err)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isNetworkError(null)).toBe(false)
  })

  it('returns false for a non-Error object', () => {
    expect(isNetworkError({ code: 'ECONNRESET', message: 'not an Error instance' })).toBe(false)
  })

  it('returns false for an error with an unrecognised code', () => {
    const err = Object.assign(new Error('unknown'), { code: 'ESOMETHINGELSE' })
    expect(isNetworkError(err)).toBe(false)
  })

  it('returns true for EHOSTDOWN', () => {
    const err = Object.assign(new Error('host is down'), { code: 'EHOSTDOWN' })
    expect(isNetworkError(err)).toBe(true)
  })

  it('returns true for ENETDOWN', () => {
    const err = Object.assign(new Error('network is down'), { code: 'ENETDOWN' })
    expect(isNetworkError(err)).toBe(true)
  })
})
