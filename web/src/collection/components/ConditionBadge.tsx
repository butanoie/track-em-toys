import { cn } from '@/lib/utils';
import { CONDITION_CONFIG } from '@/collection/lib/condition-config';
import type { CollectionCondition } from '@/lib/zod-schemas';

interface ConditionBadgeProps {
  condition: CollectionCondition;
  variant?: 'short' | 'full';
}

export function ConditionBadge({ condition, variant = 'short' }: ConditionBadgeProps) {
  const config = CONDITION_CONFIG[condition];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
        config.className
      )}
      title={config.label}
    >
      {variant === 'short' ? config.shortCode : config.label}
    </span>
  );
}
