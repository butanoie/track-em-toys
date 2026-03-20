import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FacetSidebar, type FacetGroupConfig } from '../FacetSidebar';
import { makeFacetValue } from '@/catalog/__tests__/catalog-test-helpers';

const mockGroups: FacetGroupConfig[] = [
  {
    label: 'Manufacturer',
    values: [makeFacetValue('hasbro', 'Hasbro', 10), makeFacetValue('takara', 'Takara Tomy', 5)],
    filterKey: 'manufacturer',
    activeValue: undefined,
  },
  {
    label: 'Size Class',
    values: [makeFacetValue('Leader', 'Leader', 3)],
    filterKey: 'size_class',
    activeValue: 'Leader',
  },
];

describe('FacetSidebar', () => {
  it('renders aside with aria-label "Catalog filters"', () => {
    render(<FacetSidebar groups={mockGroups} onFilterChange={vi.fn()} />);
    expect(screen.getByRole('complementary', { name: 'Catalog filters' })).toBeInTheDocument();
  });

  it('renders each group label as a legend', () => {
    render(<FacetSidebar groups={mockGroups} onFilterChange={vi.fn()} />);
    expect(screen.getByText('Manufacturer')).toBeInTheDocument();
    expect(screen.getByText('Size Class')).toBeInTheDocument();
  });

  it('renders checkbox for each facet value with count', () => {
    render(<FacetSidebar groups={mockGroups} onFilterChange={vi.fn()} />);
    expect(screen.getByText('Hasbro')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('Takara Tomy')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows checked state matching activeValue', () => {
    render(<FacetSidebar groups={mockGroups} onFilterChange={vi.fn()} />);
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
    expect(checkboxes[2]).toBeChecked();
  });

  it('clicking unchecked checkbox calls onFilterChange with key and value', async () => {
    const onFilterChange = vi.fn();
    render(<FacetSidebar groups={mockGroups} onFilterChange={onFilterChange} />);
    await userEvent.click(screen.getByText('Hasbro'));
    expect(onFilterChange).toHaveBeenCalledWith('manufacturer', 'hasbro');
  });

  it('clicking checked checkbox calls onFilterChange with undefined (deselect)', async () => {
    const onFilterChange = vi.fn();
    render(<FacetSidebar groups={mockGroups} onFilterChange={onFilterChange} />);
    await userEvent.click(screen.getByText('Leader'));
    expect(onFilterChange).toHaveBeenCalledWith('size_class', undefined);
  });

  it('is_third_party filterKey converts value to boolean', async () => {
    const groups: FacetGroupConfig[] = [
      {
        label: 'Type',
        values: [makeFacetValue('true', 'Third Party', 5)],
        filterKey: 'is_third_party',
        activeValue: undefined,
      },
    ];
    const onFilterChange = vi.fn();
    render(<FacetSidebar groups={groups} onFilterChange={onFilterChange} />);
    await userEvent.click(screen.getByText('Third Party'));
    expect(onFilterChange).toHaveBeenCalledWith('is_third_party', true);
  });

  it('group with empty values renders nothing for that group', () => {
    const groups: FacetGroupConfig[] = [
      { label: 'Empty Group', values: [], filterKey: 'empty', activeValue: undefined },
      { label: 'Full Group', values: [makeFacetValue('a', 'A', 1)], filterKey: 'full', activeValue: undefined },
    ];
    render(<FacetSidebar groups={groups} onFilterChange={vi.fn()} />);
    expect(screen.queryByText('Empty Group')).not.toBeInTheDocument();
    expect(screen.getByText('Full Group')).toBeInTheDocument();
  });
});
