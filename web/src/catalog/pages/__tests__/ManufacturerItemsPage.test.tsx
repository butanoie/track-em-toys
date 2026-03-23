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

const mockUseItemDetail = vi.fn();
vi.mock('@/catalog/hooks/useItemDetail', () => ({
  useItemDetail: (...args: unknown[]) => mockUseItemDetail(...args),
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
  AddToCollectionButton: () => null,
}));

function setupDefaults() {
  mockUseManufacturerDetail.mockReturnValue({ data: mockManufacturerDetail, error: null });
  mockUseManufacturerItems.mockReturnValue({
    data: { data: [mockCatalogItem], next_cursor: null, total_count: 1 },
    isPending: false,
  });
  mockUseManufacturerItemFacets.mockReturnValue({ data: mockManufacturerItemFacets });
  mockUseItemDetail.mockReturnValue({ data: undefined, isPending: false, isError: false });
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
    mockUseItemDetail.mockReturnValue({ data: undefined, isPending: false, isError: false });
    render(<ManufacturerItemsPage />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('renders ItemList with item data', () => {
    setupDefaults();
    render(<ManufacturerItemsPage />);
    expect(screen.getByText('Optimus Prime')).toBeInTheDocument();
  });

  it('renders "Manufacturer not found" for 404 error', () => {
    mockUseManufacturerDetail.mockReturnValue({
      data: undefined,
      error: new ApiError(404, { error: 'Not found' }),
    });
    mockUseManufacturerItems.mockReturnValue({ data: undefined, isPending: false });
    mockUseManufacturerItemFacets.mockReturnValue({ data: undefined });
    mockUseItemDetail.mockReturnValue({ data: undefined, isPending: false, isError: false });
    render(<ManufacturerItemsPage />);
    expect(screen.getByRole('heading', { name: 'Manufacturer not found' })).toBeInTheDocument();
  });

  it('renders Next button when next_cursor is present', () => {
    mockUseManufacturerDetail.mockReturnValue({ data: mockManufacturerDetail, error: null });
    mockUseManufacturerItems.mockReturnValue({
      data: { data: [mockCatalogItem], next_cursor: 'abc', total_count: 50 },
      isPending: false,
    });
    mockUseManufacturerItemFacets.mockReturnValue({ data: mockManufacturerItemFacets });
    mockUseItemDetail.mockReturnValue({ data: undefined, isPending: false, isError: false });
    render(<ManufacturerItemsPage />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });
});
