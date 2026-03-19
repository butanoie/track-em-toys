import type { FacetValue } from '@/lib/zod-schemas';

export interface FacetGroupConfig {
  label: string;
  values: FacetValue[];
  filterKey: string;
  activeValue: string | boolean | undefined;
}

interface FacetSidebarProps {
  groups: FacetGroupConfig[];
  onFilterChange: (key: string, value: string | boolean | undefined) => void;
}

interface FacetGroupProps {
  label: string;
  values: FacetValue[];
  activeValue: string | boolean | undefined;
  filterKey: string;
  onFilterChange: (key: string, value: string | boolean | undefined) => void;
}

function FacetGroup({ label, values, activeValue, filterKey, onFilterChange }: FacetGroupProps) {
  if (values.length === 0) return null;

  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">{label}</legend>
      {values.map((v) => {
        const isActive = activeValue !== undefined && String(activeValue) === v.value;
        return (
          <label
            key={v.value}
            className="flex items-center gap-2 py-1 px-1 rounded text-sm cursor-pointer hover:bg-accent transition-colors min-h-[32px]"
          >
            <input
              type="checkbox"
              checked={isActive}
              onChange={() => {
                if (isActive) {
                  onFilterChange(filterKey, undefined);
                } else if (filterKey === 'is_third_party') {
                  onFilterChange(filterKey, v.value === 'true');
                } else {
                  onFilterChange(filterKey, v.value);
                }
              }}
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

export function FacetSidebar({ groups, onFilterChange }: FacetSidebarProps) {
  return (
    <aside aria-label="Catalog filters" className="space-y-5">
      {groups.map((g) => (
        <FacetGroup
          key={g.filterKey}
          label={g.label}
          values={g.values}
          activeValue={g.activeValue}
          filterKey={g.filterKey}
          onFilterChange={onFilterChange}
        />
      ))}
    </aside>
  );
}
