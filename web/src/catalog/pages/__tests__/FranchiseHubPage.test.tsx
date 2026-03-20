import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FranchiseHubPage } from '../FranchiseHubPage';
import { mockFranchiseDetail, mockItemFacets } from '@/catalog/__tests__/catalog-test-helpers';
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
  useParams: () => ({ franchise: 'transformers' }),
}));

const mockSearch = { view: undefined as string | undefined };
vi.mock('@/routes/_authenticated/catalog/$franchise/index', () => ({
  Route: { useSearch: () => mockSearch },
}));

const mockUseFranchiseDetail = vi.fn();
vi.mock('@/catalog/hooks/useFranchiseDetail', () => ({
  useFranchiseDetail: (...args: unknown[]) => mockUseFranchiseDetail(...args),
}));

const mockUseItemFacets = vi.fn();
vi.mock('@/catalog/hooks/useItemFacets', () => ({
  useItemFacets: (...args: unknown[]) => mockUseItemFacets(...args),
}));

const mockUseCharacterFacets = vi.fn();
vi.mock('@/catalog/hooks/useCharacterFacets', () => ({
  useCharacterFacets: (...args: unknown[]) => mockUseCharacterFacets(...args),
}));

function setupDefaults() {
  mockUseFranchiseDetail.mockReturnValue({ data: mockFranchiseDetail, isPending: false, error: null });
  mockUseItemFacets.mockReturnValue({ data: mockItemFacets, isPending: false });
}

describe('FranchiseHubPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearch.view = undefined;
    mockUseCharacterFacets.mockReturnValue({ data: undefined });
  });

  it('renders loading spinner while pending', () => {
    mockUseFranchiseDetail.mockReturnValue({ data: undefined, isPending: true, error: null });
    mockUseItemFacets.mockReturnValue({ data: undefined, isPending: true });
    render(<FranchiseHubPage />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('renders franchise name as h1 when data loads', () => {
    setupDefaults();
    render(<FranchiseHubPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Transformers' })).toBeInTheDocument();
  });

  it('renders breadcrumb with Catalog link', () => {
    setupDefaults();
    render(<FranchiseHubPage />);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByText('Catalog').closest('a')).toHaveAttribute('href', '/catalog');
  });

  it('renders "Franchise not found" for 404 error', () => {
    mockUseFranchiseDetail.mockReturnValue({
      data: undefined,
      isPending: false,
      error: new ApiError(404, { error: 'Not found' }),
    });
    mockUseItemFacets.mockReturnValue({ data: undefined, isPending: false });
    render(<FranchiseHubPage />);
    expect(screen.getByRole('heading', { name: 'Franchise not found' })).toBeInTheDocument();
  });

  it('renders continuity family cards in items view', () => {
    setupDefaults();
    render(<FranchiseHubPage />);
    expect(screen.getByText('Continuity Families')).toBeInTheDocument();
    expect(screen.getByText('Generation 1')).toBeInTheDocument();
  });

  it('renders "Browse All Items" button', () => {
    setupDefaults();
    render(<FranchiseHubPage />);
    expect(screen.getByRole('button', { name: /Browse All Items/ })).toBeInTheDocument();
  });

  it('renders characters view when search.view is "characters"', () => {
    mockSearch.view = 'characters';
    mockUseFranchiseDetail.mockReturnValue({ data: mockFranchiseDetail, isPending: false, error: null });
    mockUseItemFacets.mockReturnValue({ data: undefined, isPending: false });
    mockUseCharacterFacets.mockReturnValue({
      data: {
        factions: [{ value: 'autobot', label: 'Autobot', count: 20 }],
        character_types: [],
        sub_groups: [],
      },
    });
    render(<FranchiseHubPage />);
    expect(screen.getByText('Factions')).toBeInTheDocument();
    expect(screen.getByText('Autobot')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Browse All Characters/ })).toBeInTheDocument();
  });
});
