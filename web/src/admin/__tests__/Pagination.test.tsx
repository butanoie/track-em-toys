import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from '../components/Pagination';

describe('Pagination', () => {
  it('shows correct page info', () => {
    render(<Pagination total={50} limit={20} offset={0} onPageChange={vi.fn()} />);
    expect(screen.getByText('Showing 1–20 of 50')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('disables Previous on first page', () => {
    render(<Pagination total={50} limit={20} offset={0} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('disables Next on last page', () => {
    render(<Pagination total={50} limit={20} offset={40} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
  });

  it('calls onPageChange with correct offset on Next click', async () => {
    const onPageChange = vi.fn();
    render(<Pagination total={50} limit={20} offset={0} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(20);
  });

  it('calls onPageChange with correct offset on Previous click', async () => {
    const onPageChange = vi.fn();
    render(<Pagination total={50} limit={20} offset={20} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPageChange).toHaveBeenCalledWith(0);
  });

  it('shows correct info for middle page', () => {
    render(<Pagination total={50} limit={20} offset={20} onPageChange={vi.fn()} />);
    expect(screen.getByText('Showing 21–40 of 50')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  });
});
