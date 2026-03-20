import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ItemDetailPage } from '../ItemDetailPage';
import { mockCatalogItemDetail, mockFranchiseDetail } from '@/catalog/__tests__/catalog-test-helpers';
import { ApiError } from '@/lib/api-client';

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
}));

vi.mock('@/routes/_authenticated/catalog/$franchise/items/$slug', () => ({
  Route: { useParams: () => ({ franchise: 'transformers', slug: 'optimus-prime' }) },
}));

const mockUseItemDetail = vi.fn();
vi.mock('@/catalog/hooks/useItemDetail', () => ({
  useItemDetail: (...args: unknown[]) => mockUseItemDetail(...args),
}));

const mockUseFranchiseDetail = vi.fn();
vi.mock('@/catalog/hooks/useFranchiseDetail', () => ({
  useFranchiseDetail: (...args: unknown[]) => mockUseFranchiseDetail(...args),
}));

function setupDefaults() {
  mockUseItemDetail.mockReturnValue({ data: mockCatalogItemDetail, isPending: false, error: null });
  mockUseFranchiseDetail.mockReturnValue({ data: mockFranchiseDetail });
}

describe('ItemDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading spinner while pending', () => {
    mockUseItemDetail.mockReturnValue({ data: undefined, isPending: true, error: null });
    mockUseFranchiseDetail.mockReturnValue({ data: undefined });
    render(<ItemDetailPage />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('renders item name as h1 when data loads', () => {
    setupDefaults();
    render(<ItemDetailPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Optimus Prime' })).toBeInTheDocument();
  });

  it('renders breadcrumb with Items link', () => {
    setupDefaults();
    render(<ItemDetailPage />);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByText('Items').closest('a')).toHaveAttribute('href', '/catalog/$franchise/items');
  });

  it('renders "Item not found" for 404 error', () => {
    mockUseItemDetail.mockReturnValue({
      data: undefined,
      isPending: false,
      error: new ApiError(404, { error: 'Not found' }),
    });
    mockUseFranchiseDetail.mockReturnValue({ data: mockFranchiseDetail });
    render(<ItemDetailPage />);
    expect(screen.getByRole('heading', { name: 'Item not found' })).toBeInTheDocument();
  });

  it('renders generic error for non-404 errors', () => {
    mockUseItemDetail.mockReturnValue({
      data: undefined,
      isPending: false,
      error: new Error('Server error'),
    });
    mockUseFranchiseDetail.mockReturnValue({ data: mockFranchiseDetail });
    render(<ItemDetailPage />);
    expect(screen.getByText('Failed to load item details.')).toBeInTheDocument();
  });

  it('renders ShareLinkButton', () => {
    setupDefaults();
    render(<ItemDetailPage />);
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });
});
