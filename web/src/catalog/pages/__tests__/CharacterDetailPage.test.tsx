import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CharacterDetailPage } from '../CharacterDetailPage';
import {
  mockCharacterDetail,
  mockFranchiseDetail,
  createCatalogTestWrapper,
} from '@/catalog/__tests__/catalog-test-helpers';
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

vi.mock('@/routes/_authenticated/catalog/$franchise/characters/$slug', () => ({
  Route: { useParams: () => ({ franchise: 'transformers', slug: 'optimus-prime' }) },
}));

const mockUseCharacterDetail = vi.fn();
vi.mock('@/catalog/hooks/useCharacterDetail', () => ({
  useCharacterDetail: (...args: unknown[]) => mockUseCharacterDetail(...args),
}));

const mockUseFranchiseDetail = vi.fn();
vi.mock('@/catalog/hooks/useFranchiseDetail', () => ({
  useFranchiseDetail: (...args: unknown[]) => mockUseFranchiseDetail(...args),
}));

const mockListCatalogItems = vi.fn();
vi.mock('@/catalog/api', () => ({
  listCatalogItems: (...args: unknown[]) => mockListCatalogItems(...args),
}));

function setupDefaults() {
  mockUseCharacterDetail.mockReturnValue({ data: mockCharacterDetail, isPending: false, error: null });
  mockUseFranchiseDetail.mockReturnValue({ data: mockFranchiseDetail });
}

function renderWithQuery(ui: React.ReactElement) {
  return render(ui, { wrapper: createCatalogTestWrapper() });
}

describe('CharacterDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListCatalogItems.mockResolvedValue({ data: [], page: 1, limit: 20, total_count: 0 });
  });

  it('renders loading spinner while pending', () => {
    mockUseCharacterDetail.mockReturnValue({ data: undefined, isPending: true, error: null });
    mockUseFranchiseDetail.mockReturnValue({ data: undefined });
    renderWithQuery(<CharacterDetailPage />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('renders character name as h1 when data loads', () => {
    setupDefaults();
    renderWithQuery(<CharacterDetailPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Optimus Prime' })).toBeInTheDocument();
  });

  it('renders breadcrumb with franchise link', () => {
    setupDefaults();
    renderWithQuery(<CharacterDetailPage />);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
  });

  it('renders "Character not found" for 404 error', () => {
    mockUseCharacterDetail.mockReturnValue({
      data: undefined,
      isPending: false,
      error: new ApiError(404, { error: 'Not found' }),
    });
    mockUseFranchiseDetail.mockReturnValue({ data: mockFranchiseDetail });
    renderWithQuery(<CharacterDetailPage />);
    expect(screen.getByRole('heading', { name: 'Character not found' })).toBeInTheDocument();
  });

  it('renders generic error for non-404 errors', () => {
    mockUseCharacterDetail.mockReturnValue({
      data: undefined,
      isPending: false,
      error: new Error('Server error'),
    });
    mockUseFranchiseDetail.mockReturnValue({ data: mockFranchiseDetail });
    renderWithQuery(<CharacterDetailPage />);
    expect(screen.getByText('Failed to load character details.')).toBeInTheDocument();
  });

  it('renders ShareLinkButton', () => {
    setupDefaults();
    renderWithQuery(<CharacterDetailPage />);
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });
});
