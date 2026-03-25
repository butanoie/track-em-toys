import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FranchiseTable } from '../FranchiseTable';
import { mockFranchise } from '@/catalog/__tests__/catalog-test-helpers';
import type { FranchiseStatsItem } from '@/lib/zod-schemas';

const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

const mockFranchises: FranchiseStatsItem[] = [
  { ...mockFranchise, notes: 'Classic franchise' },
  {
    slug: 'gi-joe',
    name: 'G.I. Joe',
    sort_order: 2,
    notes: null,
    item_count: 10,
    continuity_family_count: 1,
    manufacturer_count: 1,
  },
];

describe('FranchiseTable', () => {
  it('renders table headers', () => {
    render(<FranchiseTable franchises={mockFranchises} />);
    expect(screen.getByText('Franchise')).toBeInTheDocument();
    expect(screen.getByText('Items')).toBeInTheDocument();
    expect(screen.getByText('Continuities')).toBeInTheDocument();
    expect(screen.getByText('Manufacturers')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
  });

  it('renders franchise name and navigates on row click', () => {
    render(<FranchiseTable franchises={mockFranchises} />);
    expect(screen.getByText('Transformers')).toBeInTheDocument();
    screen.getByText('Transformers').closest('tr')!.click();
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/catalog/$franchise', params: { franchise: 'transformers' } });
  });

  it('renders count columns', () => {
    render(<FranchiseTable franchises={mockFranchises} />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders notes text when present', () => {
    render(<FranchiseTable franchises={mockFranchises} />);
    expect(screen.getByText('Classic franchise')).toBeInTheDocument();
  });

  it('renders "—" for null notes', () => {
    render(<FranchiseTable franchises={mockFranchises} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
