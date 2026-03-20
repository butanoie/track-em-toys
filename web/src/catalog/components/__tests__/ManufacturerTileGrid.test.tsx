import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ManufacturerTileGrid } from '../ManufacturerTileGrid';
import { mockManufacturer } from '@/catalog/__tests__/catalog-test-helpers';
import type { ManufacturerStatsItem } from '@/lib/zod-schemas';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const mockManufacturers: ManufacturerStatsItem[] = [
  mockManufacturer,
  {
    slug: 'takara',
    name: 'Takara Tomy',
    is_official_licensee: true,
    country: 'JP',
    item_count: 1,
    toy_line_count: 2,
    franchise_count: 1,
  },
];

describe('ManufacturerTileGrid', () => {
  it('renders a list item per manufacturer', () => {
    render(<ManufacturerTileGrid manufacturers={mockManufacturers} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('links to /catalog/manufacturers/:slug', () => {
    render(<ManufacturerTileGrid manufacturers={mockManufacturers} />);
    expect(screen.getByText('Hasbro').closest('a')).toHaveAttribute('href', '/catalog/manufacturers/$slug');
  });

  it('shows plural "items" for count > 1', () => {
    render(<ManufacturerTileGrid manufacturers={mockManufacturers} />);
    expect(screen.getByText('100 items')).toBeInTheDocument();
  });

  it('shows singular "item" for count of 1', () => {
    render(<ManufacturerTileGrid manufacturers={mockManufacturers} />);
    expect(screen.getByText('1 item')).toBeInTheDocument();
  });

  it('renders first letter of name as avatar', () => {
    render(<ManufacturerTileGrid manufacturers={mockManufacturers} />);
    expect(screen.getByText('H')).toBeInTheDocument();
    expect(screen.getByText('T')).toBeInTheDocument();
  });
});
