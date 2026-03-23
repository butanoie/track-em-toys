import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CollectionTable } from '../CollectionTable';
import type { CollectionItem } from '@/lib/zod-schemas';

vi.mock('@/catalog/photos/api', () => ({
  buildPhotoUrl: (url: string) => `http://photos/${url}`,
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const mockItem: CollectionItem = {
  id: 'c-1',
  item_id: 'i-1',
  item_name: 'Optimus Prime',
  item_slug: 'optimus-prime',
  franchise: { slug: 'transformers', name: 'Transformers' },
  manufacturer: { slug: 'hasbro', name: 'Hasbro' },
  toy_line: { slug: 'g1', name: 'Generation 1' },
  thumbnail_url: 'abc/thumb.webp',
  condition: 'mint_sealed',
  notes: 'Great condition box',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('CollectionTable', () => {
  it('renders skeleton rows when loading with no items', () => {
    const { container } = render(<CollectionTable items={[]} isLoading={true} onEdit={vi.fn()} />);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(6);
  });

  it('renders empty state when no items and not loading', () => {
    render(<CollectionTable items={[]} isLoading={false} onEdit={vi.fn()} />);
    expect(screen.getByText('No items match your filters.')).toBeInTheDocument();
  });

  it('renders table headers', () => {
    render(<CollectionTable items={[mockItem]} isLoading={false} onEdit={vi.fn()} />);
    expect(screen.getByText('Item')).toBeInTheDocument();
    expect(screen.getByText('Condition')).toBeInTheDocument();
    expect(screen.getByText('Added')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('renders item data in table row', () => {
    render(<CollectionTable items={[mockItem]} isLoading={false} onEdit={vi.fn()} />);
    expect(screen.getByText('Optimus Prime')).toBeInTheDocument();
    expect(screen.getByText('Transformers')).toBeInTheDocument();
    expect(screen.getByTitle('Mint Sealed')).toBeInTheDocument();
    expect(screen.getByText('Great condition box')).toBeInTheDocument();
  });

  it('calls onEdit when edit button is clicked', async () => {
    const onEdit = vi.fn();
    render(<CollectionTable items={[mockItem]} isLoading={false} onEdit={onEdit} />);
    await userEvent.click(screen.getByRole('button', { name: /Edit Optimus Prime/ }));
    expect(onEdit).toHaveBeenCalledWith(mockItem);
  });

  it('renders catalog link for each item', () => {
    render(<CollectionTable items={[mockItem]} isLoading={false} onEdit={vi.fn()} />);
    expect(screen.getByText('Catalog')).toBeInTheDocument();
  });
});
