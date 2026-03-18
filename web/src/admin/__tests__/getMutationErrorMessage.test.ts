import { describe, it, expect } from 'vitest';
import { getMutationErrorMessage, isBannerError } from '../users/types';
import { ApiError } from '@/lib/api-client';

describe('isBannerError', () => {
  it('returns true for ApiError 400', () => {
    expect(isBannerError(new ApiError(400, { error: 'Bad request' }))).toBe(true);
  });

  it('returns true for ApiError 403', () => {
    expect(isBannerError(new ApiError(403, { error: 'Forbidden' }))).toBe(true);
  });

  it('returns true for ApiError 404', () => {
    expect(isBannerError(new ApiError(404, { error: 'Not found' }))).toBe(true);
  });

  it('returns true for ApiError 409', () => {
    expect(isBannerError(new ApiError(409, { error: 'Conflict' }))).toBe(true);
  });

  it('returns false for ApiError 500', () => {
    expect(isBannerError(new ApiError(500, { error: 'Internal error' }))).toBe(false);
  });

  it('returns false for ApiError 503', () => {
    expect(isBannerError(new ApiError(503, { error: 'Service unavailable' }))).toBe(false);
  });

  it('returns false for plain Error', () => {
    expect(isBannerError(new Error('network failure'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isBannerError('string error')).toBe(false);
    expect(isBannerError(null)).toBe(false);
    expect(isBannerError(undefined)).toBe(false);
  });
});

describe('getMutationErrorMessage', () => {
  it('returns server message for ApiError 400', () => {
    const err = new ApiError(400, { error: 'Invalid role value' });
    expect(getMutationErrorMessage(err)).toBe('Invalid role value');
  });

  it('returns server message for ApiError 403', () => {
    const err = new ApiError(403, { error: 'Cannot assign role above your own' });
    expect(getMutationErrorMessage(err)).toBe('Cannot assign role above your own');
  });

  it('returns server message for ApiError 409', () => {
    const err = new ApiError(409, { error: 'Cannot demote the last admin' });
    expect(getMutationErrorMessage(err)).toBe('Cannot demote the last admin');
  });

  it('returns server message for ApiError 404', () => {
    const err = new ApiError(404, { error: 'User not found' });
    expect(getMutationErrorMessage(err)).toBe('User not found');
  });

  it('returns generic message for ApiError 500', () => {
    const err = new ApiError(500, { error: 'Internal server error' });
    expect(getMutationErrorMessage(err)).toBe('An unexpected error occurred. Please try again.');
  });

  it('returns generic message for plain Error', () => {
    expect(getMutationErrorMessage(new Error('fetch failed'))).toBe('An unexpected error occurred. Please try again.');
  });

  it('returns generic message for non-Error values', () => {
    expect(getMutationErrorMessage('string')).toBe('An unexpected error occurred. Please try again.');
    expect(getMutationErrorMessage(null)).toBe('An unexpected error occurred. Please try again.');
  });
});
