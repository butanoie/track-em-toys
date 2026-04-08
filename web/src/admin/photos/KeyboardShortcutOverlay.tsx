import { useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SHORTCUTS_SEEN_KEY } from './constants';

interface KeyboardShortcutOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * When true, the overlay auto-opens on mount if the user has not yet
   * seen it (`SHORTCUTS_SEEN_KEY` is unset in localStorage). The page
   * always sets this to `true` for the curator's first session and
   * lets the `?` shortcut handle reopens. Tests pass `false` to skip
   * auto-open behavior.
   *
   * NOTE: `onOpenChange` is captured once on mount by the auto-open
   * effect (it has an empty deps array on purpose — see the effect
   * body). The parent must therefore pass a *stable* callback —
   * wrap state setters in `useCallback` if you forward them through
   * an inline arrow.
   */
  autoOpenIfUnseen?: boolean;
}

interface ShortcutRow {
  keys: string;
  action: string;
}

const SHORTCUTS: readonly ShortcutRow[] = [
  { keys: 'A', action: 'Approve as-intended' },
  { keys: 'T', action: 'Approve as training only' },
  { keys: 'R R', action: 'Reject (no reason)' },
  { keys: '1', action: 'Reject — blurry' },
  { keys: '2', action: 'Reject — wrong item' },
  { keys: '3', action: 'Reject — NSFW' },
  { keys: '4', action: 'Reject — duplicate' },
  { keys: '5', action: 'Reject — poor quality' },
  { keys: '6', action: 'Reject — other (free text)' },
  { keys: 'S', action: 'Previous photo' },
  { keys: 'D', action: 'Next photo / skip' },
  { keys: '?', action: 'Open this shortcut overlay' },
  { keys: 'Esc', action: 'Close any open overlay' },
];

/**
 * First-visit cheat sheet for the photo approval keyboard layer.
 *
 * Per D8: stored as `localStorage[SHORTCUTS_SEEN_KEY] = 'true'` after
 * the first dismissal. The `?` hotkey (wired by the page) reopens the
 * overlay regardless of localStorage state — that is the only way to
 * see the shortcuts after dismissal.
 *
 * Marking the user as "seen" happens on the *first transition from
 * open to closed*, not on every close, so the parent can keep state
 * sync simple.
 */
export function KeyboardShortcutOverlay({
  open,
  onOpenChange,
  autoOpenIfUnseen = true,
}: KeyboardShortcutOverlayProps) {
  // Auto-open on mount when the user has never seen the overlay.
  useEffect(() => {
    if (!autoOpenIfUnseen) return;
    const seen = localStorage.getItem(SHORTCUTS_SEEN_KEY) === 'true';
    if (!seen) {
      onOpenChange(true);
    }
    // Mount-only: we deliberately depend on nothing so subsequent opens
    // (driven by the `?` hotkey) don't re-trigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Mark as seen on first dismissal so the next mount does not auto-open.
      localStorage.setItem(SHORTCUTS_SEEN_KEY, 'true');
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent aria-label="Keyboard shortcuts" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            All shortcuts cluster on the left side of the keyboard. Press{' '}
            <kbd className="rounded border px-1">?</kbd> at any time to reopen this overlay.
          </DialogDescription>
        </DialogHeader>
        <table className="w-full text-sm">
          <tbody>
            {SHORTCUTS.map((row) => (
              <tr key={row.keys} className="border-b border-border last:border-b-0">
                <td className="py-2 pr-4">
                  <kbd className="rounded border bg-muted px-2 py-0.5 font-mono text-xs">
                    {row.keys}
                  </kbd>
                </td>
                <td className="py-2 text-foreground">{row.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}
