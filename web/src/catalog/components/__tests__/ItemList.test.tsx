import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ItemList } from '../ItemList';
import { mockCatalogItem, mockCatalogItemNoManufacturer } from '@/catalog/__tests__/catalog-test-helpers';

describe('ItemList', () => {
  it('renders "No items match your filters." when items is empty', () => {
    render(<ItemList items={[]} selectedSlug={undefined} onSelect={vi.fn()} totalCount={0} />);
    expect(screen.getByText('No items match your filters.')).toBeInTheDocument();
  });

  it('renders item count as plural "items"', () => {
    render(<ItemList items={[mockCatalogItem]} selectedSlug={undefined} onSelect={vi.fn()} totalCount={42} />);
    expect(screen.getByText('42 items')).toBeInTheDocument();
  });

  it('renders singular "item" for count of 1', () => {
    render(<ItemList items={[mockCatalogItem]} selectedSlug={undefined} onSelect={vi.fn()} totalCount={1} />);
    expect(screen.getByText('1 item')).toBeInTheDocument();
  });

  it('renders item name, manufacturer, and toy line', () => {
    render(<ItemList items={[mockCatalogItem]} selectedSlug={undefined} onSelect={vi.fn()} totalCount={1} />);
    expect(screen.getByText('Optimus Prime [G1-001]')).toBeInTheDocument();
    expect(screen.getByText(/Hasbro/)).toBeInTheDocument();
    expect(screen.getByText(/Generation 1/)).toBeInTheDocument();
  });

  it('renders "Unknown" for null manufacturer', () => {
    render(
      <ItemList items={[mockCatalogItemNoManufacturer]} selectedSlug={undefined} onSelect={vi.fn()} totalCount={1} />
    );
    expect(screen.getByText(/Unknown/)).toBeInTheDocument();
  });

  it('renders size_class badge when present', () => {
    render(<ItemList items={[mockCatalogItem]} selectedSlug={undefined} onSelect={vi.fn()} totalCount={1} />);
    expect(screen.getByText('Leader')).toBeInTheDocument();
  });

  it('does not render size_class when null', () => {
    const item = { ...mockCatalogItem, size_class: null };
    render(<ItemList items={[item]} selectedSlug={undefined} onSelect={vi.fn()} totalCount={1} />);
    expect(screen.queryByText('Leader')).not.toBeInTheDocument();
  });

  it('renders year_released when present', () => {
    render(<ItemList items={[mockCatalogItem]} selectedSlug={undefined} onSelect={vi.fn()} totalCount={1} />);
    expect(screen.getByText('1984')).toBeInTheDocument();
  });

  it('calls onSelect with slug when item is clicked', async () => {
    const onSelect = vi.fn();
    render(<ItemList items={[mockCatalogItem]} selectedSlug={undefined} onSelect={onSelect} totalCount={1} />);
    await userEvent.click(screen.getByText('Optimus Prime [G1-001]'));
    expect(onSelect).toHaveBeenCalledWith('optimus-prime');
  });

  it('marks selected item with aria-selected=true', () => {
    const items = [mockCatalogItem, { ...mockCatalogItem, id: 'i-002', slug: 'megatron', name: 'Megatron' }];
    render(<ItemList items={items} selectedSlug="optimus-prime" onSelect={vi.fn()} totalCount={2} />);
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(options[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('handles ArrowDown to select next item', async () => {
    const items = [mockCatalogItem, { ...mockCatalogItem, id: 'i-002', slug: 'megatron', name: 'Megatron' }];
    const onSelect = vi.fn();
    render(<ItemList items={items} selectedSlug="optimus-prime" onSelect={onSelect} totalCount={2} />);
    const firstOption = screen.getAllByRole('option')[0];
    await userEvent.type(firstOption, '{ArrowDown}');
    expect(onSelect).toHaveBeenCalledWith('megatron');
  });

  it('handles ArrowUp to wrap around', async () => {
    const onSelect = vi.fn();
    render(<ItemList items={[mockCatalogItem]} selectedSlug="optimus-prime" onSelect={onSelect} totalCount={1} />);
    const option = screen.getByRole('option');
    await userEvent.type(option, '{ArrowUp}');
    expect(onSelect).toHaveBeenCalledWith('optimus-prime');
  });

  it('handles Escape to deselect', async () => {
    const onSelect = vi.fn();
    render(<ItemList items={[mockCatalogItem]} selectedSlug="optimus-prime" onSelect={onSelect} totalCount={1} />);
    const option = screen.getByRole('option');
    await userEvent.type(option, '{Escape}');
    expect(onSelect).toHaveBeenCalledWith(undefined);
  });

  it('renders paginationControls when provided', () => {
    render(
      <ItemList
        items={[mockCatalogItem]}
        selectedSlug={undefined}
        onSelect={vi.fn()}
        totalCount={50}
        paginationControls={<button>Next</button>}
      />
    );
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });
});
