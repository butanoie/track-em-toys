import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { buildPhotoUrl } from '@/catalog/photos/api';
import { DEFAULT_CONTRIBUTE_INTENT, LICENSE_GRANT_TEXT } from './consent';
import type { ContributeIntent } from '@/lib/zod-schemas';

interface ContributeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photoUrl: string | null;
  onConfirm: (intent: ContributeIntent) => void;
  isPending: boolean;
}

export function ContributeDialog({ open, onOpenChange, photoUrl, onConfirm, isPending }: ContributeDialogProps) {
  const [intent, setIntent] = useState<ContributeIntent>(DEFAULT_CONTRIBUTE_INTENT);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (open) {
      setIntent(DEFAULT_CONTRIBUTE_INTENT);
      setAcknowledged(false);
    }
  }, [open]);

  const submitLabel = intent === 'catalog_and_training' ? 'Contribute to Catalog' : 'Contribute to Training';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Contribute Photo</DialogTitle>
          <DialogDescription>Contribute this photo to Track&apos;em Toys.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {photoUrl && (
            <div className="flex justify-center">
              <img
                src={buildPhotoUrl(photoUrl)}
                alt="Photo to contribute"
                className="max-h-48 rounded-md bg-muted object-contain"
                loading="lazy"
              />
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">How should this photo be used?</p>
            <RadioGroup
              value={intent}
              onValueChange={(value) => setIntent(value as ContributeIntent)}
              disabled={isPending}
              className="gap-3"
            >
              <div className="flex items-start gap-2">
                <RadioGroupItem value="training_only" id="intent-training" className="mt-0.5" />
                <label htmlFor="intent-training" className="text-sm leading-tight cursor-pointer">
                  <span className="font-medium text-foreground">Training only</span>
                  <span className="block text-xs text-muted-foreground">
                    Used to train the ML model. Not shown in the public catalog.
                  </span>
                </label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="catalog_and_training" id="intent-catalog" className="mt-0.5" />
                <label htmlFor="intent-catalog" className="text-sm leading-tight cursor-pointer">
                  <span className="font-medium text-foreground">Catalog + Training</span>
                  <span className="block text-xs text-muted-foreground">
                    Visible in the public catalog AND used for ML training.
                  </span>
                </label>
              </div>
            </RadioGroup>
          </div>

          <div className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">By contributing, you confirm that:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>You took this photo or have the right to share it</li>
              <li>{LICENSE_GRANT_TEXT}</li>
              <li>Your display name may be shown as attribution (removable on request)</li>
              <li>Contributions can be revoked, but photos in use may be retained anonymized</li>
            </ul>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="contribute-consent"
              checked={acknowledged}
              onCheckedChange={(checked) => setAcknowledged(checked === true)}
              disabled={isPending}
            />
            <label htmlFor="contribute-consent" className="text-sm leading-tight cursor-pointer">
              I confirm I have the right to share this photo
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(intent)}
            disabled={!acknowledged || isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600"
          >
            {isPending ? 'Contributing...' : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
