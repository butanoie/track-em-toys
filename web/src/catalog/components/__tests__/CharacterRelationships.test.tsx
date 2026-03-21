import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CharacterRelationships } from '../CharacterRelationships';
import {
  mockCharacterRelationships,
  mockComponentRelationships,
  mockGestaltRelationships,
} from '@/catalog/__tests__/catalog-test-helpers';
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

  describe('combiner sibling expansion', () => {
    function setupCombinerMock() {
      mockUseCharacterRelationships.mockImplementation((_franchise: string, slug: string | undefined) => {
        if (slug === 'scrapper') {
          return { data: { relationships: mockComponentRelationships } };
        }
        if (slug === 'devastator') {
          return { data: { relationships: mockGestaltRelationships } };
        }
        return { data: undefined };
      });
    }

    it('renders gestalt name as a clickable heading link', () => {
      setupCombinerMock();
      render(<CharacterRelationships franchise="transformers" characterSlug="scrapper" />);
      const link = screen.getByRole('link', { name: 'Devastator' });
      expect(link).toHaveAttribute('href', '/catalog/$franchise/characters/$slug');
    });

    it('lists all sibling components sorted alphabetically', () => {
      setupCombinerMock();
      render(<CharacterRelationships franchise="transformers" characterSlug="scrapper" />);
      // Filter to combiner items (exclude rival section items)
      const combinerSection = screen.getByText('Devastator').closest('section');
      expect(combinerSection).toBeTruthy();
      const combinerItems = within(combinerSection!).getAllByRole('listitem');
      const names = combinerItems.map((li) => li.textContent?.replace(/\(.*?\)/g, '').trim());
      expect(names).toEqual(['Bonecrusher', 'Hook', 'Long Haul', 'Mixmaster', 'Scavenger', 'Scrapper']);
    });

    it('renders current character with aria-current and distinct styling', () => {
      setupCombinerMock();
      render(<CharacterRelationships franchise="transformers" characterSlug="scrapper" />);
      const currentEl = screen.getByText('Scrapper');
      expect(currentEl).toHaveAttribute('aria-current', 'true');
      expect(currentEl.tagName).toBe('SPAN');
      expect(currentEl).toHaveClass('text-muted-foreground', 'font-medium');
    });

    it('renders current character role in parentheses', () => {
      setupCombinerMock();
      render(<CharacterRelationships franchise="transformers" characterSlug="scrapper" />);
      expect(screen.getByText('(right leg)')).toBeInTheDocument();
    });

    it('renders sibling characters as standard links', () => {
      setupCombinerMock();
      render(<CharacterRelationships franchise="transformers" characterSlug="scrapper" />);
      const hookLink = screen.getByText('Hook');
      expect(hookLink.closest('a')).toBeInTheDocument();
      expect(hookLink).not.toHaveAttribute('aria-current');
    });

    it('does not show "Combiner Components" heading when sibling expansion is active', () => {
      setupCombinerMock();
      render(<CharacterRelationships franchise="transformers" characterSlug="scrapper" />);
      expect(screen.queryByText('Combiner Components')).not.toBeInTheDocument();
    });

    it('preserves non-combiner relationship groups unchanged', () => {
      setupCombinerMock();
      render(<CharacterRelationships franchise="transformers" characterSlug="scrapper" />);
      expect(screen.getByText('Rivals')).toBeInTheDocument();
      expect(screen.getByText('Omega Supreme')).toBeInTheDocument();
    });

    it('falls back to gestalt entry while secondary fetch is loading', () => {
      mockUseCharacterRelationships.mockImplementation((_franchise: string, slug: string | undefined) => {
        if (slug === 'scrapper') {
          return { data: { relationships: mockComponentRelationships } };
        }
        // Secondary fetch not yet resolved
        return { data: undefined };
      });
      render(<CharacterRelationships franchise="transformers" characterSlug="scrapper" />);
      // Heading link + list item link both render "Devastator"
      const devastatorEls = screen.getAllByText('Devastator');
      expect(devastatorEls).toHaveLength(2);
      // Find the combiner section via the heading
      const combinerSection = devastatorEls[0].closest('section');
      expect(combinerSection).toBeTruthy();
      const items = within(combinerSection!).getAllByRole('listitem');
      expect(items).toHaveLength(1);
      expect(screen.getByText('(gestalt)')).toBeInTheDocument();
    });

    it('fires secondary fetch with gestalt slug', () => {
      setupCombinerMock();
      render(<CharacterRelationships franchise="transformers" characterSlug="scrapper" />);
      expect(mockUseCharacterRelationships).toHaveBeenCalledWith('transformers', 'devastator');
    });

    it('does not trigger sibling expansion when viewing the gestalt itself', () => {
      // Devastator's relationships have role 'right leg' etc, not 'gestalt'
      mockUseCharacterRelationships.mockReturnValue({ data: { relationships: mockCharacterRelationships } });
      render(<CharacterRelationships franchise="transformers" characterSlug="devastator" />);
      expect(screen.getByText('Combiner Components')).toBeInTheDocument();
      // Should not have a link heading
      expect(screen.queryByRole('link', { name: 'Devastator' })).not.toBeInTheDocument();
    });
  });
});
