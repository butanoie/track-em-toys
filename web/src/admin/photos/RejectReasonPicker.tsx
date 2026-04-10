import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { REJECTION_REASONS } from './constants';
import type { RejectionReasonCode } from '@/lib/zod-schemas';

interface RejectSubmitPayload {
  code: RejectionReasonCode;
  text: string | null;
}

interface RejectReasonPickerProps {
  isPending: boolean;
  onSubmit: (payload: RejectSubmitPayload) => void;
  onCancel: () => void;
}

const OTHER_TEXT_MAX_LENGTH = 500;

/**
 * Inline reject-reason picker — NOT a modal dialog. Per the base plan,
 * the inline approach keeps the curator's eye on the hero image and
 * lets keyboard shortcuts (1..6) drive the entire reject flow without
 * a context switch.
 *
 * Single-click semantics: clicking reasons 1..5 fires `onSubmit`
 * immediately. Clicking "Other" reveals a free-text input that
 * auto-focuses; Enter confirms (with text or null), Esc cancels the
 * entire reject flow via `onCancel`.
 */
export function RejectReasonPicker({ isPending, onSubmit, onCancel }: RejectReasonPickerProps) {
  const [otherSelected, setOtherSelected] = useState(false);
  const [otherText, setOtherText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (otherSelected) {
      inputRef.current?.focus();
    }
  }, [otherSelected]);

  function handleReasonClick(code: RejectionReasonCode) {
    if (isPending) return;
    if (code === 'other') {
      setOtherSelected(true);
      return;
    }
    onSubmit({ code, text: null });
  }

  function handleOtherKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      const trimmed = otherText.trim();
      onSubmit({ code: 'other', text: trimmed.length > 0 ? trimmed : null });
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <div
      role="group"
      aria-label="Select rejection reason"
      className="space-y-3 rounded-md border border-border bg-muted/40 p-3"
    >
      <div className="flex flex-wrap gap-2">
        {REJECTION_REASONS.map((reason) => (
          <Button
            key={reason.code}
            type="button"
            variant={reason.code === 'other' && otherSelected ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleReasonClick(reason.code)}
            disabled={isPending}
            aria-keyshortcuts={reason.key}
          >
            <span className="mr-1 text-xs opacity-70">{reason.key}</span>
            {reason.label}
          </Button>
        ))}
      </div>

      {otherSelected && (
        <div className="space-y-1">
          <Input
            ref={inputRef}
            value={otherText}
            onChange={(event) => setOtherText(event.target.value)}
            onKeyDown={handleOtherKeyDown}
            placeholder="Reason (optional, max 500 characters)"
            maxLength={OTHER_TEXT_MAX_LENGTH}
            aria-label="Other rejection reason text"
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            Press <kbd className="rounded border px-1">Enter</kbd> to confirm,{' '}
            <kbd className="rounded border px-1">Esc</kbd> to cancel.
          </p>
        </div>
      )}
    </div>
  );
}
