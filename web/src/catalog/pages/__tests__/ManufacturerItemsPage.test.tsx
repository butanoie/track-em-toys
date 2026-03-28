import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ManufacturerItemsPage } from '../ManufacturerItemsPage';
import {
  mockManufacturerDetail,
  mockCatalogItem,
  mockManufacturerItemFacets,
} from '@/catalog/__tests__/catalog-test-helpers';
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
  useParams: () => ({ slug: 'hasbro' }),
}));

const mockSearch: Record<string, unknown> = {};
vi.mock('@/routes/_authenticated/catalog/manufacturers/$slug/items', () => ({
  Route: { useSearch: () => mockSearch },
}));

const mockUseManufacturerDetail = vi.fn();
vi.mock('@/catalog/hooks/useManufacturerDetail', () => ({
  useManufacturerDetail: (...args: unknown[]) => mockUseManufacturerDetail(...args),
}));

const mockUseManufacturerItems = vi.fn();
vi.mock('@/catalog/hooks/useManufacturerItems', () => ({
  useManufacturerItems: (...args: unknown[]) => mockUseManufacturerItems(...args),
}));

const mockUseManufacturerItemFacets = vi.fn();
vi.mock('@/catalog/hooks/useManufacturerItemFacets', () => ({
  useManufacturerItemFacets: (...args: unknown[]) => mockUseManufacturerItemFacets(...args),
}));

vi.mock('@/catalog/components/ItemDetailSheet', () => ({
  ItemDetailSheet: () => null,
}));

vi.mock('@/catalog/components/Pagination', () => ({
  Pagination: () => <nav data-testid="pagination" />,
}));

vi.mock('@/components/PageSizeSelector', () => ({
  PageSizeSelector: () => <div data-testid="page-size-selector" />,
}));

function setupDefaults() {
  mockUseManufacturerDetail.mockReturnValue({ data: mockManufacturerDetail, error: null });
  mockUseManufacturerItems.mockReturnValue({
    data: { data: [mockCatalogItem], page: 1, limit: 20, total_count: 1 },
    isPending: false,
  });
  mockUseManufacturerItemFacets.mockReturnValue({ data: mockManufacturerItemFacets });
}

describe('ManufacturerItemsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockResolvedValue(undefined);
    for (const key of Object.keys(mockSearch)) {
      delete mockSearch[key];
    }
  });

  it('renders breadcrumb with Manufacturers link', () => {
    setupDefaults();
    render(<ManufacturerItemsPage />);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByText('Manufacturers').closest('a')).toHaveAttribute('href', '/catalog/manufacturers');
  });

  it('renders loading spinner while items pending', () => {
    mockUseManufacturerDetail.mockReturnValue({ data: mockManufacturerDetail, error: null });
    mockUseManufacturerItems.mockReturnValue({ data: undefined, isPending: true });
    mockUseManufacturerItemFacets.mockReturnValue({ data: undefined });

    render(<ManufacturerItemsPage />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('renders ItemList with item data', () => {
    setupDefaults();
    render(<ManufacturerItemsPage />);
    expect(screen.getByText('Optimus Prime [G1-001]')).toBeInTheDocument();
  });

  it('renders "Manufacturer not found" for 404 error', () => {
    mockUseManufacturerDetail.mockReturnValue({
      data: undefined,
      error: new ApiError(404, { error: 'Not found' }),
    });
    mockUseManufacturerItems.mockReturnValue({ data: undefined, isPending: false });
    mockUseManufacturerItemFacets.mockReturnValue({ data: undefined });

    render(<ManufacturerItemsPage />);
    expect(screen.getByRole('heading', { name: 'Manufacturer not found' })).toBeInTheDocument();
  });

  it('renders pagination controls', () => {
    mockUseManufacturerDetail.mockReturnValue({ data: mockManufacturerDetail, error: null });
    mockUseManufacturerItems.mockReturnValue({
      data: { data: [mockCatalogItem], page: 1, limit: 20, total_count: 50 },
      isPending: false,
    });
    mockUseManufacturerItemFacets.mockReturnValue({ data: mockManufacturerItemFacets });

    render(<ManufacturerItemsPage />);
    expect(screen.getByTestId('page-size-selector')).toBeInTheDocument();
  });
});
