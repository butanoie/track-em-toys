import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CharactersPage } from '../CharactersPage';
import {
  mockFranchiseDetail,
  mockCharacterListItem,
  mockCharacterFacets,
} from '@/catalog/__tests__/catalog-test-helpers';
import { ApiError } from '@/lib/api-client';

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
vi.mock('@/routes/_authenticated/catalog/$franchise/characters/index', () => ({
  Route: { useSearch: () => mockSearch },
}));

const mockUseFranchiseDetail = vi.fn();
vi.mock('@/catalog/hooks/useFranchiseDetail', () => ({
  useFranchiseDetail: (...args: unknown[]) => mockUseFranchiseDetail(...args),
}));

const mockUseCharacters = vi.fn();
vi.mock('@/catalog/hooks/useCharacters', () => ({
  useCharacters: (...args: unknown[]) => mockUseCharacters(...args),
}));

const mockUseCharacterFacets = vi.fn();
vi.mock('@/catalog/hooks/useCharacterFacets', () => ({
  useCharacterFacets: (...args: unknown[]) => mockUseCharacterFacets(...args),
}));

const mockUseCharacterDetail = vi.fn();
vi.mock('@/catalog/hooks/useCharacterDetail', () => ({
  useCharacterDetail: (...args: unknown[]) => mockUseCharacterDetail(...args),
}));

vi.mock('@/catalog/components/Pagination', () => ({
  Pagination: () => <nav data-testid="pagination" />,
}));

vi.mock('@/components/PageSizeSelector', () => ({
  PageSizeSelector: () => <div data-testid="page-size-selector" />,
}));

function setupDefaults() {
  mockUseFranchiseDetail.mockReturnValue({ data: mockFranchiseDetail, error: null });
  mockUseCharacters.mockReturnValue({
    data: { data: [mockCharacterListItem], page: 1, limit: 20, total_count: 1 },
    isPending: false,
  });
  mockUseCharacterFacets.mockReturnValue({ data: mockCharacterFacets });
  mockUseCharacterDetail.mockReturnValue({ data: undefined, isPending: false, isError: false });
}

describe('CharactersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockResolvedValue(undefined);
    for (const key of Object.keys(mockSearch)) {
      delete mockSearch[key];
    }
  });

  it('renders breadcrumb with Characters', () => {
    setupDefaults();
    render(<CharactersPage />);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
  });

  it('renders loading spinner while characters pending', () => {
    mockUseFranchiseDetail.mockReturnValue({ data: mockFranchiseDetail, error: null });
    mockUseCharacters.mockReturnValue({ data: undefined, isPending: true });
    mockUseCharacterFacets.mockReturnValue({ data: undefined });
    mockUseCharacterDetail.mockReturnValue({ data: undefined, isPending: false, isError: false });
    render(<CharactersPage />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('renders CharacterList with data', () => {
    setupDefaults();
    render(<CharactersPage />);
    expect(screen.getByText('Optimus Prime')).toBeInTheDocument();
    expect(screen.getByText('1 character')).toBeInTheDocument();
  });

  it('renders "Franchise not found" for 404 error', () => {
    mockUseFranchiseDetail.mockReturnValue({
      data: undefined,
      error: new ApiError(404, { error: 'Not found' }),
    });
    mockUseCharacters.mockReturnValue({ data: undefined, isPending: false });
    mockUseCharacterFacets.mockReturnValue({ data: undefined });
    mockUseCharacterDetail.mockReturnValue({ data: undefined, isPending: false, isError: false });
    render(<CharactersPage />);
    expect(screen.getByRole('heading', { name: 'Franchise not found' })).toBeInTheDocument();
  });

  it('renders active filter chips when search has filters', () => {
    mockSearch.faction = 'autobot';
    setupDefaults();
    render(<CharactersPage />);
    expect(screen.getByRole('button', { name: /Remove filter: faction: autobot/ })).toBeInTheDocument();
  });

  it('clicking "Clear all" navigates with empty search', async () => {
    mockSearch.faction = 'autobot';
    setupDefaults();
    render(<CharactersPage />);
    await userEvent.click(screen.getByText('Clear all'));
    expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ search: {} }));
  });

  it('renders pagination controls', () => {
    mockUseFranchiseDetail.mockReturnValue({ data: mockFranchiseDetail, error: null });
    mockUseCharacters.mockReturnValue({
      data: { data: [mockCharacterListItem], page: 1, limit: 20, total_count: 50 },
      isPending: false,
    });
    mockUseCharacterFacets.mockReturnValue({ data: mockCharacterFacets });
    mockUseCharacterDetail.mockReturnValue({ data: undefined, isPending: false, isError: false });
    render(<CharactersPage />);
    expect(screen.getByTestId('page-size-selector')).toBeInTheDocument();
  });
});
