import type { ItemFacets, FacetValue } from '@/lib/zod-schemas';
import type { ItemFilters } from '@/catalog/api';

interface FacetSidebarProps {
  facets: ItemFacets;
  filters: ItemFilters;
  onFilterChange: (key: keyof ItemFilters, value: string | boolean | undefined) => void;
}

interface FacetGroupProps {
  label: string;
  values: FacetValue[];
  activeValue: string | boolean | undefined;
  filterKey: keyof ItemFilters;
  onFilterChange: (key: keyof ItemFilters, value: string | boolean | undefined) => void;
}

function FacetGroup({ label, values, activeValue, filterKey, onFilterChange }: FacetGroupProps) {
  if (values.length === 0) return null;

  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">{label}</legend>
      {values.map((v) => {
        const isActive = String(activeValue) === v.value;
        return (
          <label
            key={v.value}
            className="flex items-center gap-2 py-1 px-1 rounded text-sm cursor-pointer hover:bg-accent transition-colors min-h-[32px]"
          >
            <input
              type="checkbox"
              checked={isActive}
              onChange={() =>
                onFilterChange(
                  filterKey,
                  isActive ? undefined : filterKey === 'is_third_party' ? v.value === 'true' : v.value
                )
              }
              className="rounded border-input h-4 w-4 accent-primary"
            />
            <span className="flex-1 truncate">{v.label}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{v.count}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

export function FacetSidebar({ facets, filters, onFilterChange }: FacetSidebarProps) {
  const groups: { label: string; values: FacetValue[]; filterKey: keyof ItemFilters }[] = [
    { label: 'Continuity', values: facets.continuity_families, filterKey: 'continuity_family' },
    { label: 'Manufacturer', values: facets.manufacturers, filterKey: 'manufacturer' },
    { label: 'Toy Line', values: facets.toy_lines, filterKey: 'toy_line' },
    { label: 'Size Class', values: facets.size_classes, filterKey: 'size_class' },
    { label: 'Type', values: facets.is_third_party, filterKey: 'is_third_party' },
  ];

  return (
    <aside aria-label="Catalog filters" className="space-y-5">
      {groups.map((g) => (
        <FacetGroup
          key={g.filterKey}
          label={g.label}
          values={g.values}
          activeValue={filters[g.filterKey]}
          filterKey={g.filterKey}
          onFilterChange={onFilterChange}
        />
      ))}
    </aside>
  );
}
