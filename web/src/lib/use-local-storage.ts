import { useState, useCallback } from 'react';

/**
 * Persist a value in localStorage with automatic JSON serialization.
 *
 * @param key - localStorage key
 * @param initial - Default value when no stored value exists or parsing fails
 */
export function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : initial;
    } catch {
      return initial;
    }
  });

  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* storage quota — keep in-memory value */
      }
    },
    [key]
  );

  return [value, set];
}
