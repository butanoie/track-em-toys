import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetailSheet } from '../DetailSheet';

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  entityType: 'Item',
  title: 'Optimus Prime',
  isPending: false,
  isError: false,
  children: <p>Detail content</p>,
};

describe('DetailSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when open is false', () => {
    render(<DetailSheet {...defaultProps} open={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders dialog with aria-label when open', () => {
    render(<DetailSheet {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-label', 'Item detail');
  });

  it('renders title when data is loaded', () => {
    render(<DetailSheet {...defaultProps} />);
    expect(screen.getByText('Optimus Prime')).toBeInTheDocument();
  });

  it('renders children content', () => {
    render(<DetailSheet {...defaultProps} />);
    expect(screen.getByText('Detail content')).toBeInTheDocument();
  });

  it('renders loading skeleton when isPending', () => {
    render(<DetailSheet {...defaultProps} isPending={true} title={undefined} />);
    expect(screen.getByText('Loading Item details...')).toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it('renders error message when isError', () => {
    render(<DetailSheet {...defaultProps} isError={true} isPending={false} />);
    expect(screen.getByText('Failed to load Item details.')).toBeInTheDocument();
  });

  it('does not render children when isPending', () => {
    render(<DetailSheet {...defaultProps} isPending={true} />);
    expect(screen.queryByText('Detail content')).not.toBeInTheDocument();
  });

  it('does not render children when isError', () => {
    render(<DetailSheet {...defaultProps} isError={true} />);
    expect(screen.queryByText('Detail content')).not.toBeInTheDocument();
  });

  it('close button calls onOpenChange with false', async () => {
    const onOpenChange = vi.fn();
    render(<DetailSheet {...defaultProps} onOpenChange={onOpenChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close detail sheet' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders actions slot in header', () => {
    render(<DetailSheet {...defaultProps} actions={<button>Share</button>} />);
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });
});
