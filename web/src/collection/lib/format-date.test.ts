import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatRelativeDate } from './format-date';

describe('formatRelativeDate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "today" for the current date', () => {
    vi.useFakeTimers({ now: new Date('2026-03-23T12:00:00Z') });
    expect(formatRelativeDate('2026-03-23T08:00:00Z')).toBe('today');
  });

  it('returns "yesterday" for one day ago', () => {
    vi.useFakeTimers({ now: new Date('2026-03-23T12:00:00Z') });
    expect(formatRelativeDate('2026-03-22T12:00:00Z')).toBe('yesterday');
  });

  it('returns days ago for recent dates', () => {
    vi.useFakeTimers({ now: new Date('2026-03-23T12:00:00Z') });
    expect(formatRelativeDate('2026-03-16T12:00:00Z')).toBe('7d ago');
  });

  it('returns months ago for older dates', () => {
    vi.useFakeTimers({ now: new Date('2026-03-23T12:00:00Z') });
    expect(formatRelativeDate('2026-01-01T12:00:00Z')).toBe('2mo ago');
  });

  it('returns years ago for dates over a year old', () => {
    vi.useFakeTimers({ now: new Date('2026-03-23T12:00:00Z') });
    expect(formatRelativeDate('2024-06-15T12:00:00Z')).toBe('1y ago');
  });
});
