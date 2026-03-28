import { ITEM_CONDITION_CONFIG } from '@/collection/lib/item-condition-config';
import { ConditionBadgeBase } from '@/collection/components/ConditionBadge';

interface ItemConditionBadgeProps {
  grade: number;
}

export function ItemConditionBadge({ grade }: ItemConditionBadgeProps) {
  const config = ITEM_CONDITION_CONFIG[grade];
  if (!config) return null;

  return <ConditionBadgeBase label={config.shortLabel} title={config.description} className={config.className} />;
}
