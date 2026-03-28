import { cn } from '@/lib/utils';
import { PACKAGE_CONDITION_CONFIG } from '@/collection/lib/condition-config';
import type { PackageCondition } from '@/lib/zod-schemas';

const badgeBase = 'inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider';

export function ConditionBadgeBase({ label, title, className }: { label: string; title: string; className: string }) {
  return (
    <span className={cn(badgeBase, className)} title={title}>
      {label}
    </span>
  );
}

interface ConditionBadgeProps {
  condition: PackageCondition;
  variant?: 'short' | 'full';
}

export function ConditionBadge({ condition, variant = 'short' }: ConditionBadgeProps) {
  const config = PACKAGE_CONDITION_CONFIG[condition];
  if (!config) return null;

  return (
    <ConditionBadgeBase
      label={variant === 'short' ? config.shortCode : config.label}
      title={config.label}
      className={config.className}
    />
  );
}
