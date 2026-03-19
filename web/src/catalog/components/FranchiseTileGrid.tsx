import { Link } from '@tanstack/react-router';
import { Card, CardContent } from '@/components/ui/card';
import type { FranchiseStatsItem } from '@/lib/zod-schemas';

interface FranchiseTileGridProps {
  franchises: FranchiseStatsItem[];
}

export function FranchiseTileGrid({ franchises }: FranchiseTileGridProps) {
  return (
    <ul role="list" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {franchises.map((f) => (
        <li key={f.slug}>
          <Link to="/catalog/$franchise" params={{ franchise: f.slug }}>
            <Card className="h-full transition-all duration-200 hover:shadow-md hover:border-border cursor-pointer">
              <CardContent className="flex flex-col items-center justify-center p-6 text-center min-h-[160px]">
                <div
                  className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3"
                  aria-hidden="true"
                >
                  <span className="text-2xl font-bold text-muted-foreground">{f.name.charAt(0)}</span>
                </div>
                <h3 className="text-lg font-semibold tracking-tight text-foreground">{f.name}</h3>
                <p className="text-sm text-muted-foreground tabular-nums mt-1">
                  {f.item_count} {f.item_count === 1 ? 'item' : 'items'}
                </p>
              </CardContent>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
