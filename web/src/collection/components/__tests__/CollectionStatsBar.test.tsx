import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CollectionStatsBar } from '../CollectionStatsBar';
import type { CollectionStats } from '@/lib/zod-schemas';

const mockStats: CollectionStats = {
  total_copies: 47,
  unique_items: 38,
  deleted_count: 0,
  by_franchise: [
    { slug: 'transformers', name: 'Transformers', count: 32 },
    { slug: 'gi-joe', name: 'G.I. Joe', count: 15 },
  ],
  by_toy_line: [],
  by_package_condition: [{ package_condition: 'mint_sealed', count: 10 }],
  by_item_condition: [],
};

describe('CollectionStatsBar', () => {
  it('renders skeleton when stats is undefined', () => {
    const { container } = render(
      <CollectionStatsBar stats={undefined} activeFranchise={undefined} onFranchiseClick={vi.fn()} />
    );
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders total copies and unique items', () => {
    render(<CollectionStatsBar stats={mockStats} activeFranchise={undefined} onFranchiseClick={vi.fn()} />);
    expect(screen.getByText('47')).toBeInTheDocument();
    expect(screen.getByText('38')).toBeInTheDocument();
  });

  it('renders franchise chips', () => {
    render(<CollectionStatsBar stats={mockStats} activeFranchise={undefined} onFranchiseClick={vi.fn()} />);
    expect(screen.getByText('Transformers')).toBeInTheDocument();
    expect(screen.getByText('G.I. Joe')).toBeInTheDocument();
  });

  it('calls onFranchiseClick when a chip is clicked', async () => {
    const onClick = vi.fn();
    render(<CollectionStatsBar stats={mockStats} activeFranchise={undefined} onFranchiseClick={onClick} />);
    await userEvent.click(screen.getByText('Transformers'));
    expect(onClick).toHaveBeenCalledWith('transformers');
  });

  it('marks active franchise chip with aria-pressed', () => {
    render(<CollectionStatsBar stats={mockStats} activeFranchise="transformers" onFranchiseClick={vi.fn()} />);
    expect(screen.getByText('Transformers').closest('button')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('G.I. Joe').closest('button')).toHaveAttribute('aria-pressed', 'false');
  });
});
