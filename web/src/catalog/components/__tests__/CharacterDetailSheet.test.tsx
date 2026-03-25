import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CharacterDetailSheet } from '../CharacterDetailSheet';
import { mockCharacterDetail } from '@/catalog/__tests__/catalog-test-helpers';

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

const mockUseCharacterDetail = vi.fn();
vi.mock('@/catalog/hooks/useCharacterDetail', () => ({
  useCharacterDetail: (...args: unknown[]) => mockUseCharacterDetail(...args),
}));

describe('CharacterDetailSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('renders no dialog when characterSlug is undefined', () => {
    mockUseCharacterDetail.mockReturnValue({ data: undefined, isPending: false, isError: false });
    render(<CharacterDetailSheet franchise="transformers" characterSlug={undefined} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders loading skeleton when isPending', () => {
    mockUseCharacterDetail.mockReturnValue({ data: undefined, isPending: true, isError: false });
    render(<CharacterDetailSheet franchise="transformers" characterSlug="optimus-prime" onClose={vi.fn()} />);
    expect(screen.getByText('Loading Character details...')).toBeInTheDocument();
  });

  it('renders error state when isError', () => {
    mockUseCharacterDetail.mockReturnValue({ data: undefined, isPending: false, isError: true });
    render(<CharacterDetailSheet franchise="transformers" characterSlug="optimus-prime" onClose={vi.fn()} />);
    expect(screen.getByText('Failed to load Character details.')).toBeInTheDocument();
  });

  it('renders character name in sheet title when data loads', () => {
    mockUseCharacterDetail.mockReturnValue({ data: mockCharacterDetail, isPending: false, isError: false });
    render(<CharacterDetailSheet franchise="transformers" characterSlug="optimus-prime" onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-label', 'Character detail');
    expect(screen.getByText('Optimus Prime')).toBeInTheDocument();
  });

  it('renders ShareLinkButton (Copy link)', () => {
    mockUseCharacterDetail.mockReturnValue({ data: mockCharacterDetail, isPending: false, isError: false });
    render(<CharacterDetailSheet franchise="transformers" characterSlug="optimus-prime" onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });
});
