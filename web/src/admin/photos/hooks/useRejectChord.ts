import { useCallback, useRef } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

interface UseRejectChordOptions {
  /**
   * When false, the chord listener is detached entirely (page is in a
   * mutation, an overlay is open, focus is in a form element, etc.).
   */
  enabled: boolean;
  /**
   * Maximum delay between the two `R` presses, in milliseconds. Default
   * 500ms per D14.1 #3.
   */
  windowMs?: number;
  /**
   * Fired when two `R` presses occur within `windowMs`. The page wires
   * this to "open the reject overlay". Wrap in `useCallback` at the call
   * site — a new identity on every parent render re-binds the underlying
   * `useHotkeys` listener.
   */
  onChord: () => void;
}

/**
 * Custom adapter on top of `react-hotkeys-hook` for the R-R rejection
 * chord. The simple bindings (`A`, `T`, `1-6`, `S`, `D`, `Esc`) live in
 * the page directly via `useHotkeys` — only the chord needs custom
 * timing logic, so only the chord gets a dedicated hook.
 *
 * Returns a `resetChord` function the page calls on `activeIndex`
 * change so a stale "first R" cannot combine with a later "second R"
 * after the curator has moved to a different photo (D14.3).
 */
export function useRejectChord({ enabled, windowMs = 500, onChord }: UseRejectChordOptions) {
  // Timestamp of the most recent qualifying `R` press, or null if no
  // first press is pending. A ref (not state) because the value is read
  // synchronously inside the next keypress handler and never needs to
  // trigger a re-render.
  const firstPressAtRef = useRef<number | null>(null);

  const resetChord = useCallback(() => {
    firstPressAtRef.current = null;
  }, []);

  useHotkeys(
    'r',
    () => {
      const now = Date.now();
      const previous = firstPressAtRef.current;
      if (previous !== null && now - previous <= windowMs) {
        firstPressAtRef.current = null;
        onChord();
        return;
      }
      firstPressAtRef.current = now;
    },
    { enabled },
    [enabled, windowMs, onChord],
  );

  return { resetChord };
}
