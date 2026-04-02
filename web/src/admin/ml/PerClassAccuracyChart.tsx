import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Button } from '@/components/ui/button';
import { formatClassLabel } from './format-utils';
import type { PerClassItem } from '@/lib/zod-schemas';

const TICK_STYLE = { fontSize: 11, fontFamily: 'inherit', fill: 'var(--muted-foreground)' };
const TOOLTIP_STYLE: React.CSSProperties = { fontFamily: 'inherit', fontSize: 13, borderRadius: 8 };

const INITIAL_SHOW = 30;

function accuracyColor(accuracy: number): string {
  if (accuracy >= 0.7) return '#22c55e';
  if (accuracy >= 0.5) return '#f59e0b';
  return '#ef4444';
}

interface PerClassAccuracyChartProps {
  items: PerClassItem[];
}

export function PerClassAccuracyChart({ items }: PerClassAccuracyChartProps) {
  const [showAll, setShowAll] = useState(false);

  const displayItems = useMemo(() => {
    const formatted = items.map((item) => ({
      ...item,
      displayLabel: formatClassLabel(item.label),
    }));
    return showAll ? formatted : formatted.slice(0, INITIAL_SHOW);
  }, [items, showAll]);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">No per-class data available.</p>;
  }

  const chartHeight = Math.max(300, displayItems.length * 22);

  return (
    <div>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={displayItems} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 1]}
            tick={TICK_STYLE}
            tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
          />
          <YAxis type="category" dataKey="displayLabel" width={160} tick={TICK_STYLE} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value) => [`${(Number(value) * 100).toFixed(1)}%`, 'Accuracy']}
          />
          <Bar dataKey="accuracy" radius={[0, 4, 4, 0]}>
            {displayItems.map((entry, i) => (
              <Cell key={i} fill={accuracyColor(entry.accuracy)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {!showAll && items.length > INITIAL_SHOW && (
        <div className="text-center pt-2">
          <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
            Show all {items.length} classes
          </Button>
        </div>
      )}
    </div>
  );
}
