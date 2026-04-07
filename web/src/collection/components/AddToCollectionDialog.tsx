import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
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
import { ConditionSelector } from '@/collection/components/ConditionSelector';
import { ItemConditionSelector } from '@/collection/components/ItemConditionSelector';
import { NotesField } from '@/collection/components/NotesField';
import { DEFAULT_ITEM_CONDITION } from '@/collection/lib/item-condition-config';
import { uploadCollectionPhoto, contributeCollectionPhoto } from '@/collection/photos/api';
import { CONSENT_VERSION, DEFAULT_CONTRIBUTE_INTENT, LICENSE_GRANT_TEXT } from '@/collection/photos/consent';
import type { PackageCondition, ContributeIntent } from '@/lib/zod-schemas';
import type { CollectionMutations } from '@/collection/hooks/useCollectionMutations';

/**
 * Tri-state contribution intent for AddToCollectionDialog.
 *
 * 'none' is a client-side sentinel: when the user keeps "Don't contribute"
 * selected, the contribute API is never called. The wire format only accepts
 * 'training_only' | 'catalog_and_training'.
 */
type ContributeIntentChoice = 'none' | ContributeIntent;

interface AddToCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  itemName: string;
  alreadyOwned: boolean;
  mutations: CollectionMutations;
  onSuccess?: () => void;
  photoFile?: File;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AddToCollectionDialog({
  open,
  onOpenChange,
  itemId,
  itemName,
  alreadyOwned,
  mutations,
  onSuccess,
  photoFile,
}: AddToCollectionDialogProps) {
  const [packageCondition, setPackageCondition] = useState<PackageCondition>('unknown');
  const [itemCondition, setItemCondition] = useState(DEFAULT_ITEM_CONDITION);
  const [notes, setNotes] = useState('');
  const [savePhoto, setSavePhoto] = useState(true);
  const [contributeIntent, setContributeIntent] = useState<ContributeIntentChoice>(DEFAULT_CONTRIBUTE_INTENT);
  const [isChaining, setIsChaining] = useState(false);

  useEffect(() => {
    if (open) {
      setPackageCondition('unknown');
      setItemCondition(DEFAULT_ITEM_CONDITION);
      setNotes('');
      setSavePhoto(true);
      setContributeIntent(DEFAULT_CONTRIBUTE_INTENT);
      setIsChaining(false);
    }
  }, [open]);

  // Reset contribute intent to the default whenever "Save this photo" is turned
  // off, so toggling save back on starts from the default (not a stale choice).
  const handleSavePhotoChange = (checked: boolean) => {
    setSavePhoto(checked);
    if (!checked) {
      setContributeIntent(DEFAULT_CONTRIBUTE_INTENT);
    }
  };

  // Object URL for photo preview thumbnail
  const previewUrl = useMemo(() => (photoFile ? URL.createObjectURL(photoFile) : null), [photoFile]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const isPending = mutations.add.isPending || isChaining;

  const handleSubmit = () => {
    mutations.add.mutate(
      {
        item_id: itemId,
        package_condition: packageCondition,
        item_condition: itemCondition,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: (createdItem) => {
          toast.success(`${itemName} added to your collection`);

          // Fast path: no photo to handle — close immediately
          if (!photoFile || !savePhoto) {
            onOpenChange(false);
            onSuccess?.();
            return;
          }

          // Chain: upload photo, then optionally contribute. Best-effort —
          // failures show their own toast but do not roll back the item.
          setIsChaining(true);
          void (async () => {
            try {
              const uploaded = await uploadCollectionPhoto(createdItem.id, photoFile, () => {});
              const newPhoto = uploaded[0];
              if (contributeIntent !== 'none' && newPhoto) {
                try {
                  await contributeCollectionPhoto(createdItem.id, newPhoto.id, CONSENT_VERSION, contributeIntent);
                  toast.success('Photo contributed for review');
                } catch (err) {
                  const message = err instanceof Error ? err.message : 'Failed to contribute photo';
                  toast.error(message);
                }
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Failed to upload photo';
              toast.error(message);
            } finally {
              setIsChaining(false);
              onOpenChange(false);
              onSuccess?.();
            }
          })();
        },
        onError: (err) => {
          toast.error(err.message);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{alreadyOwned ? 'Add Another Copy' : 'Add to Collection'}</DialogTitle>
          <DialogDescription>{itemName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <ConditionSelector value={packageCondition} onChange={setPackageCondition} disabled={isPending} />
          <ItemConditionSelector value={itemCondition} onChange={setItemCondition} disabled={isPending} />
          <NotesField id="collection-notes" value={notes} onChange={setNotes} disabled={isPending} />

          {photoFile && previewUrl && (
            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-sm font-medium text-foreground">Photo Options</p>

              <div className="flex items-center gap-3 rounded-md border border-border p-2">
                <img
                  src={previewUrl}
                  alt="Scanned photo preview"
                  className="h-12 w-12 rounded object-contain bg-muted"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{photoFile.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(photoFile.size)}</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Checkbox
                  id="save-photo"
                  checked={savePhoto}
                  onCheckedChange={(checked) => handleSavePhotoChange(checked === true)}
                  disabled={isPending}
                />
                <label htmlFor="save-photo" className="text-sm leading-tight cursor-pointer">
                  Save this photo to your collection item
                </label>
              </div>

              {savePhoto && (
                <div className="space-y-2 pl-6">
                  <p className="text-sm font-medium text-foreground">How should this photo be shared?</p>
                  <RadioGroup
                    value={contributeIntent}
                    onValueChange={(value) => setContributeIntent(value as ContributeIntentChoice)}
                    disabled={isPending}
                    className="gap-2"
                  >
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value="none" id="contribute-none" className="mt-0.5" />
                      <label htmlFor="contribute-none" className="text-sm leading-tight cursor-pointer">
                        Don&apos;t contribute
                      </label>
                    </div>
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value="training_only" id="contribute-training" className="mt-0.5" />
                      <label htmlFor="contribute-training" className="text-sm leading-tight cursor-pointer">
                        <span className="font-medium text-foreground">Training only</span>
                        <span className="block text-xs text-muted-foreground">
                          Used to train the ML model. Not shown in the public catalog.
                        </span>
                      </label>
                    </div>
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value="catalog_and_training" id="contribute-catalog" className="mt-0.5" />
                      <label htmlFor="contribute-catalog" className="text-sm leading-tight cursor-pointer">
                        <span className="font-medium text-foreground">Catalog + training</span>
                        <span className="block text-xs text-muted-foreground">
                          Visible in the public catalog AND used for ML training.
                        </span>
                      </label>
                    </div>
                  </RadioGroup>
                </div>
              )}

              {savePhoto && contributeIntent !== 'none' && (
                <div className="rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
                  By contributing, {LICENSE_GRANT_TEXT}. Contributions are pending curator review and can be revoked
                  later.
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600"
          >
            {isPending ? 'Adding...' : 'Add to Collection'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
