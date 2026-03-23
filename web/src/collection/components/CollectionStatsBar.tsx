import { Archive } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { CollectionStats } from '@/lib/zod-schemas';

interface CollectionStatsBarProps {
  stats: CollectionStats | undefined;
  activeFranchise: string | undefined;
  onFranchiseClick: (slug: string | undefined) => void;
}

export function CollectionStatsBar({ stats, activeFranchise, onFranchiseClick }: CollectionStatsBarProps) {
  if (!stats) {
    return (
      <div className="rounded-lg border bg-card p-5 mb-6 animate-pulse">
        <div className="flex items-center gap-6">
          <div className="h-10 w-16 bg-muted rounded" />
          <div className="h-10 w-16 bg-muted rounded" />
          <div className="flex-1 flex gap-2">
            <div className="h-7 w-24 bg-muted rounded-full" />
            <div className="h-7 w-20 bg-muted rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-5 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-2xl font-bold tabular-nums text-foreground">{stats.total_copies}</p>
              <p className="text-xs text-muted-foreground">copies</p>
            </div>
          </div>
          <Separator orientation="vertical" className="h-8 hidden sm:block" />
          <div>
            <p className="text-2xl font-bold tabular-nums text-foreground">{stats.unique_items}</p>
            <p className="text-xs text-muted-foreground">unique items</p>
          </div>
        </div>

        {stats.by_franchise.length > 0 && (
          <>
            <Separator orientation="vertical" className="h-8 hidden sm:block" />
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onFranchiseClick(undefined)}
                className={cn(
                  'inline-flex items-center rounded-full border px-3 py-1 text-xs transition-colors',
                  activeFranchise === undefined
                    ? 'bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-900 dark:border-amber-700 dark:text-amber-200'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
                aria-pressed={activeFranchise === undefined}
              >
                All
              </button>
              {stats.by_franchise.map((f) => (
                <button
                  key={f.slug}
                  type="button"
                  onClick={() => onFranchiseClick(f.slug === activeFranchise ? undefined : f.slug)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors',
                    activeFranchise === f.slug
                      ? 'bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-900 dark:border-amber-700 dark:text-amber-200'
                      : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                  aria-pressed={activeFranchise === f.slug}
                >
                  {f.name}
                  <span className="tabular-nums font-medium">{f.count}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
