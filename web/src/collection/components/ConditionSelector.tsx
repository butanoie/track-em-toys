import { cn } from '@/lib/utils';
import { PACKAGE_CONDITION_OPTIONS } from '@/collection/lib/condition-config';
import type { PackageCondition } from '@/lib/zod-schemas';

interface ConditionSelectorProps {
  value: PackageCondition;
  onChange: (value: PackageCondition) => void;
  disabled?: boolean;
}

export function ConditionSelector({ value, onChange, disabled = false }: ConditionSelectorProps) {
  return (
    <fieldset disabled={disabled}>
      <legend className="text-sm font-medium mb-2">Package Condition</legend>
      <div className="space-y-1">
        {PACKAGE_CONDITION_OPTIONS.map(([conditionValue, config]) => (
          <button
            key={conditionValue}
            type="button"
            onClick={() => onChange(conditionValue)}
            className={cn(
              'flex items-center w-full gap-3 rounded-md border px-3 py-2 text-sm text-left transition-colors',
              value === conditionValue
                ? cn('ring-2 ring-amber-500 ring-offset-1', config.className)
                : 'border-input hover:bg-accent'
            )}
          >
            <span
              className={cn(
                'inline-flex items-center justify-center rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider w-10',
                config.className
              )}
            >
              {config.shortCode}
            </span>
            <span>{config.label}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
