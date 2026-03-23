import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ViewToggle } from '../ViewToggle';

describe('ViewToggle', () => {
  it('renders grid and table buttons', () => {
    render(<ViewToggle view="grid" onViewChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Card view' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Table view' })).toBeInTheDocument();
  });

  it('marks grid as checked when view is grid', () => {
    render(<ViewToggle view="grid" onViewChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Card view' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Table view' })).toHaveAttribute('aria-checked', 'false');
  });

  it('marks table as checked when view is table', () => {
    render(<ViewToggle view="table" onViewChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Table view' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Card view' })).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onViewChange when clicking table button', async () => {
    const onChange = vi.fn();
    render(<ViewToggle view="grid" onViewChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Table view' }));
    expect(onChange).toHaveBeenCalledWith('table');
  });

  it('calls onViewChange when clicking grid button', async () => {
    const onChange = vi.fn();
    render(<ViewToggle view="table" onViewChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Card view' }));
    expect(onChange).toHaveBeenCalledWith('grid');
  });
});
