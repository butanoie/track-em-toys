import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CharacterRelationships } from '../CharacterRelationships';
import { mockCharacterRelationships } from '@/catalog/__tests__/catalog-test-helpers';
import type { CharacterRelationship } from '@/lib/zod-schemas';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const mockUseCharacterRelationships = vi.fn();
vi.mock('@/catalog/hooks/useCharacterRelationships', () => ({
  useCharacterRelationships: (...args: unknown[]) => mockUseCharacterRelationships(...args),
}));

describe('CharacterRelationships', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when hook returns no data', () => {
    mockUseCharacterRelationships.mockReturnValue({ data: undefined });
    const { container } = render(<CharacterRelationships franchise="transformers" characterSlug="optimus-prime" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when relationships array is empty', () => {
    mockUseCharacterRelationships.mockReturnValue({ data: { relationships: [] } });
    const { container } = render(<CharacterRelationships franchise="transformers" characterSlug="optimus-prime" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders grouped headings for different relationship types', () => {
    mockUseCharacterRelationships.mockReturnValue({ data: { relationships: mockCharacterRelationships } });
    render(<CharacterRelationships franchise="transformers" characterSlug="devastator" />);
    expect(screen.getByText('Combiner Components')).toBeInTheDocument();
    expect(screen.getByText('Rivals')).toBeInTheDocument();
  });

  it('renders character names as links', () => {
    mockUseCharacterRelationships.mockReturnValue({ data: { relationships: mockCharacterRelationships } });
    render(<CharacterRelationships franchise="transformers" characterSlug="devastator" />);
    expect(screen.getByText('Scrapper').closest('a')).toBeInTheDocument();
    expect(screen.getByText('Hook').closest('a')).toBeInTheDocument();
  });

  it('shows role for non-symmetric types', () => {
    mockUseCharacterRelationships.mockReturnValue({ data: { relationships: mockCharacterRelationships } });
    render(<CharacterRelationships franchise="transformers" characterSlug="devastator" />);
    expect(screen.getByText('(right leg)')).toBeInTheDocument();
    expect(screen.getByText('(left shoulder)')).toBeInTheDocument();
  });

  it('omits role for symmetric types when role matches type', () => {
    mockUseCharacterRelationships.mockReturnValue({ data: { relationships: mockCharacterRelationships } });
    render(<CharacterRelationships franchise="transformers" characterSlug="devastator" />);
    // "rival" role under "rival" type should be omitted
    expect(screen.queryByText('(rival)')).not.toBeInTheDocument();
    // but the character name should still render
    expect(screen.getByText('Omega Supreme')).toBeInTheDocument();
  });

  it('shows role for symmetric type when role differs from type', () => {
    const rels: CharacterRelationship[] = [
      {
        type: 'sibling',
        subtype: 'twin',
        role: 'twin',
        related_character: { slug: 'sunstreaker', name: 'Sunstreaker' },
        metadata: {},
      },
    ];
    mockUseCharacterRelationships.mockReturnValue({ data: { relationships: rels } });
    render(<CharacterRelationships franchise="transformers" characterSlug="sideswipe" />);
    expect(screen.getByText('(twin)')).toBeInTheDocument();
  });

  it('renders uniform subtype as badge on heading', () => {
    const rels: CharacterRelationship[] = [
      {
        type: 'partner-bond',
        subtype: 'headmaster',
        role: 'head-partner',
        related_character: { slug: 'chromedome', name: 'Chromedome' },
        metadata: {},
      },
      {
        type: 'partner-bond',
        subtype: 'headmaster',
        role: 'head-partner',
        related_character: { slug: 'hardhead', name: 'Hardhead' },
        metadata: {},
      },
    ];
    mockUseCharacterRelationships.mockReturnValue({ data: { relationships: rels } });
    render(<CharacterRelationships franchise="transformers" characterSlug="fortress-maximus" />);
    // Single badge on the heading
    expect(screen.getByText('headmaster')).toBeInTheDocument();
  });

  it('renders per-item subtype badges when mixed', () => {
    const rels: CharacterRelationship[] = [
      {
        type: 'partner-bond',
        subtype: 'headmaster',
        role: 'head-partner',
        related_character: { slug: 'chromedome', name: 'Chromedome' },
        metadata: {},
      },
      {
        type: 'partner-bond',
        subtype: 'targetmaster',
        role: 'weapon-partner',
        related_character: { slug: 'pointblank', name: 'Pointblank' },
        metadata: {},
      },
    ];
    mockUseCharacterRelationships.mockReturnValue({ data: { relationships: rels } });
    render(<CharacterRelationships franchise="transformers" characterSlug="fortress-maximus" />);
    expect(screen.getByText('headmaster')).toBeInTheDocument();
    expect(screen.getByText('targetmaster')).toBeInTheDocument();
  });

  it('passes franchise and slug to the hook', () => {
    mockUseCharacterRelationships.mockReturnValue({ data: undefined });
    render(<CharacterRelationships franchise="gi-joe" characterSlug="snake-eyes" />);
    expect(mockUseCharacterRelationships).toHaveBeenCalledWith('gi-joe', 'snake-eyes');
  });
});
