import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ManufacturerListPage } from '../ManufacturerListPage';
import { mockManufacturer } from '@/catalog/__tests__/catalog-test-helpers';

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

const mockUseManufacturers = vi.fn();
vi.mock('@/catalog/hooks/useManufacturers', () => ({
  useManufacturers: () => mockUseManufacturers(),
}));

describe('ManufacturerListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Manufacturers" heading', () => {
    mockUseManufacturers.mockReturnValue({ data: undefined, isPending: false, isError: false, error: null });
    render(<ManufacturerListPage />);
    expect(screen.getByRole('heading', { name: 'Manufacturers' })).toBeInTheDocument();
  });

  it('renders loading skeleton while isPending and no data', () => {
    mockUseManufacturers.mockReturnValue({ data: undefined, isPending: true, isError: false, error: null });
    render(<ManufacturerListPage />);
    expect(screen.queryByText('Hasbro')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('renders error alert on isError', () => {
    mockUseManufacturers.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('Server error'),
    });
    render(<ManufacturerListPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Server error');
  });

  it('renders empty state when data.data is empty', () => {
    mockUseManufacturers.mockReturnValue({
      data: { data: [] },
      isPending: false,
      isError: false,
      error: null,
    });
    render(<ManufacturerListPage />);
    expect(screen.getByText('No manufacturers in the catalog yet.')).toBeInTheDocument();
  });

  it('renders manufacturer tiles in default grid mode', () => {
    mockUseManufacturers.mockReturnValue({
      data: { data: [mockManufacturer] },
      isPending: false,
      isError: false,
      error: null,
    });
    render(<ManufacturerListPage />);
    expect(screen.getByText('Hasbro')).toBeInTheDocument();
    expect(screen.getByRole('list')).toBeInTheDocument();
  });

  it('switches to table view when Table button clicked', async () => {
    mockUseManufacturers.mockReturnValue({
      data: { data: [mockManufacturer] },
      isPending: false,
      isError: false,
      error: null,
    });
    render(<ManufacturerListPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Table view' }));
    expect(screen.getByRole('table', { name: 'Manufacturers list' })).toBeInTheDocument();
  });

  it('renders "or by franchise" link', () => {
    mockUseManufacturers.mockReturnValue({ data: undefined, isPending: false, isError: false, error: null });
    render(<ManufacturerListPage />);
    expect(screen.getByText('or by franchise').closest('a')).toHaveAttribute('href', '/catalog');
  });
});
