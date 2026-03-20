import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareLinkButton } from '../ShareLinkButton';

describe('ShareLinkButton', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders with aria-label "Copy link"', () => {
    render(<ShareLinkButton url="https://example.com" />);
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });

  it('copies url to clipboard on click', async () => {
    render(<ShareLinkButton url="https://example.com/item" />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://example.com/item');
  });

  it('changes aria-label to "Link copied" after click', async () => {
    render(<ShareLinkButton url="https://example.com" />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(screen.getByRole('button', { name: 'Link copied' })).toBeInTheDocument();
  });

  it('resets aria-label after timeout', async () => {
    render(<ShareLinkButton url="https://example.com" />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(screen.getByRole('button', { name: 'Link copied' })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });

  it('falls back to window.location.href when url is undefined', async () => {
    render(<ShareLinkButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(window.location.href);
  });

  it('handles clipboard failure silently', async () => {
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('denied'));
    render(<ShareLinkButton url="https://example.com" />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });
});
