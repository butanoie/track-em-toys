import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CollectionItemCard } from '../CollectionItemCard';
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
  notes: 'Found at a garage sale',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('CollectionItemCard', () => {
  it('renders item name and franchise info', () => {
    render(<CollectionItemCard item={mockItem} onEdit={vi.fn()} />);
    expect(screen.getByText('Optimus Prime')).toBeInTheDocument();
    expect(screen.getByText(/Transformers/)).toBeInTheDocument();
    expect(screen.getByText(/Generation 1/)).toBeInTheDocument();
  });

  it('renders condition badge', () => {
    render(<CollectionItemCard item={mockItem} onEdit={vi.fn()} />);
    expect(screen.getByTitle('Mint Sealed')).toBeInTheDocument();
  });

  it('renders thumbnail image', () => {
    render(<CollectionItemCard item={mockItem} onEdit={vi.fn()} />);
    const img = document.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', 'http://photos/abc/thumb.webp');
  });

  it('renders notes preview', () => {
    render(<CollectionItemCard item={mockItem} onEdit={vi.fn()} />);
    expect(screen.getByText(/Found at a garage sale/)).toBeInTheDocument();
  });

  it('renders "View in catalog" link', () => {
    render(<CollectionItemCard item={mockItem} onEdit={vi.fn()} />);
    expect(screen.getByText('View in catalog')).toBeInTheDocument();
  });

  it('calls onEdit when edit button is clicked', async () => {
    const onEdit = vi.fn();
    render(<CollectionItemCard item={mockItem} onEdit={onEdit} />);
    await userEvent.click(screen.getByRole('button', { name: /Edit Optimus Prime/ }));
    expect(onEdit).toHaveBeenCalledWith(mockItem);
  });

  it('renders placeholder when no thumbnail', () => {
    const itemNoThumb = { ...mockItem, thumbnail_url: null };
    render(<CollectionItemCard item={itemNoThumb} onEdit={vi.fn()} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
