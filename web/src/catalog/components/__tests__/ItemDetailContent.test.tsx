import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ItemDetailContent } from '../ItemDetailContent';
import { mockCatalogItemDetail } from '@/catalog/__tests__/catalog-test-helpers';
import type { CatalogItemDetail } from '@/lib/zod-schemas';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

describe('ItemDetailContent', () => {
  it('renders character link', () => {
    render(<ItemDetailContent data={mockCatalogItemDetail} franchise="transformers" />);
    const link = screen.getByText('Optimus Prime').closest('a');
    expect(link).toHaveAttribute('href', '/catalog/$franchise/characters/$slug');
  });

  it('renders manufacturer link when present', () => {
    render(<ItemDetailContent data={mockCatalogItemDetail} franchise="transformers" />);
    const link = screen.getByText('Hasbro').closest('a');
    expect(link).toHaveAttribute('href', '/catalog/manufacturers/$slug');
  });

  it('omits manufacturer field when null', () => {
    const data: CatalogItemDetail = { ...mockCatalogItemDetail, manufacturer: null };
    render(<ItemDetailContent data={data} franchise="transformers" />);
    expect(screen.queryByText('Manufacturer')).not.toBeInTheDocument();
  });

  it('renders toy line link', () => {
    render(<ItemDetailContent data={mockCatalogItemDetail} franchise="transformers" />);
    const link = screen.getByText('Generation 1').closest('a');
    expect(link).toHaveAttribute('href', '/catalog/$franchise/items');
  });

  it('renders size_class field', () => {
    render(<ItemDetailContent data={mockCatalogItemDetail} franchise="transformers" />);
    expect(screen.getByText('Size Class')).toBeInTheDocument();
    expect(screen.getByText('Leader')).toBeInTheDocument();
  });

  it('renders year_released', () => {
    render(<ItemDetailContent data={mockCatalogItemDetail} franchise="transformers" />);
    expect(screen.getByText('1984')).toBeInTheDocument();
  });

  it('renders product_code', () => {
    render(<ItemDetailContent data={mockCatalogItemDetail} franchise="transformers" />);
    expect(screen.getByText('G1-001')).toBeInTheDocument();
  });

  it('renders appearance from primary character when present', () => {
    render(<ItemDetailContent data={mockCatalogItemDetail} franchise="transformers" />);
    expect(screen.getByText('Appearance')).toBeInTheDocument();
    expect(screen.getByText('G1 Cartoon')).toBeInTheDocument();
  });

  it('does not render appearance when characters array is empty', () => {
    const data: CatalogItemDetail = { ...mockCatalogItemDetail, characters: [] };
    render(<ItemDetailContent data={data} franchise="transformers" />);
    expect(screen.queryByText('Appearance')).not.toBeInTheDocument();
  });

  it('renders data_quality badge', () => {
    render(<ItemDetailContent data={mockCatalogItemDetail} franchise="transformers" />);
    expect(screen.getByText('verified')).toBeInTheDocument();
  });

  it('renders "Third Party" badge when is_third_party is true', () => {
    const data: CatalogItemDetail = { ...mockCatalogItemDetail, is_third_party: true };
    render(<ItemDetailContent data={data} franchise="transformers" />);
    expect(screen.getByText('Third Party')).toBeInTheDocument();
  });

  it('does not render "Third Party" badge when false', () => {
    render(<ItemDetailContent data={mockCatalogItemDetail} franchise="transformers" />);
    expect(screen.queryByText('Third Party')).not.toBeInTheDocument();
  });

  it('renders description when present', () => {
    render(<ItemDetailContent data={mockCatalogItemDetail} franchise="transformers" />);
    expect(screen.getByText('Leader of the Autobots')).toBeInTheDocument();
  });

  it('does not render description when null', () => {
    const data: CatalogItemDetail = { ...mockCatalogItemDetail, description: null };
    render(<ItemDetailContent data={data} franchise="transformers" />);
    expect(screen.queryByText('Description')).not.toBeInTheDocument();
  });
});
