import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KeyboardShortcutOverlay } from '../KeyboardShortcutOverlay';
import { SHORTCUTS_SEEN_KEY } from '../constants';

// jsdom's localStorage in this environment lacks standard methods —
// inject an in-memory mock (matches src/lib/__tests__/use-local-storage.test.ts).
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

describe('KeyboardShortcutOverlay', () => {
  beforeEach(() => {
    store = {};
    vi.clearAllMocks();
    // Touch the constant so the lint rule doesn't flag it as unused if
    // a test is later removed — and to keep the import documented.
    void SHORTCUTS_SEEN_KEY;
  });

  it('auto-opens on first mount when localStorage is empty', () => {
    const onOpenChange = vi.fn();
    render(<KeyboardShortcutOverlay open={false} onOpenChange={onOpenChange} />);
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('does NOT auto-open when the user has already dismissed it', () => {
    localStorage.setItem(SHORTCUTS_SEEN_KEY, 'true');
    const onOpenChange = vi.fn();
    render(<KeyboardShortcutOverlay open={false} onOpenChange={onOpenChange} />);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('does NOT auto-open when autoOpenIfUnseen is false', () => {
    const onOpenChange = vi.fn();
    render(
      <KeyboardShortcutOverlay open={false} onOpenChange={onOpenChange} autoOpenIfUnseen={false} />,
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('records dismissal to localStorage when the dialog reports a close', async () => {
    const onOpenChange = vi.fn();
    render(
      <KeyboardShortcutOverlay open={true} onOpenChange={onOpenChange} autoOpenIfUnseen={false} />,
    );
    // Radix renders a built-in close button labelled "Close" inside DialogContent.
    const closeButton = screen.getByRole('button', { name: /^Close$/ });
    const userEvent = (await import('@testing-library/user-event')).default;
    const user = userEvent.setup();
    await user.click(closeButton);

    expect(localStorage.getItem(SHORTCUTS_SEEN_KEY)).toBe('true');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders the full shortcut table when open', () => {
    render(
      <KeyboardShortcutOverlay open={true} onOpenChange={vi.fn()} autoOpenIfUnseen={false} />,
    );
    const dialog = screen.getByRole('dialog', { name: /Keyboard shortcuts/i });
    expect(dialog.textContent).toMatch(/Approve as-intended/);
    expect(dialog.textContent).toMatch(/Reject — blurry/);
    expect(dialog.textContent).toMatch(/Open this shortcut overlay/);
  });
});
