import { cn } from '@/lib/utils';
import { ITEM_CONDITION_CONFIG, ITEM_CONDITION_GRADES } from '@/collection/lib/item-condition-config';

interface ItemConditionSelectorProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function ItemConditionSelector({ value, onChange, disabled = false }: ItemConditionSelectorProps) {
  const selectedConfig = ITEM_CONDITION_CONFIG[value];

  return (
    <fieldset disabled={disabled}>
      <legend className="text-sm font-medium mb-1">Item Grade</legend>
      {selectedConfig && (
        <p className="text-xs text-muted-foreground mb-2">
          {selectedConfig.label} — {selectedConfig.description}
        </p>
      )}
      <div className="grid grid-cols-5 gap-1">
        {ITEM_CONDITION_GRADES.map((grade) => {
          const config = ITEM_CONDITION_CONFIG[grade];
          return (
            <button
              key={grade}
              type="button"
              onClick={() => onChange(grade)}
              title={config.description}
              className={cn(
                'rounded-md border px-2 py-1.5 text-xs font-bold transition-colors',
                value === grade
                  ? cn('ring-2 ring-amber-500 ring-offset-1', config.className)
                  : 'border-input hover:bg-accent'
              )}
            >
              {config.shortLabel}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
