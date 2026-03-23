import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AddToCollectionDialog } from '@/collection/components/AddToCollectionDialog';
import type { CollectionCheckEntry } from '@/lib/zod-schemas';
import type { CollectionMutations } from '@/collection/hooks/useCollectionMutations';

interface AddToCollectionButtonProps {
  item: { id: string; name: string };
  checkResult: CollectionCheckEntry | undefined;
  mutations: CollectionMutations;
}

export function AddToCollectionButton({ item, checkResult, mutations }: AddToCollectionButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const count = checkResult?.count ?? 0;
  const alreadyOwned = count > 0;

  return (
    <>
      <div className="flex items-center gap-3">
        {alreadyOwned && (
          <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <Check className="h-3 w-3" />
            In collection ({count})
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1" />
          {alreadyOwned ? 'Add Copy' : 'Add to Collection'}
        </Button>
      </div>

      <AddToCollectionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        itemId={item.id}
        itemName={item.name}
        alreadyOwned={alreadyOwned}
        mutations={mutations}
      />
    </>
  );
}
