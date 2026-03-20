import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CharacterList } from '../CharacterList';
import type { CharacterListItem } from '@/lib/zod-schemas';

const mockCharacters: CharacterListItem[] = [
  {
    id: 'c-1',
    name: 'Optimus Prime',
    slug: 'optimus-prime',
    franchise: { slug: 'transformers', name: 'Transformers' },
    faction: { slug: 'autobot', name: 'Autobot' },
    continuity_family: { slug: 'g1', name: 'Generation 1' },
    character_type: 'Transformer',
    alt_mode: 'semi-truck',
    is_combined_form: false,
  },
  {
    id: 'c-2',
    name: 'Megatron',
    slug: 'megatron',
    franchise: { slug: 'transformers', name: 'Transformers' },
    faction: { slug: 'decepticon', name: 'Decepticon' },
    continuity_family: { slug: 'g1', name: 'Generation 1' },
    character_type: 'Transformer',
    alt_mode: 'Walther P38',
    is_combined_form: false,
  },
];

describe('CharacterList', () => {
  it('renders empty state when no characters match', () => {
    render(<CharacterList characters={[]} selectedSlug={undefined} onSelect={vi.fn()} totalCount={0} />);
    expect(screen.getByText('No characters match your filters.')).toBeInTheDocument();
    expect(screen.getByText('0 characters')).toBeInTheDocument();
  });

  it('renders character rows with name, faction, and character_type', () => {
    render(<CharacterList characters={mockCharacters} selectedSlug={undefined} onSelect={vi.fn()} totalCount={2} />);
    expect(screen.getByText('2 characters')).toBeInTheDocument();
    expect(screen.getByText('Optimus Prime')).toBeInTheDocument();
    expect(screen.getByText('Megatron')).toBeInTheDocument();
    expect(screen.getByText('semi-truck')).toBeInTheDocument();
    expect(screen.getByText('Walther P38')).toBeInTheDocument();
  });

  it('shows "No faction" for characters without a faction', () => {
    const noFaction: CharacterListItem[] = [
      {
        ...mockCharacters[0],
        faction: null,
      },
    ];
    render(<CharacterList characters={noFaction} selectedSlug={undefined} onSelect={vi.fn()} totalCount={1} />);
    expect(screen.getByText(/No faction/)).toBeInTheDocument();
  });

  it('calls onSelect when a character is clicked', async () => {
    const onSelect = vi.fn();
    render(<CharacterList characters={mockCharacters} selectedSlug={undefined} onSelect={onSelect} totalCount={2} />);
    await userEvent.click(screen.getByText('Megatron'));
    expect(onSelect).toHaveBeenCalledWith('megatron');
  });

  it('marks selected character with aria-selected', () => {
    render(
      <CharacterList characters={mockCharacters} selectedSlug="optimus-prime" onSelect={vi.fn()} totalCount={2} />
    );
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(options[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('handles keyboard navigation with ArrowDown', async () => {
    const onSelect = vi.fn();
    render(
      <CharacterList characters={mockCharacters} selectedSlug="optimus-prime" onSelect={onSelect} totalCount={2} />
    );
    const firstOption = screen.getAllByRole('option')[0];
    await userEvent.type(firstOption, '{ArrowDown}');
    expect(onSelect).toHaveBeenCalledWith('megatron');
  });

  it('handles Escape to deselect', async () => {
    const onSelect = vi.fn();
    render(
      <CharacterList characters={mockCharacters} selectedSlug="optimus-prime" onSelect={onSelect} totalCount={2} />
    );
    const firstOption = screen.getAllByRole('option')[0];
    await userEvent.type(firstOption, '{Escape}');
    expect(onSelect).toHaveBeenCalledWith(undefined);
  });

  it('renders pagination controls when provided', () => {
    render(
      <CharacterList
        characters={mockCharacters}
        selectedSlug={undefined}
        onSelect={vi.fn()}
        totalCount={50}
        paginationControls={<button>Next</button>}
      />
    );
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });

  it('uses singular "character" for count of 1', () => {
    render(
      <CharacterList characters={[mockCharacters[0]]} selectedSlug={undefined} onSelect={vi.fn()} totalCount={1} />
    );
    expect(screen.getByText('1 character')).toBeInTheDocument();
  });
});
