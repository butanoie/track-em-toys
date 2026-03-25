import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CollectionPage } from '../CollectionPage';
import type { CollectionStats, CollectionItemList } from '@/lib/zod-schemas';

vi.mock('@/components/AppHeader', () => ({
  AppHeader: () => <header data-testid="app-header" />,
}));

vi.mock('@/components/MainNav', () => ({
  MainNav: () => <nav data-testid="main-nav" />,
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));

vi.mock('@/routes/_authenticated/collection', () => ({
  Route: { useSearch: () => ({}) },
}));

vi.mock('@/catalog/components/Pagination', () => ({
  Pagination: (props: { page: number; totalCount: number; limit: number; ariaLabel?: string }) => (
    <nav data-testid="pagination" aria-label={props.ariaLabel ?? 'Pagination'}>
      Page {props.page} of {Math.ceil(props.totalCount / props.limit) || 1}
    </nav>
  ),
}));

vi.mock('@/components/PageSizeSelector', () => ({
  PageSizeSelector: (props: { value: number }) => (
    <div data-testid="page-size-selector">{props.value} / page</div>
  ),
}));

const mockStats: CollectionStats = {
  total_copies: 5,
  unique_items: 4,
  deleted_count: 0,
  by_franchise: [{ slug: 'transformers', name: 'Transformers', count: 5 }],
  by_condition: [{ condition: 'mint_sealed', count: 2 }],
};

const mockItemList: CollectionItemList = {
  data: [],
  page: 1,
  limit: 20,
  total_count: 0,
};

const mockUseCollectionItems = vi.fn();
vi.mock('@/collection/hooks/useCollectionItems', () => ({
  useCollectionItems: (...args: unknown[]) => mockUseCollectionItems(...args),
}));

const mockUseCollectionStats = vi.fn();
vi.mock('@/collection/hooks/useCollectionStats', () => ({
  useCollectionStats: (...args: unknown[]) => mockUseCollectionStats(...args),
}));

vi.mock('@/collection/hooks/useCollectionMutations', () => ({
  useCollectionMutations: () => ({
    add: { mutate: vi.fn(), isPending: false },
    patch: { mutate: vi.fn(), isPending: false },
    remove: { mutate: vi.fn(), isPending: false },
    restore: { mutate: vi.fn(), isPending: false },
  }),
}));

vi.mock('@/collection/components/CollectionStatsBar', () => ({
  CollectionStatsBar: () => <div data-testid="stats-bar" />,
}));

vi.mock('@/collection/components/CollectionFilters', () => ({
  CollectionFilters: () => <div data-testid="filters" />,
}));

vi.mock('@/collection/components/CollectionGrid', () => ({
  CollectionGrid: () => <div data-testid="grid" />,
}));

vi.mock('@/collection/components/CollectionTable', () => ({
  CollectionTable: () => <div data-testid="table" />,
}));

vi.mock('@/collection/hooks/useCollectionExport', () => ({
  useCollectionExport: () => ({ runExport: vi.fn(), isExporting: false }),
}));

vi.mock('@/collection/components/ExportImportToolbar', () => ({
  ExportImportToolbar: () => <div data-testid="export-import-toolbar" />,
}));

vi.mock('@/collection/components/EditCollectionItemDialog', () => ({
  EditCollectionItemDialog: () => null,
}));

vi.mock('@/collection/components/ImportCollectionDialog', () => ({
  ImportCollectionDialog: () => null,
}));

describe('CollectionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page heading', () => {
    mockUseCollectionItems.mockReturnValue({ data: mockItemList, isPending: false });
    mockUseCollectionStats.mockReturnValue({ data: mockStats });
    render(<CollectionPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'My Collection' })).toBeInTheDocument();
  });

  it('renders empty state when collection has no items and no filters', () => {
    mockUseCollectionItems.mockReturnValue({ data: mockItemList, isPending: false });
    mockUseCollectionStats.mockReturnValue({ data: { ...mockStats, total_copies: 0 } });
    render(<CollectionPage />);
    expect(screen.getByText('Your collection is empty')).toBeInTheDocument();
    expect(screen.getByText('Browse Catalog')).toBeInTheDocument();
  });

  it('renders import from file link in empty state', () => {
    mockUseCollectionItems.mockReturnValue({ data: mockItemList, isPending: false });
    mockUseCollectionStats.mockReturnValue({ data: { ...mockStats, total_copies: 0 } });
    render(<CollectionPage />);
    expect(screen.getByText('or Import from file')).toBeInTheDocument();
  });

  it('renders export/import toolbar when collection has items', () => {
    mockUseCollectionItems.mockReturnValue({
      data: { ...mockItemList, total_count: 5 },
      isPending: false,
    });
    mockUseCollectionStats.mockReturnValue({ data: mockStats });
    render(<CollectionPage />);
    expect(screen.getByTestId('export-import-toolbar')).toBeInTheDocument();
  });

  it('renders stats bar, filters, and grid when collection has items', () => {
    mockUseCollectionItems.mockReturnValue({
      data: { ...mockItemList, total_count: 5 },
      isPending: false,
    });
    mockUseCollectionStats.mockReturnValue({ data: mockStats });
    render(<CollectionPage />);
    expect(screen.getByTestId('stats-bar')).toBeInTheDocument();
    expect(screen.getByTestId('filters')).toBeInTheDocument();
    expect(screen.getByTestId('grid')).toBeInTheDocument();
  });

  it('renders page size selector when collection has items', () => {
    mockUseCollectionItems.mockReturnValue({
      data: { ...mockItemList, total_count: 5 },
      isPending: false,
    });
    mockUseCollectionStats.mockReturnValue({ data: mockStats });
    render(<CollectionPage />);
    expect(screen.getByTestId('page-size-selector')).toBeInTheDocument();
  });

  it('renders pagination when multiple pages exist', () => {
    mockUseCollectionItems.mockReturnValue({
      data: { ...mockItemList, total_count: 45 },
      isPending: false,
    });
    mockUseCollectionStats.mockReturnValue({ data: mockStats });
    render(<CollectionPage />);
    expect(screen.getByTestId('pagination')).toBeInTheDocument();
  });
});
