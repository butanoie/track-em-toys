import { describe, it, expect } from 'vitest';
import {
  encodeCursor,
  decodeCursor,
  buildCursorPage,
  clampLimit,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} from './pagination.js';

describe('encodeCursor / decodeCursor', () => {
  it('round-trips name and id', () => {
    const cursor = encodeCursor('Optimus Prime', '550e8400-e29b-41d4-a716-446655440000');
    const decoded = decodeCursor(cursor);
    expect(decoded).toEqual({
      name: 'Optimus Prime',
      id: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('handles unicode characters in names', () => {
    const cursor = encodeCursor('コンボイ', 'abc-123');
    const decoded = decodeCursor(cursor);
    expect(decoded).toEqual({ name: 'コンボイ', id: 'abc-123' });
  });

  it('handles special characters in names', () => {
    const cursor = encodeCursor("Rack 'N' Ruin", 'abc-123');
    const decoded = decodeCursor(cursor);
    expect(decoded).toEqual({ name: "Rack 'N' Ruin", id: 'abc-123' });
  });

  it('handles empty name', () => {
    const cursor = encodeCursor('', 'abc-123');
    const decoded = decodeCursor(cursor);
    expect(decoded).toEqual({ name: '', id: 'abc-123' });
  });

  it('returns null for malformed base64', () => {
    expect(decodeCursor('not-valid-base64!!!')).toBeNull();
  });

  it('returns null for valid base64 but invalid JSON', () => {
    const cursor = Buffer.from('not json').toString('base64url');
    expect(decodeCursor(cursor)).toBeNull();
  });

  it('returns null for JSON without required fields', () => {
    const cursor = Buffer.from(JSON.stringify({ foo: 'bar' })).toString('base64url');
    expect(decodeCursor(cursor)).toBeNull();
  });

  it('returns null for wrong version', () => {
    const cursor = Buffer.from(JSON.stringify({ v: 2, name: 'a', id: 'b' })).toString('base64url');
    expect(decodeCursor(cursor)).toBeNull();
  });

  it('returns null for non-string name', () => {
    const cursor = Buffer.from(JSON.stringify({ v: 1, name: 123, id: 'b' })).toString('base64url');
    expect(decodeCursor(cursor)).toBeNull();
  });

  it('returns null for non-string id', () => {
    const cursor = Buffer.from(JSON.stringify({ v: 1, name: 'a', id: 456 })).toString('base64url');
    expect(decodeCursor(cursor)).toBeNull();
  });

  it('produces URL-safe output (no +, /, or = characters)', () => {
    const cursor = encodeCursor('Test Character With Long Name!!!', '550e8400-e29b-41d4-a716-446655440000');
    expect(cursor).not.toMatch(/[+/=]/);
  });
});

describe('buildCursorPage', () => {
  const makeRow = (name: string, id: string) => ({ name, id });

  it('returns all rows and null cursor when rows <= limit', () => {
    const rows = [makeRow('Alpha', '1'), makeRow('Beta', '2')];
    const result = buildCursorPage(rows, 5);
    expect(result.data).toHaveLength(2);
    expect(result.next_cursor).toBeNull();
  });

  it('returns empty array and null cursor for no rows', () => {
    const result = buildCursorPage([], 5);
    expect(result.data).toHaveLength(0);
    expect(result.next_cursor).toBeNull();
  });

  it('slices to limit and returns cursor when rows > limit', () => {
    const rows = [makeRow('Alpha', '1'), makeRow('Beta', '2'), makeRow('Gamma', '3')];
    const result = buildCursorPage(rows, 2);
    expect(result.data).toHaveLength(2);
    expect(result.data[0]?.name).toBe('Alpha');
    expect(result.data[1]?.name).toBe('Beta');
    expect(result.next_cursor).not.toBeNull();

    const decoded = decodeCursor(result.next_cursor!);
    expect(decoded).toBeDefined();
    expect(decoded!.name).toBe('Beta');
    expect(decoded!.id).toBe('2');
  });

  it('handles exactly limit+1 rows', () => {
    const rows = [makeRow('Alpha', '1'), makeRow('Beta', '2')];
    const result = buildCursorPage(rows, 1);
    expect(result.data).toHaveLength(1);
    expect(result.next_cursor).not.toBeNull();
  });
});

describe('clampLimit', () => {
  it('returns DEFAULT_PAGE_LIMIT for undefined', () => {
    expect(clampLimit(undefined)).toBe(DEFAULT_PAGE_LIMIT);
  });

  it('clamps to 1 for values below 1', () => {
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(-5)).toBe(1);
  });

  it('clamps to MAX_PAGE_LIMIT for values above max', () => {
    expect(clampLimit(500)).toBe(MAX_PAGE_LIMIT);
    expect(clampLimit(101)).toBe(MAX_PAGE_LIMIT);
  });

  it('passes through valid values', () => {
    expect(clampLimit(10)).toBe(10);
    expect(clampLimit(50)).toBe(50);
    expect(clampLimit(100)).toBe(100);
    expect(clampLimit(1)).toBe(1);
  });
});
