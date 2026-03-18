import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '../components/ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders title and description', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Test Title"
        description="Test description"
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test description')).toBeInTheDocument();
  });

  it('confirm button is enabled by default when no confirmText', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Confirm"
        description="Are you sure?"
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
  });

  it('confirm button is disabled until correct confirmText is typed', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Purge"
        description="Type DELETE to confirm"
        confirmText="DELETE"
        confirmLabel="Purge User"
        onConfirm={onConfirm}
      />
    );

    const confirmButton = screen.getByRole('button', { name: 'Purge User' });
    expect(confirmButton).toBeDisabled();

    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'delete');
    expect(confirmButton).toBeDisabled();

    await userEvent.clear(input);
    await userEvent.type(input, 'DELETE');
    expect(confirmButton).toBeEnabled();
  });

  it('calls onConfirm when confirm button is clicked', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog open={true} onOpenChange={vi.fn()} title="Confirm" description="Sure?" onConfirm={onConfirm} />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('disables buttons when isPending', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Confirm"
        description="Sure?"
        onConfirm={vi.fn()}
        isPending={true}
      />
    );
    expect(screen.getByRole('button', { name: 'Processing...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('does not render when not open', () => {
    render(
      <ConfirmDialog open={false} onOpenChange={vi.fn()} title="Hidden" description="Not visible" onConfirm={vi.fn()} />
    );
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });
});
