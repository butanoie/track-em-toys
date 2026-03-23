import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CollectionGrid } from '../CollectionGrid';
import type { CollectionItem } from '@/lib/zod-schemas';

vi.mock('../CollectionItemCard', () => ({
  CollectionItemCard: ({ item }: { item: CollectionItem }) => <div data-testid="card">{item.item_name}</div>,
}));

const mockItem: CollectionItem = {
  id: 'c-1',
  item_id: 'i-1',
  item_name: 'Optimus Prime',
  item_slug: 'optimus-prime',
  franchise: { slug: 'transformers', name: 'Transformers' },
  manufacturer: null,
  toy_line: { slug: 'g1', name: 'Generation 1' },
  thumbnail_url: null,
  condition: 'mint_sealed',
  notes: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('CollectionGrid', () => {
  it('renders skeleton cards when loading with no items', () => {
    const { container } = render(<CollectionGrid items={[]} isLoading={true} onEdit={vi.fn()} />);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(6);
  });

  it('renders empty state when no items and not loading', () => {
    render(<CollectionGrid items={[]} isLoading={false} onEdit={vi.fn()} />);
    expect(screen.getByText('No items match your filters.')).toBeInTheDocument();
  });

  it('renders item cards', () => {
    render(<CollectionGrid items={[mockItem]} isLoading={false} onEdit={vi.fn()} />);
    expect(screen.getByText('Optimus Prime')).toBeInTheDocument();
  });
});
