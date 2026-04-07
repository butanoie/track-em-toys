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

    expect(screen.getByRole('heading', { name: 'Contribute Photo' })).toBeInTheDocument();
    expect(screen.getByText(/perpetual, non-exclusive, royalty-free license/)).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<ContributeDialog {...defaultProps} open={false} />);

    expect(screen.queryByRole('heading', { name: 'Contribute Photo' })).not.toBeInTheDocument();
  });

  it('renders photo preview with correct URL', () => {
    render(<ContributeDialog {...defaultProps} />);

    const img = screen.getByAltText('Photo to contribute');
    expect(img).toHaveAttribute('src', 'http://photos/collection/u1/c1/p1-original.webp');
  });

  it('defaults intent to training_only and shows "Contribute to Training" button label', () => {
    render(<ContributeDialog {...defaultProps} />);

    expect(screen.getByRole('radio', { name: /Training only/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Catalog \+ Training/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: /Contribute to Training/ })).toBeInTheDocument();
  });

  it('switches button label to "Contribute to Catalog" when catalog_and_training is selected', async () => {
    const user = userEvent.setup();
    render(<ContributeDialog {...defaultProps} />);

    await user.click(screen.getByRole('radio', { name: /Catalog \+ Training/ }));

    expect(screen.getByRole('button', { name: /Contribute to Catalog/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Contribute to Training/ })).not.toBeInTheDocument();
  });

  it('renders submit button disabled by default (consent not acknowledged)', () => {
    render(<ContributeDialog {...defaultProps} />);

    expect(screen.getByRole('button', { name: /Contribute to Training/ })).toBeDisabled();
  });

  it('requires consent checkbox regardless of intent — training_only path', async () => {
    const user = userEvent.setup();
    render(<ContributeDialog {...defaultProps} />);

    expect(screen.getByRole('button', { name: /Contribute to Training/ })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /I confirm I have the right to share/ }));
    expect(screen.getByRole('button', { name: /Contribute to Training/ })).toBeEnabled();
  });

  it('requires consent checkbox regardless of intent — catalog_and_training path', async () => {
    const user = userEvent.setup();
    render(<ContributeDialog {...defaultProps} />);

    await user.click(screen.getByRole('radio', { name: /Catalog \+ Training/ }));
    expect(screen.getByRole('button', { name: /Contribute to Catalog/ })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /I confirm I have the right to share/ }));
    expect(screen.getByRole('button', { name: /Contribute to Catalog/ })).toBeEnabled();
  });

  it('calls onConfirm with training_only when default intent is confirmed', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ContributeDialog {...defaultProps} onConfirm={onConfirm} />);

    await user.click(screen.getByRole('checkbox', { name: /I confirm I have the right to share/ }));
    await user.click(screen.getByRole('button', { name: /Contribute to Training/ }));

    expect(onConfirm).toHaveBeenCalledExactlyOnceWith('training_only');
  });

  it('calls onConfirm with catalog_and_training when user picks the superset', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ContributeDialog {...defaultProps} onConfirm={onConfirm} />);

    await user.click(screen.getByRole('radio', { name: /Catalog \+ Training/ }));
    await user.click(screen.getByRole('checkbox', { name: /I confirm I have the right to share/ }));
    await user.click(screen.getByRole('button', { name: /Contribute to Catalog/ }));

    expect(onConfirm).toHaveBeenCalledExactlyOnceWith('catalog_and_training');
  });

  it('shows "Contributing..." text when isPending', () => {
    render(<ContributeDialog {...defaultProps} isPending={true} />);

    expect(screen.getByRole('button', { name: /Contributing/ })).toBeInTheDocument();
  });

  it('disables checkbox, radios, and buttons when isPending', () => {
    render(<ContributeDialog {...defaultProps} isPending={true} />);

    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: /Cancel/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Training only/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Catalog \+ Training/ })).toBeDisabled();
  });

  it('resets intent and checkbox state when reopened', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ContributeDialog {...defaultProps} />);

    // Flip to catalog_and_training and acknowledge consent.
    await user.click(screen.getByRole('radio', { name: /Catalog \+ Training/ }));
    await user.click(screen.getByRole('checkbox', { name: /I confirm I have the right to share/ }));
    expect(screen.getByRole('button', { name: /Contribute to Catalog/ })).toBeEnabled();

    // Close and reopen.
    rerender(<ContributeDialog {...defaultProps} open={false} />);
    rerender(<ContributeDialog {...defaultProps} open={true} />);

    // Intent back to training_only default, checkbox unchecked, button disabled.
    expect(screen.getByRole('radio', { name: /Training only/ })).toBeChecked();
    expect(screen.getByRole('button', { name: /Contribute to Training/ })).toBeDisabled();
  });
});
