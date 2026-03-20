import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ManufacturerTable } from '../ManufacturerTable';
import { mockManufacturer } from '@/catalog/__tests__/catalog-test-helpers';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
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

  it('renders manufacturer name as a link', () => {
    render(<ManufacturerTable manufacturers={mockManufacturers} />);
    const link = screen.getByText('Hasbro').closest('a');
    expect(link).toHaveAttribute('href', '/catalog/manufacturers/$slug');
  });

  it('renders count columns', () => {
    render(<ManufacturerTable manufacturers={mockManufacturers} />);
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
