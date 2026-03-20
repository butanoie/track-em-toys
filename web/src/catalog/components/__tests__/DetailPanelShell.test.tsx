import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetailPanelShell } from '../DetailPanelShell';

const defaultProps = {
  entityType: 'Item',
  emptyMessage: 'Select an item to view details',
  isPending: false,
  isError: false,
  onClose: vi.fn(),
  children: <p>Detail content</p>,
};

describe('DetailPanelShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty-state aside when slug is undefined', () => {
    render(<DetailPanelShell {...defaultProps} slug={undefined} title={undefined} />);
    expect(screen.getByText('Select an item to view details')).toBeInTheDocument();
    expect(screen.getByRole('complementary')).toHaveAttribute('aria-label', 'Item detail');
  });

  it('renders loading skeleton with aria-busy when isPending', () => {
    render(<DetailPanelShell {...defaultProps} slug="test" title={undefined} isPending={true} />);
    const aside = screen.getByRole('complementary');
    expect(aside).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading Item details...')).toBeInTheDocument();
  });

  it('renders error message when isError is true', () => {
    render(<DetailPanelShell {...defaultProps} slug="test" title={undefined} isError={true} />);
    expect(screen.getByText('Failed to load Item details.')).toBeInTheDocument();
  });

  it('renders error message when data loaded but title is missing', () => {
    render(<DetailPanelShell {...defaultProps} slug="test" title={undefined} isPending={false} isError={false} />);
    expect(screen.getByText('Failed to load Item details.')).toBeInTheDocument();
  });

  it('renders title and children when data is available', () => {
    render(<DetailPanelShell {...defaultProps} slug="test" title="Optimus Prime" />);
    expect(screen.getByText('Optimus Prime')).toBeInTheDocument();
    expect(screen.getByText('Detail content')).toBeInTheDocument();
    expect(screen.getByRole('complementary')).toHaveAttribute('aria-label', 'Item detail: Optimus Prime');
  });

  it('renders close button that calls onClose', async () => {
    const onClose = vi.fn();
    render(<DetailPanelShell {...defaultProps} slug="test" title="Optimus Prime" onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close detail panel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders optional actions slot', () => {
    render(<DetailPanelShell {...defaultProps} slug="test" title="Optimus Prime" actions={<button>Share</button>} />);
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });

  it('Escape key calls onClose when slug is present', () => {
    const onClose = vi.fn();
    render(<DetailPanelShell {...defaultProps} slug="test" title="Optimus Prime" onClose={onClose} />);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Escape key does NOT call onClose when event.defaultPrevented', () => {
    const onClose = vi.fn();
    render(<DetailPanelShell {...defaultProps} slug="test" title="Optimus Prime" onClose={onClose} />);
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    event.preventDefault();
    document.dispatchEvent(event);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not add Escape listener when slug is undefined', () => {
    const onClose = vi.fn();
    render(<DetailPanelShell {...defaultProps} slug={undefined} title={undefined} onClose={onClose} />);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
