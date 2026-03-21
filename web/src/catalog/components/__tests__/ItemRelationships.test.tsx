import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ItemRelationships } from '../ItemRelationships';
import { mockItemRelationships } from '@/catalog/__tests__/catalog-test-helpers';
import type { ItemRelationship } from '@/lib/zod-schemas';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const mockUseItemRelationships = vi.fn();
vi.mock('@/catalog/hooks/useItemRelationships', () => ({
  useItemRelationships: (...args: unknown[]) => mockUseItemRelationships(...args),
}));

describe('ItemRelationships', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when hook returns no data', () => {
    mockUseItemRelationships.mockReturnValue({ data: undefined });
    const { container } = render(<ItemRelationships franchise="transformers" itemSlug="optimus-prime" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when relationships array is empty', () => {
    mockUseItemRelationships.mockReturnValue({ data: { relationships: [] } });
    const { container } = render(<ItemRelationships franchise="transformers" itemSlug="optimus-prime" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders grouped headings for different relationship types', () => {
    mockUseItemRelationships.mockReturnValue({ data: { relationships: mockItemRelationships } });
    render(<ItemRelationships franchise="transformers" itemSlug="ft-03-quake-wave" />);
    expect(screen.getByText('Variants')).toBeInTheDocument();
    expect(screen.getByText('Mold Origin')).toBeInTheDocument();
  });

  it('renders item names as links', () => {
    mockUseItemRelationships.mockReturnValue({ data: { relationships: mockItemRelationships } });
    render(<ItemRelationships franchise="transformers" itemSlug="ft-03-quake-wave" />);
    expect(screen.getByText('Red Optimus Prime').closest('a')).toBeInTheDocument();
    expect(screen.getByText('Optimus Prime (1984)').closest('a')).toBeInTheDocument();
  });

  it('always shows roles for item relationships (no symmetric types)', () => {
    mockUseItemRelationships.mockReturnValue({ data: { relationships: mockItemRelationships } });
    render(<ItemRelationships franchise="transformers" itemSlug="ft-03-quake-wave" />);
    expect(screen.getByText('(variant)')).toBeInTheDocument();
    expect(screen.getByText('(original)')).toBeInTheDocument();
  });

  it('renders per-item subtype badge when present', () => {
    const rels: ItemRelationship[] = [
      {
        type: 'variant',
        subtype: 'chase_figure',
        role: 'variant',
        related_item: { slug: 'chase-op', name: 'Chase Optimus' },
        metadata: {},
      },
      {
        type: 'variant',
        subtype: 'convention_exclusive',
        role: 'variant',
        related_item: { slug: 'sdcc-op', name: 'SDCC Optimus' },
        metadata: {},
      },
    ];
    mockUseItemRelationships.mockReturnValue({ data: { relationships: rels } });
    render(<ItemRelationships franchise="transformers" itemSlug="optimus-prime" />);
    expect(screen.getByText('chase_figure')).toBeInTheDocument();
    expect(screen.getByText('convention_exclusive')).toBeInTheDocument();
  });

  it('passes franchise and slug to the hook', () => {
    mockUseItemRelationships.mockReturnValue({ data: undefined });
    render(<ItemRelationships franchise="transformers" itemSlug="mp-44" />);
    expect(mockUseItemRelationships).toHaveBeenCalledWith('transformers', 'mp-44');
  });
});
