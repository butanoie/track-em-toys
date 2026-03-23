import { useEffect, useState } from 'react';
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
import { ConditionSelector } from '@/collection/components/ConditionSelector';
import { NotesField } from '@/collection/components/NotesField';
import type { CollectionCondition } from '@/lib/zod-schemas';
import type { CollectionMutations } from '@/collection/hooks/useCollectionMutations';

interface AddToCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  itemName: string;
  alreadyOwned: boolean;
  mutations: CollectionMutations;
}

export function AddToCollectionDialog({
  open,
  onOpenChange,
  itemId,
  itemName,
  alreadyOwned,
  mutations,
}: AddToCollectionDialogProps) {
  const [condition, setCondition] = useState<CollectionCondition>('unknown');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      setCondition('unknown');
      setNotes('');
    }
  }, [open]);

  const handleSubmit = () => {
    mutations.add.mutate(
      { item_id: itemId, condition, notes: notes.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(`${itemName} added to your collection`);
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(err.message);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{alreadyOwned ? 'Add Another Copy' : 'Add to Collection'}</DialogTitle>
          <DialogDescription>{itemName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <ConditionSelector value={condition} onChange={setCondition} disabled={mutations.add.isPending} />
          <NotesField id="collection-notes" value={notes} onChange={setNotes} disabled={mutations.add.isPending} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={mutations.add.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600"
          >
            {mutations.add.isPending ? 'Adding...' : 'Add to Collection'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
