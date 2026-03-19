import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalStorage } from '../use-local-storage';

// jsdom's localStorage in this environment lacks standard methods.
// Mock it with a simple in-memory store.
let store: Record<string, string> = {};

const mockLocalStorage = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

describe('useLocalStorage', () => {
  beforeEach(() => {
    store = {};
    vi.clearAllMocks();
  });

  it('returns the initial value when nothing is stored', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'default'));

    expect(result.current[0]).toBe('default');
    expect(mockLocalStorage.getItem).toHaveBeenCalledWith('test-key');
  });

  it('returns the stored value when one exists', () => {
    store['test-key'] = JSON.stringify('stored-value');

    const { result } = renderHook(() => useLocalStorage('test-key', 'default'));

    expect(result.current[0]).toBe('stored-value');
  });

  it('returns the initial value when stored JSON is corrupted', () => {
    store['test-key'] = '{not valid json';

    const { result } = renderHook(() => useLocalStorage('test-key', 'fallback'));

    expect(result.current[0]).toBe('fallback');
  });

  it('writes to localStorage when the setter is called', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));

    act(() => {
      result.current[1]('updated');
    });

    expect(result.current[0]).toBe('updated');
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('test-key', JSON.stringify('updated'));
    expect(store['test-key']).toBe(JSON.stringify('updated'));
  });

  it('handles object values', () => {
    const initial: { view: string; perPage: number } = { view: 'grid', perPage: 20 };
    const { result } = renderHook(() => useLocalStorage('prefs', initial));

    expect(result.current[0]).toEqual(initial);

    const next = { view: 'table', perPage: 50 };
    act(() => {
      result.current[1](next);
    });

    expect(result.current[0]).toEqual(next);
    expect(JSON.parse(store['prefs'])).toEqual(next);
  });

  it('handles boolean values', () => {
    const { result } = renderHook(() => useLocalStorage('flag', false));

    expect(result.current[0]).toBe(false);

    act(() => {
      result.current[1](true);
    });

    expect(result.current[0]).toBe(true);
    expect(store['flag']).toBe('true');
  });

  it('uses different values for different keys', () => {
    store['key-a'] = JSON.stringify('alpha');
    store['key-b'] = JSON.stringify('beta');

    const { result: a } = renderHook(() => useLocalStorage('key-a', ''));
    const { result: b } = renderHook(() => useLocalStorage('key-b', ''));

    expect(a.current[0]).toBe('alpha');
    expect(b.current[0]).toBe('beta');
  });
});
