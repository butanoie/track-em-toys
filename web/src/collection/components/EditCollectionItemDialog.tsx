import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ConditionSelector } from '@/collection/components/ConditionSelector';
import { ItemConditionSelector } from '@/collection/components/ItemConditionSelector';
import { NotesField } from '@/collection/components/NotesField';
import { DEFAULT_ITEM_CONDITION } from '@/collection/lib/item-condition-config';
import type { PackageCondition, CollectionItem } from '@/lib/zod-schemas';
import type { CollectionMutations } from '@/collection/hooks/useCollectionMutations';

interface EditCollectionItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CollectionItem | null;
  mutations: CollectionMutations;
}

export function EditCollectionItemDialog({ open, onOpenChange, item, mutations }: EditCollectionItemDialogProps) {
  const [packageCondition, setPackageCondition] = useState<PackageCondition>('unknown');
  const [itemCondition, setItemCondition] = useState(DEFAULT_ITEM_CONDITION);
  const [notes, setNotes] = useState('');

  // Reset form when the item changes (different item selected) or dialog opens
  useEffect(() => {
    if (item) {
      setPackageCondition(item.package_condition);
      setItemCondition(item.item_condition);
      setNotes(item.notes ?? '');
    }
  }, [item]);

  const handleSave = () => {
    if (!item) return;

    const body: { package_condition?: PackageCondition; item_condition?: number; notes?: string | null } = {};
    if (packageCondition !== item.package_condition) body.package_condition = packageCondition;
    if (itemCondition !== item.item_condition) body.item_condition = itemCondition;
    const trimmedNotes = notes.trim() || null;
    const initialNotes = item.notes?.trim() || null;
    if (trimmedNotes !== initialNotes) body.notes = trimmedNotes;

    if (Object.keys(body).length === 0) {
      onOpenChange(false);
      return;
    }

    mutations.patch.mutate(
      { id: item.id, ...body },
      {
        onSuccess: () => {
          toast.success('Collection entry updated');
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(err.message);
        },
      }
    );
  };

  const handleRemove = () => {
    if (!item) return;
    const removedItem = item;

    mutations.remove.mutate(removedItem.id, {
      onSuccess: () => {
        onOpenChange(false);
        toast('Removed from collection', {
          description: removedItem.item_name,
          action: {
            label: 'Undo',
            onClick: () => {
              mutations.restore.mutate(removedItem.id, {
                onSuccess: () => {
                  toast.success('Restored to collection');
                },
                onError: () => {
                  toast.error('Could not restore item');
                },
              });
            },
          },
          duration: 8000,
        });
      },
      onError: (err) => {
        toast.error(err.message);
      },
    });
  };

  const isPending = mutations.patch.isPending || mutations.remove.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Collection Entry</DialogTitle>
          <DialogDescription>{item?.item_name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <ConditionSelector value={packageCondition} onChange={setPackageCondition} disabled={isPending} />
          <ItemConditionSelector value={itemCondition} onChange={setItemCondition} disabled={isPending} />
          <NotesField id="edit-collection-notes" value={notes} onChange={setNotes} disabled={isPending} />
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="destructive" size="sm" onClick={handleRemove} disabled={isPending} className="sm:mr-auto">
            <Trash2 className="h-4 w-4 mr-1" />
            Remove
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {mutations.patch.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
