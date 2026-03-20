import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FranchiseTileGrid } from '../FranchiseTileGrid';
import { mockFranchise } from '@/catalog/__tests__/catalog-test-helpers';
import type { FranchiseStatsItem } from '@/lib/zod-schemas';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const mockFranchises: FranchiseStatsItem[] = [
  mockFranchise,
  {
    slug: 'gi-joe',
    name: 'G.I. Joe',
    sort_order: 2,
    notes: null,
    item_count: 1,
    continuity_family_count: 1,
    manufacturer_count: 1,
  },
];

describe('FranchiseTileGrid', () => {
  it('renders a list item per franchise', () => {
    render(<FranchiseTileGrid franchises={mockFranchises} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
  });

  it('links to /catalog/:franchise', () => {
    render(<FranchiseTileGrid franchises={mockFranchises} />);
    expect(screen.getByText('Transformers').closest('a')).toHaveAttribute('href', '/catalog/$franchise');
  });

  it('shows plural "items" for count > 1', () => {
    render(<FranchiseTileGrid franchises={mockFranchises} />);
    expect(screen.getByText('42 items')).toBeInTheDocument();
  });

  it('shows singular "item" for count of 1', () => {
    render(<FranchiseTileGrid franchises={mockFranchises} />);
    expect(screen.getByText('1 item')).toBeInTheDocument();
  });

  it('renders first letter of name as avatar', () => {
    render(<FranchiseTileGrid franchises={mockFranchises} />);
    expect(screen.getByText('T')).toBeInTheDocument();
    expect(screen.getByText('G')).toBeInTheDocument();
  });

  it('renders empty list when no franchises', () => {
    render(<FranchiseTileGrid franchises={[]} />);
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
