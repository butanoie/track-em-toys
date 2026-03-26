import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ManufacturerTable } from '../ManufacturerTable';
import { mockManufacturer } from '@/catalog/__tests__/catalog-test-helpers';

const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

const mockManufacturers = [mockManufacturer];

describe('ManufacturerTable', () => {
  it('renders table with aria-label', () => {
    render(<ManufacturerTable manufacturers={mockManufacturers} />);
    expect(screen.getByRole('table', { name: 'Manufacturers list' })).toBeInTheDocument();
  });

  it('renders table headers', () => {
    render(<ManufacturerTable manufacturers={mockManufacturers} />);
    expect(screen.getByText('Manufacturer')).toBeInTheDocument();
    expect(screen.getByText('Items')).toBeInTheDocument();
    expect(screen.getByText('Toy Lines')).toBeInTheDocument();
    expect(screen.getByText('Franchises')).toBeInTheDocument();
  });

  it('renders manufacturer name and navigates on row click', () => {
    render(<ManufacturerTable manufacturers={mockManufacturers} />);
    expect(screen.getByText('Hasbro')).toBeInTheDocument();
    screen.getByText('Hasbro').closest('tr')!.click();
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/catalog/manufacturers/$slug', params: { slug: 'hasbro' } });
  });

  it('renders count columns', () => {
    render(<ManufacturerTable manufacturers={mockManufacturers} />);
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
