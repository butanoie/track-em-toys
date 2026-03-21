import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ItemsPage } from '../ItemsPage';
import { mockFranchiseDetail, mockCatalogItem, mockItemFacets } from '@/catalog/__tests__/catalog-test-helpers';
import { ApiError } from '@/lib/api-client';

vi.mock('@/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-1', role: 'user' }, isAuthenticated: true, isLoading: false }),
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

const mockUseItemDetail = vi.fn();
vi.mock('@/catalog/hooks/useItemDetail', () => ({
  useItemDetail: (...args: unknown[]) => mockUseItemDetail(...args),
}));

function setupDefaults() {
  mockUseFranchiseDetail.mockReturnValue({ data: mockFranchiseDetail, error: null });
  mockUseItems.mockReturnValue({
    data: { data: [mockCatalogItem], next_cursor: null, total_count: 1 },
    isPending: false,
  });
  mockUseItemFacets.mockReturnValue({ data: mockItemFacets });
  mockUseItemDetail.mockReturnValue({ data: undefined, isPending: false, isError: false });
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
    render(<ItemsPage />);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByText('Catalog').closest('a')).toHaveAttribute('href', '/catalog');
  });

  it('renders loading spinner while items pending', () => {
    mockUseFranchiseDetail.mockReturnValue({ data: mockFranchiseDetail, error: null });
    mockUseItems.mockReturnValue({ data: undefined, isPending: true });
    mockUseItemFacets.mockReturnValue({ data: undefined });
    mockUseItemDetail.mockReturnValue({ data: undefined, isPending: false, isError: false });
    render(<ItemsPage />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('renders ItemList with item data', () => {
    setupDefaults();
    render(<ItemsPage />);
    expect(screen.getByText('Optimus Prime')).toBeInTheDocument();
    expect(screen.getByText('1 item')).toBeInTheDocument();
  });

  it('renders "Franchise not found" for 404 error', () => {
    mockUseFranchiseDetail.mockReturnValue({
      data: undefined,
      error: new ApiError(404, { error: 'Not found' }),
    });
    mockUseItems.mockReturnValue({ data: undefined, isPending: false });
    mockUseItemFacets.mockReturnValue({ data: undefined });
    mockUseItemDetail.mockReturnValue({ data: undefined, isPending: false, isError: false });
    render(<ItemsPage />);
    expect(screen.getByRole('heading', { name: 'Franchise not found' })).toBeInTheDocument();
  });

  it('renders active filter chips when search has filters', () => {
    mockSearch.manufacturer = 'hasbro';
    setupDefaults();
    render(<ItemsPage />);
    expect(screen.getByRole('button', { name: /Remove filter: manufacturer: hasbro/ })).toBeInTheDocument();
    expect(screen.getByText('Clear all')).toBeInTheDocument();
  });

  it('clicking a filter chip calls navigate to remove that filter', async () => {
    mockSearch.manufacturer = 'hasbro';
    setupDefaults();
    render(<ItemsPage />);
    await userEvent.click(screen.getByRole('button', { name: /Remove filter: manufacturer: hasbro/ }));
    expect(mockNavigate).toHaveBeenCalled();
  });

  it('clicking "Clear all" navigates with empty search', async () => {
    mockSearch.manufacturer = 'hasbro';
    setupDefaults();
    render(<ItemsPage />);
    await userEvent.click(screen.getByText('Clear all'));
    expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ search: {} }));
  });

  it('does not render pagination when no next_cursor and no history', () => {
    setupDefaults();
    render(<ItemsPage />);
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('renders Next button when next_cursor is present', () => {
    mockUseFranchiseDetail.mockReturnValue({ data: mockFranchiseDetail, error: null });
    mockUseItems.mockReturnValue({
      data: { data: [mockCatalogItem], next_cursor: 'abc', total_count: 50 },
      isPending: false,
    });
    mockUseItemFacets.mockReturnValue({ data: mockItemFacets });
    mockUseItemDetail.mockReturnValue({ data: undefined, isPending: false, isError: false });
    render(<ItemsPage />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });
});
