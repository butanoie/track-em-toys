import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ManufacturerHubPage } from '../ManufacturerHubPage';
import { mockManufacturerDetail, mockManufacturerItemFacets } from '@/catalog/__tests__/catalog-test-helpers';
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
  useParams: () => ({ slug: 'hasbro' }),
}));

const mockUseManufacturerDetail = vi.fn();
vi.mock('@/catalog/hooks/useManufacturerDetail', () => ({
  useManufacturerDetail: (...args: unknown[]) => mockUseManufacturerDetail(...args),
}));

const mockUseManufacturerItemFacets = vi.fn();
vi.mock('@/catalog/hooks/useManufacturerItemFacets', () => ({
  useManufacturerItemFacets: (...args: unknown[]) => mockUseManufacturerItemFacets(...args),
}));

function setupDefaults() {
  mockUseManufacturerDetail.mockReturnValue({ data: mockManufacturerDetail, isPending: false, error: null });
  mockUseManufacturerItemFacets.mockReturnValue({ data: mockManufacturerItemFacets, isPending: false });
}

describe('ManufacturerHubPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading spinner while pending', () => {
    mockUseManufacturerDetail.mockReturnValue({ data: undefined, isPending: true, error: null });
    mockUseManufacturerItemFacets.mockReturnValue({ data: undefined, isPending: true });
    render(<ManufacturerHubPage />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('renders manufacturer name as h1', () => {
    setupDefaults();
    render(<ManufacturerHubPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Hasbro' })).toBeInTheDocument();
  });

  it('renders "Manufacturer not found" for 404 error', () => {
    mockUseManufacturerDetail.mockReturnValue({
      data: undefined,
      isPending: false,
      error: new ApiError(404, { error: 'Not found' }),
    });
    mockUseManufacturerItemFacets.mockReturnValue({ data: undefined, isPending: false });
    render(<ManufacturerHubPage />);
    expect(screen.getByRole('heading', { name: 'Manufacturer not found' })).toBeInTheDocument();
  });

  it('renders Official Licensee badge when is_official_licensee', () => {
    setupDefaults();
    render(<ManufacturerHubPage />);
    expect(screen.getByText('Official Licensee')).toBeInTheDocument();
  });

  it('renders country badge when present', () => {
    setupDefaults();
    render(<ManufacturerHubPage />);
    expect(screen.getByText('US')).toBeInTheDocument();
  });

  it('renders website link when present', () => {
    setupDefaults();
    render(<ManufacturerHubPage />);
    const link = screen.getByText('Website').closest('a');
    expect(link).toHaveAttribute('href', 'https://hasbro.com');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders aliases when present', () => {
    setupDefaults();
    render(<ManufacturerHubPage />);
    expect(screen.getByText(/Also known as: Hasbro Inc/)).toBeInTheDocument();
  });

  it('renders franchise and toy line cards from facets', () => {
    setupDefaults();
    render(<ManufacturerHubPage />);
    expect(screen.getByText('Franchises')).toBeInTheDocument();
    expect(screen.getByText('Toy Lines')).toBeInTheDocument();
    expect(screen.getByText('Transformers')).toBeInTheDocument();
  });

  it('renders breadcrumb with Catalog and Manufacturers links', () => {
    setupDefaults();
    render(<ManufacturerHubPage />);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByText('Manufacturers').closest('a')).toHaveAttribute('href', '/catalog/manufacturers');
  });
});
