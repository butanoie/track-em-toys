import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionBar } from '../ActionBar';

function renderActionBar(props: Partial<React.ComponentProps<typeof ActionBar>> = {}) {
  const handlers = {
    onApprove: vi.fn(),
    onApproveTrainingOnly: vi.fn(),
    onReject: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onShowShortcuts: vi.fn(),
  };
  render(<ActionBar canDecide={true} isPending={false} {...handlers} {...props} />);
  return handlers;
}

describe('ActionBar', () => {
  it('fires the matching handler when each button is clicked', async () => {
    const user = userEvent.setup();
    const handlers = renderActionBar();

    await user.click(screen.getByRole('button', { name: /Approve A$/ }));
    await user.click(screen.getByRole('button', { name: /Approve training only T$/ }));
    await user.click(screen.getByRole('button', { name: /Reject R R$/ }));
    await user.click(screen.getByRole('button', { name: /Prev S$/ }));
    await user.click(screen.getByRole('button', { name: /Next D$/ }));
    await user.click(screen.getByRole('button', { name: /Show keyboard shortcuts/ }));

    expect(handlers.onApprove).toHaveBeenCalledTimes(1);
    expect(handlers.onApproveTrainingOnly).toHaveBeenCalledTimes(1);
    expect(handlers.onReject).toHaveBeenCalledTimes(1);
    expect(handlers.onPrev).toHaveBeenCalledTimes(1);
    expect(handlers.onNext).toHaveBeenCalledTimes(1);
    expect(handlers.onShowShortcuts).toHaveBeenCalledTimes(1);
  });

  it('disables decision buttons and exposes the self-review tooltip when canDecide is false', () => {
    renderActionBar({ canDecide: false });

    const approve = screen.getByRole('button', { name: /Approve A$/ });
    const approveT = screen.getByRole('button', { name: /Approve training only T$/ });
    const reject = screen.getByRole('button', { name: /Reject R R$/ });

    expect(approve).toBeDisabled();
    expect(approveT).toBeDisabled();
    expect(reject).toBeDisabled();
    expect(approve.getAttribute('title')).toMatch(/another curator must review/i);

    // Navigation remains enabled — the curator should still skip past their own contributions.
    expect(screen.getByRole('button', { name: /Prev S$/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Next D$/ })).toBeEnabled();
  });

  it('disables decision buttons while a mutation is in flight', () => {
    renderActionBar({ isPending: true });
    expect(screen.getByRole('button', { name: /Approve A$/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Reject R R$/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Prev S$/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Next D$/ })).toBeDisabled();
  });

  it('exposes aria-keyshortcuts on every shortcut-bound button', () => {
    renderActionBar();
    expect(screen.getByRole('button', { name: /Approve A$/ })).toHaveAttribute(
      'aria-keyshortcuts',
      'A',
    );
    expect(screen.getByRole('button', { name: /Reject R R$/ })).toHaveAttribute(
      'aria-keyshortcuts',
      'R R',
    );
  });
});
