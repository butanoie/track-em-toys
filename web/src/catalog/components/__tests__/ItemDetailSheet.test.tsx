import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ItemDetailSheet } from '../ItemDetailSheet';
import { mockCatalogItemDetail, mockCharacterDetail } from '@/catalog/__tests__/catalog-test-helpers';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/catalog/components/ItemRelationships', () => ({
  ItemRelationships: () => null,
}));

vi.mock('@/catalog/components/CharacterRelationships', () => ({
  CharacterRelationships: () => null,
}));

const mockCollectionCheckData = vi.fn();
vi.mock('@/collection/hooks/useCollectionCheck', () => ({
  useCollectionCheck: () => ({ data: mockCollectionCheckData() }),
}));

vi.mock('@/collection/hooks/useCollectionMutations', () => ({
  useCollectionMutations: () => ({
    add: { mutate: vi.fn(), isPending: false },
    patch: { mutate: vi.fn(), isPending: false },
    remove: { mutate: vi.fn(), isPending: false },
    restore: { mutate: vi.fn(), isPending: false },
  }),
}));

vi.mock('@/collection/components/AddToCollectionButton', () => ({
  AddToCollectionButton: () => <button data-testid="add-to-collection">Add to Collection</button>,
}));

vi.mock('@/catalog/photos/PhotoManagementSheet', () => ({
  PhotoManagementSheet: () => null,
}));

const mockUseAuth = vi.fn();
vi.mock('@/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseItemDetail = vi.fn();
vi.mock('@/catalog/hooks/useItemDetail', () => ({
  useItemDetail: (...args: unknown[]) => mockUseItemDetail(...args),
}));

const mockUseCharacterDetail = vi.fn();
vi.mock('@/catalog/hooks/useCharacterDetail', () => ({
  useCharacterDetail: (...args: unknown[]) => mockUseCharacterDetail(...args),
}));

describe('ItemDetailSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    mockUseAuth.mockReturnValue({ user: { id: 'u-1', role: 'user' }, isAuthenticated: true, isLoading: false });
    mockUseCharacterDetail.mockReturnValue({ data: undefined, isPending: false, isError: false });
    mockCollectionCheckData.mockReturnValue(undefined);
  });

  it('renders no dialog when itemSlug is undefined', () => {
    mockUseItemDetail.mockReturnValue({ data: undefined, isPending: false, isError: false });
    render(<ItemDetailSheet franchise="transformers" itemSlug={undefined} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders loading skeleton when isPending', () => {
    mockUseItemDetail.mockReturnValue({ data: undefined, isPending: true, isError: false });
    render(<ItemDetailSheet franchise="transformers" itemSlug="optimus-prime" onClose={vi.fn()} />);
    expect(screen.getByText('Loading Item details...')).toBeInTheDocument();
  });

  it('renders error state when isError', () => {
    mockUseItemDetail.mockReturnValue({ data: undefined, isPending: false, isError: true });
    render(<ItemDetailSheet franchise="transformers" itemSlug="optimus-prime" onClose={vi.fn()} />);
    expect(screen.getByText('Failed to load Item details.')).toBeInTheDocument();
  });

  it('renders item name as title and character name as subtitle when data loads', () => {
    mockUseItemDetail.mockReturnValue({ data: mockCatalogItemDetail, isPending: false, isError: false });
    render(<ItemDetailSheet franchise="transformers" itemSlug="optimus-prime" onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-label', 'Item detail');
    expect(screen.getAllByText('Optimus Prime').length).toBeGreaterThanOrEqual(1);
  });

  it('renders AddToCollectionButton when data is present', () => {
    mockUseItemDetail.mockReturnValue({ data: mockCatalogItemDetail, isPending: false, isError: false });
    render(<ItemDetailSheet franchise="transformers" itemSlug="optimus-prime" onClose={vi.fn()} />);
    expect(screen.getByTestId('add-to-collection')).toBeInTheDocument();
  });

  it('renders character section when character data loads', () => {
    mockUseItemDetail.mockReturnValue({ data: mockCatalogItemDetail, isPending: false, isError: false });
    mockUseCharacterDetail.mockReturnValue({ data: mockCharacterDetail, isPending: false, isError: false });
    render(<ItemDetailSheet franchise="transformers" itemSlug="optimus-prime" onClose={vi.fn()} />);
    // Character name appears as a heading link
    const headings = screen.getAllByRole('heading');
    const characterHeading = headings.find((h) => h.textContent === 'Optimus Prime' && h.tagName === 'H3');
    expect(characterHeading).toBeDefined();
  });

  it('curator sees "Manage photos" button', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u-1', role: 'curator' }, isAuthenticated: true, isLoading: false });
    mockUseItemDetail.mockReturnValue({ data: mockCatalogItemDetail, isPending: false, isError: false });
    render(<ItemDetailSheet franchise="transformers" itemSlug="optimus-prime" onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Manage photos' })).toBeInTheDocument();
  });

  it('non-curator does not see "Manage photos" button', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u-1', role: 'user' }, isAuthenticated: true, isLoading: false });
    mockUseItemDetail.mockReturnValue({ data: mockCatalogItemDetail, isPending: false, isError: false });
    render(<ItemDetailSheet franchise="transformers" itemSlug="optimus-prime" onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Manage photos' })).not.toBeInTheDocument();
  });

  it('renders ShareLinkButton (Copy link)', () => {
    mockUseItemDetail.mockReturnValue({ data: mockCatalogItemDetail, isPending: false, isError: false });
    render(<ItemDetailSheet franchise="transformers" itemSlug="optimus-prime" onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });

  it('renders data_quality badge in header tags', () => {
    mockUseItemDetail.mockReturnValue({ data: mockCatalogItemDetail, isPending: false, isError: false });
    render(<ItemDetailSheet franchise="transformers" itemSlug="optimus-prime" onClose={vi.fn()} />);
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it('renders "Third Party" badge when is_third_party is true', () => {
    const data = { ...mockCatalogItemDetail, is_third_party: true };
    mockUseItemDetail.mockReturnValue({ data, isPending: false, isError: false });
    render(<ItemDetailSheet franchise="transformers" itemSlug="optimus-prime" onClose={vi.fn()} />);
    expect(screen.getByText('Third Party')).toBeInTheDocument();
  });

  it('does not render "Third Party" badge when false', () => {
    mockUseItemDetail.mockReturnValue({ data: mockCatalogItemDetail, isPending: false, isError: false });
    render(<ItemDetailSheet franchise="transformers" itemSlug="optimus-prime" onClose={vi.fn()} />);
    expect(screen.queryByText('Third Party')).not.toBeInTheDocument();
  });

  it('renders "In Collection" badge when item is in collection', () => {
    mockUseItemDetail.mockReturnValue({ data: mockCatalogItemDetail, isPending: false, isError: false });
    mockCollectionCheckData.mockReturnValue({
      items: { [mockCatalogItemDetail.id]: { count: 3, collection_ids: ['c-1', 'c-2', 'c-3'] } },
    });
    render(<ItemDetailSheet franchise="transformers" itemSlug="optimus-prime" onClose={vi.fn()} />);
    expect(screen.getByText('In Collection (3)')).toBeInTheDocument();
  });

  it('does not render "In Collection" badge when not in collection', () => {
    mockUseItemDetail.mockReturnValue({ data: mockCatalogItemDetail, isPending: false, isError: false });
    render(<ItemDetailSheet franchise="transformers" itemSlug="optimus-prime" onClose={vi.fn()} />);
    expect(screen.queryByText(/In Collection/)).not.toBeInTheDocument();
  });
});
