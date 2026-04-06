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
import { buildPhotoUrl } from '@/catalog/photos/api';

interface ContributeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photoUrl: string | null;
  onConfirm: () => void;
  isPending: boolean;
}

export function ContributeDialog({ open, onOpenChange, photoUrl, onConfirm, isPending }: ContributeDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (open) {
      setAcknowledged(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Contribute Photo to Catalog</DialogTitle>
          <DialogDescription>Share this photo with the Track&apos;em Toys community.</DialogDescription>
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

          <div className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">By contributing, you confirm that:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>You took this photo or have the right to share it</li>
              <li>
                You grant Track&apos;em Toys a perpetual, non-exclusive, royalty-free license to use, display, and
                modify this photo for catalog and ML training
              </li>
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
            onClick={onConfirm}
            disabled={!acknowledged || isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600"
          >
            {isPending ? 'Contributing...' : 'Contribute to Catalog'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
