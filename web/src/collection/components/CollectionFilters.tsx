import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CONDITION_OPTIONS } from '@/collection/lib/condition-config';
import type { CollectionCondition, CollectionStats } from '@/lib/zod-schemas';

interface CollectionFiltersProps {
  franchise: string | undefined;
  condition: CollectionCondition | undefined;
  search: string | undefined;
  stats: CollectionStats | undefined;
  onFranchiseChange: (value: string | undefined) => void;
  onConditionChange: (value: CollectionCondition | undefined) => void;
  onSearchChange: (value: string | undefined) => void;
}

export function CollectionFilters({
  franchise,
  condition,
  search,
  stats,
  onFranchiseChange,
  onConditionChange,
  onSearchChange,
}: CollectionFiltersProps) {
  const [localSearch, setLocalSearch] = useState(search ?? '');

  // Sync external search state → local input (e.g., when "Clear filters" resets search)
  useEffect(() => {
    setLocalSearch(search ?? '');
  }, [search]);

  // 300ms debounce for search input
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = localSearch.trim() || undefined;
      if (trimmed !== search) {
        onSearchChange(trimmed);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, search, onSearchChange]);

  const hasActiveFilters =
    franchise !== undefined || condition !== undefined || (search !== undefined && search !== '');

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <Select value={franchise ?? '__all__'} onValueChange={(v) => onFranchiseChange(v === '__all__' ? undefined : v)}>
        <SelectTrigger className="w-[180px]" aria-label="Filter by franchise">
          <SelectValue placeholder="All Franchises" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Franchises</SelectItem>
          {stats?.by_franchise.map((f) => (
            <SelectItem key={f.slug} value={f.slug}>
              {f.name} ({f.count})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={condition ?? '__all__'}
        onValueChange={(v) => onConditionChange(v === '__all__' ? undefined : (v as CollectionCondition))}
      >
        <SelectTrigger className="w-[200px]" aria-label="Filter by condition">
          <SelectValue placeholder="Any Condition" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Any Condition</SelectItem>
          {CONDITION_OPTIONS.map(([value, config]) => (
            <SelectItem key={value} value={value}>
              {config.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search your collection..."
          className="pl-9"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          aria-label="Search collection"
        />
      </div>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onFranchiseChange(undefined);
            onConditionChange(undefined);
            onSearchChange(undefined);
          }}
        >
          Clear filters
          <X className="h-3 w-3 ml-1" />
        </Button>
      )}
    </div>
  );
}
