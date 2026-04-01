import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/catalog/hooks/useItemDetail', () => ({
  useItemDetail: vi.fn().mockReturnValue({
    data: {
      id: 'item-uuid-1',
      name: 'Optimus Prime',
      slug: 'optimus-prime',
      franchise: { slug: 'transformers', name: 'Transformers' },
      manufacturer: { slug: 'fanstoys', name: 'FansToys' },
      toy_line: { slug: 'masterpiece', name: 'Masterpiece' },
      product_code: 'FT-01',
    },
    isPending: false,
  }),
}));

vi.mock('@/collection/hooks/useCollectionCheck', () => ({
  useCollectionCheck: vi.fn().mockReturnValue({
    data: { items: {} },
    isPending: false,
  }),
}));

vi.mock('@/collection/components/AddToCollectionDialog', () => ({
  AddToCollectionDialog: () => null,
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params }: { children: React.ReactNode; to: string; params?: Record<string, string> }) => {
    let href = to;
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        href = href.replace(`$${key}`, value);
      }
    }
    return <a href={href}>{children}</a>;
  },
}));

import { PredictionCard } from '../PredictionCard';
import type { Prediction } from '@/ml/types';
import type { CollectionMutations } from '@/collection/hooks/useCollectionMutations';

const mockMutations = {
  add: { mutate: vi.fn(), isPending: false },
  update: { mutate: vi.fn(), isPending: false },
  remove: { mutate: vi.fn(), isPending: false },
} as unknown as CollectionMutations;

const mockPrediction: Prediction = {
  label: 'transformers__optimus-prime',
  franchiseSlug: 'transformers',
  itemSlug: 'optimus-prime',
  confidence: 0.85,
};

describe('PredictionCard', () => {
  it('renders prediction with name and confidence', () => {
    render(<PredictionCard prediction={mockPrediction} mutations={mockMutations} />);

    expect(screen.getByText('Optimus Prime')).toBeInTheDocument();
    expect(screen.getByText('85.0%')).toBeInTheDocument();
  });

  it('renders item details line', () => {
    render(<PredictionCard prediction={mockPrediction} mutations={mockMutations} />);

    expect(screen.getByText('Transformers, FansToys, Masterpiece')).toBeInTheDocument();
  });

  it('renders product code', () => {
    render(<PredictionCard prediction={mockPrediction} mutations={mockMutations} />);

    expect(screen.getByText('[FT-01]')).toBeInTheDocument();
  });

  it('renders Add button', () => {
    render(<PredictionCard prediction={mockPrediction} mutations={mockMutations} />);

    expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
  });

  it('links to catalog item page', () => {
    render(<PredictionCard prediction={mockPrediction} mutations={mockMutations} />);

    const link = screen.getByRole('link', { name: 'Optimus Prime' });
    expect(link).toHaveAttribute('href', '/catalog/transformers/items/optimus-prime');
  });
});
