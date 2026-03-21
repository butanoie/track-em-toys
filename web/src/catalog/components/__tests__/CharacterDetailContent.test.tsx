import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CharacterDetailContent } from '../CharacterDetailContent';
import { mockCharacterDetail, mockCatalogItem } from '@/catalog/__tests__/catalog-test-helpers';
import type { CharacterDetail } from '@/lib/zod-schemas';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/catalog/components/CharacterRelationships', () => ({
  CharacterRelationships: () => null,
}));

describe('CharacterDetailContent', () => {
  it('renders franchise, continuity, character_type, and alt_mode fields', () => {
    render(<CharacterDetailContent data={mockCharacterDetail} />);
    expect(screen.getByText('Transformers')).toBeInTheDocument();
    expect(screen.getByText('Generation 1')).toBeInTheDocument();
    expect(screen.getByText('Transformer')).toBeInTheDocument();
    expect(screen.getByText('Semi-truck')).toBeInTheDocument();
  });

  it('renders faction when present', () => {
    render(<CharacterDetailContent data={mockCharacterDetail} />);
    expect(screen.getByText('Autobot')).toBeInTheDocument();
  });

  it('omits faction when null', () => {
    const data: CharacterDetail = { ...mockCharacterDetail, faction: null };
    render(<CharacterDetailContent data={data} />);
    expect(screen.queryByText('Faction')).not.toBeInTheDocument();
  });

  it('renders "Combined Form" badge when is_combined_form is true', () => {
    const data: CharacterDetail = { ...mockCharacterDetail, is_combined_form: true };
    render(<CharacterDetailContent data={data} />);
    expect(screen.getByText('Combined Form')).toBeInTheDocument();
  });

  it('does not render "Combined Form" badge when false', () => {
    render(<CharacterDetailContent data={mockCharacterDetail} />);
    expect(screen.queryByText('Combined Form')).not.toBeInTheDocument();
  });

  it('renders sub_groups when present', () => {
    const data: CharacterDetail = {
      ...mockCharacterDetail,
      sub_groups: [{ slug: 'dinobots', name: 'Dinobots' }],
    };
    render(<CharacterDetailContent data={data} />);
    expect(screen.getByText('Sub-Groups')).toBeInTheDocument();
    expect(screen.getByText('Dinobots')).toBeInTheDocument();
  });

  it('does not render sub_groups section when empty', () => {
    render(<CharacterDetailContent data={mockCharacterDetail} />);
    expect(screen.queryByText('Sub-Groups')).not.toBeInTheDocument();
  });

  it('renders Appearances section always', () => {
    render(<CharacterDetailContent data={mockCharacterDetail} />);
    expect(screen.getByText('Appearances')).toBeInTheDocument();
    expect(screen.getByText('The Transformers Season 1')).toBeInTheDocument();
  });

  it('renders relatedItems when provided', () => {
    render(
      <CharacterDetailContent data={mockCharacterDetail} relatedItems={[mockCatalogItem]} relatedItemsCount={1} />
    );
    expect(screen.getByText('Related Items')).toBeInTheDocument();
    expect(screen.getByText('Optimus Prime')).toBeInTheDocument();
  });

  it('renders "Browse all N items" when count exceeds displayed', () => {
    render(
      <CharacterDetailContent data={mockCharacterDetail} relatedItems={[mockCatalogItem]} relatedItemsCount={10} />
    );
    expect(screen.getByText(/Browse all 10 items/)).toBeInTheDocument();
  });

  it('omits related items section when relatedItems is undefined', () => {
    render(<CharacterDetailContent data={mockCharacterDetail} />);
    expect(screen.queryByText('Related Items')).not.toBeInTheDocument();
  });
});
