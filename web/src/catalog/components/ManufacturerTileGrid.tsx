import { Link } from '@tanstack/react-router';
import { Card, CardContent } from '@/components/ui/card';
import type { ManufacturerStatsItem } from '@/lib/zod-schemas';

interface ManufacturerTileGridProps {
  manufacturers: ManufacturerStatsItem[];
}

export function ManufacturerTileGrid({ manufacturers }: ManufacturerTileGridProps) {
  return (
    <ul role="list" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {manufacturers.map((m) => (
        <li key={m.slug}>
          <Link to="/catalog/manufacturers/$slug" params={{ slug: m.slug }}>
            <Card className="h-full transition-all duration-200 hover:shadow-md hover:border-border cursor-pointer">
              <CardContent className="flex flex-col items-center justify-center p-6 text-center min-h-[160px]">
                <div
                  className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3"
                  aria-hidden="true"
                >
                  <span className="text-2xl font-bold text-muted-foreground">{m.name.charAt(0)}</span>
                </div>
                <h3 className="text-lg font-semibold tracking-tight text-foreground">{m.name}</h3>
                <p className="text-sm text-muted-foreground tabular-nums mt-1">
                  {m.item_count} {m.item_count === 1 ? 'item' : 'items'}
                </p>
              </CardContent>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
