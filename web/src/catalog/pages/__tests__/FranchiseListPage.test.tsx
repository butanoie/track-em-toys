import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FranchiseListPage } from '../FranchiseListPage';
import { mockFranchise } from '@/catalog/__tests__/catalog-test-helpers';

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

const mockUseFranchises = vi.fn();
vi.mock('@/catalog/hooks/useFranchises', () => ({
  useFranchises: () => mockUseFranchises(),
}));

describe('FranchiseListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Catalog" heading', () => {
    mockUseFranchises.mockReturnValue({ data: undefined, isPending: false, isError: false, error: null });
    render(<FranchiseListPage />);
    expect(screen.getByRole('heading', { name: 'Catalog' })).toBeInTheDocument();
  });

  it('renders loading skeleton while isPending and no data', () => {
    mockUseFranchises.mockReturnValue({ data: undefined, isPending: true, isError: false, error: null });
    render(<FranchiseListPage />);
    expect(screen.queryByText('Transformers')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('renders error alert on isError', () => {
    mockUseFranchises.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('Network error'),
    });
    render(<FranchiseListPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Network error');
  });

  it('renders empty state when data.data is empty', () => {
    mockUseFranchises.mockReturnValue({
      data: { data: [] },
      isPending: false,
      isError: false,
      error: null,
    });
    render(<FranchiseListPage />);
    expect(screen.getByText('No franchises in the catalog yet.')).toBeInTheDocument();
  });

  it('renders franchise tiles when data is present (default grid mode)', () => {
    mockUseFranchises.mockReturnValue({
      data: { data: [mockFranchise] },
      isPending: false,
      isError: false,
      error: null,
    });
    render(<FranchiseListPage />);
    expect(screen.getByText('Transformers')).toBeInTheDocument();
    expect(screen.getByRole('list')).toBeInTheDocument();
  });

  it('switches to table view when Table button clicked', async () => {
    mockUseFranchises.mockReturnValue({
      data: { data: [mockFranchise] },
      isPending: false,
      isError: false,
      error: null,
    });
    render(<FranchiseListPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Table view' }));
    expect(screen.getByText('Items')).toBeInTheDocument();
  });

  it('Grid view button has aria-pressed=true by default', () => {
    mockUseFranchises.mockReturnValue({ data: undefined, isPending: false, isError: false, error: null });
    render(<FranchiseListPage />);
    expect(screen.getByRole('button', { name: 'Grid view' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Table view' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders "or by manufacturer" link', () => {
    mockUseFranchises.mockReturnValue({ data: undefined, isPending: false, isError: false, error: null });
    render(<FranchiseListPage />);
    expect(screen.getByText('or by manufacturer').closest('a')).toHaveAttribute('href', '/catalog/manufacturers');
  });
});
