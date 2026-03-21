import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CharacterDetailPanel } from '../CharacterDetailPanel';
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

describe('CharacterDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty-state message when characterSlug is undefined', () => {
    mockUseCharacterDetail.mockReturnValue({ data: undefined, isPending: false, isError: false });
    render(<CharacterDetailPanel franchise="transformers" characterSlug={undefined} onClose={vi.fn()} />);
    expect(screen.getByText('Select a result to view details')).toBeInTheDocument();
  });

  it('renders loading skeleton when isPending', () => {
    mockUseCharacterDetail.mockReturnValue({ data: undefined, isPending: true, isError: false });
    render(<CharacterDetailPanel franchise="transformers" characterSlug="optimus-prime" onClose={vi.fn()} />);
    expect(screen.getByText('Loading Character details...')).toBeInTheDocument();
  });

  it('renders error state when isError', () => {
    mockUseCharacterDetail.mockReturnValue({ data: undefined, isPending: false, isError: true });
    render(<CharacterDetailPanel franchise="transformers" characterSlug="optimus-prime" onClose={vi.fn()} />);
    expect(screen.getByText('Failed to load Character details.')).toBeInTheDocument();
  });

  it('renders character name in panel title when data loads', () => {
    mockUseCharacterDetail.mockReturnValue({ data: mockCharacterDetail, isPending: false, isError: false });
    render(<CharacterDetailPanel franchise="transformers" characterSlug="optimus-prime" onClose={vi.fn()} />);
    expect(screen.getByText('Optimus Prime')).toBeInTheDocument();
  });

  it('renders "View full profile" link when data available', () => {
    mockUseCharacterDetail.mockReturnValue({ data: mockCharacterDetail, isPending: false, isError: false });
    render(<CharacterDetailPanel franchise="transformers" characterSlug="optimus-prime" onClose={vi.fn()} />);
    const link = screen.getByText(/View full profile/);
    expect(link.closest('a')).toHaveAttribute('href', '/catalog/$franchise/characters/$slug');
  });

  it('close button calls onClose', async () => {
    const onClose = vi.fn();
    mockUseCharacterDetail.mockReturnValue({ data: mockCharacterDetail, isPending: false, isError: false });
    render(<CharacterDetailPanel franchise="transformers" characterSlug="optimus-prime" onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close detail panel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
