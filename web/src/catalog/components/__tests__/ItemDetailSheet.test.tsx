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

vi.mock('@/collection/hooks/useCollectionCheck', () => ({
  useCollectionCheck: () => ({ data: undefined }),
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

  it('renders item name in sheet title when data loads', () => {
    mockUseItemDetail.mockReturnValue({ data: mockCatalogItemDetail, isPending: false, isError: false });
    render(<ItemDetailSheet franchise="transformers" itemSlug="optimus-prime" onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-label', 'Item detail');
    // Item name renders in the sheet (may appear multiple times if character shares the name)
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
});
