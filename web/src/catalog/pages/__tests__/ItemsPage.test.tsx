import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ItemsPage } from '../ItemsPage';
import {
  mockFranchiseDetail,
  mockCatalogItem,
  mockItemFacets,
  createCatalogTestWrapper,
} from '@/catalog/__tests__/catalog-test-helpers';
import { ApiError } from '@/lib/api-client';

vi.mock('@/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-1', role: 'user' }, isAuthenticated: true, isLoading: false }),
}));

vi.mock('@/catalog/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/catalog/api')>();
  return {
    ...actual,
    exportForMl: vi
      .fn()
      .mockResolvedValue({ stats: { total_photos: 0, items: 0 }, filename: 'test.json', warnings: [] }),
  };
});

vi.mock('@/catalog/components/Pagination', () => ({
  Pagination: () => <nav data-testid="pagination" />,
}));

vi.mock('@/components/PageSizeSelector', () => ({
  PageSizeSelector: () => <div data-testid="page-size-selector" />,
}));

vi.mock('@/components/AppHeader', () => ({
  AppHeader: () => <header data-testid="app-header" />,
}));

vi.mock('@/components/MainNav', () => ({
  MainNav: () => <nav data-testid="main-nav" />,
}));

const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => mockNavigate,
  useParams: () => ({ franchise: 'transformers' }),
}));

const mockSearch: Record<string, unknown> = {};
vi.mock('@/routes/_authenticated/catalog/$franchise/items/index', () => ({
  Route: { useSearch: () => mockSearch },
}));

const mockUseFranchiseDetail = vi.fn();
vi.mock('@/catalog/hooks/useFranchiseDetail', () => ({
  useFranchiseDetail: (...args: unknown[]) => mockUseFranchiseDetail(...args),
}));

const mockUseItems = vi.fn();
vi.mock('@/catalog/hooks/useItems', () => ({
  useItems: (...args: unknown[]) => mockUseItems(...args),
}));

const mockUseItemFacets = vi.fn();
vi.mock('@/catalog/hooks/useItemFacets', () => ({
  useItemFacets: (...args: unknown[]) => mockUseItemFacets(...args),
}));

vi.mock('@/catalog/components/ItemDetailSheet', () => ({
  ItemDetailSheet: () => null,
}));

function setupDefaults() {
  mockUseFranchiseDetail.mockReturnValue({ data: mockFranchiseDetail, error: null });
  mockUseItems.mockReturnValue({
    data: { data: [mockCatalogItem], page: 1, limit: 20, total_count: 1 },
    isPending: false,
  });
  mockUseItemFacets.mockReturnValue({ data: mockItemFacets });
}

describe('ItemsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockResolvedValue(undefined);
    for (const key of Object.keys(mockSearch)) {
      delete mockSearch[key];
    }
  });

  it('renders breadcrumb', () => {
    setupDefaults();
    render(<ItemsPage />, { wrapper: createCatalogTestWrapper() });
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByText('Catalog').closest('a')).toHaveAttribute('href', '/catalog');
  });

  it('renders loading spinner while items pending', () => {
    mockUseFranchiseDetail.mockReturnValue({ data: mockFranchiseDetail, error: null });
    mockUseItems.mockReturnValue({ data: undefined, isPending: true });
    mockUseItemFacets.mockReturnValue({ data: undefined });
    render(<ItemsPage />, { wrapper: createCatalogTestWrapper() });
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('renders ItemList with item data', () => {
    setupDefaults();
    render(<ItemsPage />, { wrapper: createCatalogTestWrapper() });
    expect(screen.getByText('Optimus Prime [G1-001]')).toBeInTheDocument();
    expect(screen.getByText('1 item')).toBeInTheDocument();
  });

  it('renders "Franchise not found" for 404 error', () => {
    mockUseFranchiseDetail.mockReturnValue({
      data: undefined,
      error: new ApiError(404, { error: 'Not found' }),
    });
    mockUseItems.mockReturnValue({ data: undefined, isPending: false });
    mockUseItemFacets.mockReturnValue({ data: undefined });
    render(<ItemsPage />, { wrapper: createCatalogTestWrapper() });
    expect(screen.getByRole('heading', { name: 'Franchise not found' })).toBeInTheDocument();
  });

  it('renders active filter chips when search has filters', () => {
    mockSearch.manufacturer = 'hasbro';
    setupDefaults();
    render(<ItemsPage />, { wrapper: createCatalogTestWrapper() });
    expect(screen.getByRole('button', { name: /Remove filter: manufacturer: hasbro/ })).toBeInTheDocument();
    expect(screen.getByText('Clear all')).toBeInTheDocument();
  });

  it('clicking a filter chip calls navigate to remove that filter', async () => {
    mockSearch.manufacturer = 'hasbro';
    setupDefaults();
    render(<ItemsPage />, { wrapper: createCatalogTestWrapper() });
    await userEvent.click(screen.getByRole('button', { name: /Remove filter: manufacturer: hasbro/ }));
    expect(mockNavigate).toHaveBeenCalled();
  });

  it('clicking "Clear all" navigates with empty search', async () => {
    mockSearch.manufacturer = 'hasbro';
    setupDefaults();
    render(<ItemsPage />, { wrapper: createCatalogTestWrapper() });
    await userEvent.click(screen.getByText('Clear all'));
    expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ search: {} }));
  });

  it('renders pagination controls', () => {
    mockUseFranchiseDetail.mockReturnValue({ data: mockFranchiseDetail, error: null });
    mockUseItems.mockReturnValue({
      data: { data: [mockCatalogItem], page: 1, limit: 20, total_count: 50 },
      isPending: false,
    });
    mockUseItemFacets.mockReturnValue({ data: mockItemFacets });
    render(<ItemsPage />, { wrapper: createCatalogTestWrapper() });
    expect(screen.getByTestId('page-size-selector')).toBeInTheDocument();
  });
});
