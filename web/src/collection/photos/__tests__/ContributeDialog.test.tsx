import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContributeDialog } from '../ContributeDialog';

vi.mock('@/catalog/photos/api', () => ({
  buildPhotoUrl: (url: string) => `http://photos/${url}`,
}));

describe('ContributeDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    photoUrl: 'collection/u1/c1/p1-original.webp',
    onConfirm: vi.fn(),
    isPending: false,
  };

  it('renders title and disclaimer when open', () => {
    render(<ContributeDialog {...defaultProps} />);

    expect(screen.getByText('Contribute Photo to Catalog')).toBeInTheDocument();
    expect(screen.getByText(/perpetual, non-exclusive, royalty-free license/)).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<ContributeDialog {...defaultProps} open={false} />);

    expect(screen.queryByText('Contribute Photo to Catalog')).not.toBeInTheDocument();
  });

  it('renders photo preview with correct URL', () => {
    render(<ContributeDialog {...defaultProps} />);

    const img = screen.getByAltText('Photo to contribute');
    expect(img).toHaveAttribute('src', 'http://photos/collection/u1/c1/p1-original.webp');
  });

  it('renders submit button disabled by default', () => {
    render(<ContributeDialog {...defaultProps} />);

    expect(screen.getByRole('button', { name: /Contribute to Catalog/ })).toBeDisabled();
  });

  it('enables submit button after checking consent checkbox', async () => {
    const user = userEvent.setup();
    render(<ContributeDialog {...defaultProps} />);

    const checkbox = screen.getByRole('checkbox', { name: /I confirm I have the right to share/ });
    await user.click(checkbox);

    expect(screen.getByRole('button', { name: /Contribute to Catalog/ })).toBeEnabled();
  });

  it('calls onConfirm when submit button is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ContributeDialog {...defaultProps} onConfirm={onConfirm} />);

    await user.click(screen.getByRole('checkbox', { name: /I confirm I have the right to share/ }));
    await user.click(screen.getByRole('button', { name: /Contribute to Catalog/ }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('shows "Contributing..." text when isPending', () => {
    render(<ContributeDialog {...defaultProps} isPending={true} />);

    expect(screen.getByRole('button', { name: /Contributing/ })).toBeInTheDocument();
  });

  it('disables checkbox and buttons when isPending', () => {
    render(<ContributeDialog {...defaultProps} isPending={true} />);

    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: /Cancel/ })).toBeDisabled();
  });

  it('resets checkbox state when reopened', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ContributeDialog {...defaultProps} />);

    await user.click(screen.getByRole('checkbox', { name: /I confirm I have the right to share/ }));
    expect(screen.getByRole('button', { name: /Contribute to Catalog/ })).toBeEnabled();

    // Close and reopen
    rerender(<ContributeDialog {...defaultProps} open={false} />);
    rerender(<ContributeDialog {...defaultProps} open={true} />);

    expect(screen.getByRole('button', { name: /Contribute to Catalog/ })).toBeDisabled();
  });
});
