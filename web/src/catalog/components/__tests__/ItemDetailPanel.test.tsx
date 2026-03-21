import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ItemDetailPanel } from '../ItemDetailPanel';
import { mockCatalogItemDetail } from '@/catalog/__tests__/catalog-test-helpers';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/catalog/components/ItemRelationships', () => ({
  ItemRelationships: () => null,
}));

const mockUseItemDetail = vi.fn();
vi.mock('@/catalog/hooks/useItemDetail', () => ({
  useItemDetail: (...args: unknown[]) => mockUseItemDetail(...args),
}));

describe('ItemDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty-state message when itemSlug is undefined', () => {
    mockUseItemDetail.mockReturnValue({ data: undefined, isPending: false, isError: false });
    render(<ItemDetailPanel franchise="transformers" itemSlug={undefined} onClose={vi.fn()} />);
    expect(screen.getByText('Select an item to view details')).toBeInTheDocument();
  });

  it('renders loading skeleton when isPending', () => {
    mockUseItemDetail.mockReturnValue({ data: undefined, isPending: true, isError: false });
    render(<ItemDetailPanel franchise="transformers" itemSlug="optimus-prime" onClose={vi.fn()} />);
    expect(screen.getByText('Loading Item details...')).toBeInTheDocument();
  });

  it('renders error state when isError', () => {
    mockUseItemDetail.mockReturnValue({ data: undefined, isPending: false, isError: true });
    render(<ItemDetailPanel franchise="transformers" itemSlug="optimus-prime" onClose={vi.fn()} />);
    expect(screen.getByText('Failed to load Item details.')).toBeInTheDocument();
  });

  it('renders item name in panel title when data loads', () => {
    mockUseItemDetail.mockReturnValue({ data: mockCatalogItemDetail, isPending: false, isError: false });
    render(<ItemDetailPanel franchise="transformers" itemSlug="optimus-prime" onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Optimus Prime' })).toBeInTheDocument();
  });

  it('renders "View full details" link when data is present', () => {
    mockUseItemDetail.mockReturnValue({ data: mockCatalogItemDetail, isPending: false, isError: false });
    render(<ItemDetailPanel franchise="transformers" itemSlug="optimus-prime" onClose={vi.fn()} />);
    const link = screen.getByText(/View full details/);
    expect(link.closest('a')).toHaveAttribute('href', '/catalog/$franchise/items/$slug');
  });

  it('close button calls onClose', async () => {
    const onClose = vi.fn();
    mockUseItemDetail.mockReturnValue({ data: mockCatalogItemDetail, isPending: false, isError: false });
    render(<ItemDetailPanel franchise="transformers" itemSlug="optimus-prime" onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close detail panel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
