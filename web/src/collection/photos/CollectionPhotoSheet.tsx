import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ConfirmDialog } from '@/admin/components/ConfirmDialog';
import { DropZone } from '@/catalog/photos/DropZone';
import { UploadQueue } from '@/catalog/photos/UploadQueue';
import { PhotoGrid } from '@/catalog/photos/PhotoGrid';
import { ContributeDialog } from './ContributeDialog';
import { useCollectionPhotoUpload } from './useCollectionPhotoUpload';
import { useCollectionPhotoMutations } from './useCollectionPhotoMutations';
import { listCollectionPhotos } from './api';
import type { CollectionPhotoListItem, ContributeIntent } from '@/lib/zod-schemas';

interface CollectionPhotoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionItemId: string;
  collectionItemName: string;
}

export function CollectionPhotoSheet({
  open,
  onOpenChange,
  collectionItemId,
  collectionItemName,
}: CollectionPhotoSheetProps) {
  const [photos, setPhotos] = useState<CollectionPhotoListItem[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [contributeTarget, setContributeTarget] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { deleteMutation, setPrimaryMutation, reorderMutation, contributeMutation } =
    useCollectionPhotoMutations(collectionItemId);

  const refreshPhotos = useCallback(async () => {
    try {
      const result = await listCollectionPhotos(collectionItemId);
      setPhotos(result);
    } catch {
      // photo list fetch failed — keep stale data
    }
  }, [collectionItemId]);

  const invalidateCollection = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['collection'] });
    void refreshPhotos();
  }, [queryClient, refreshPhotos]);

  const {
    items: uploadItems,
    isUploading,
    uploadFiles,
    dismissItem,
  } = useCollectionPhotoUpload({
    collectionItemId,
    onUploadComplete: invalidateCollection,
  });

  // Fetch photos when sheet opens
  useEffect(() => {
    if (open) {
      void refreshPhotos();
    }
  }, [open, refreshPhotos]);

  const handleSetPrimary = useCallback(
    (photoId: string) => {
      setPrimaryMutation.mutate(photoId, {
        onSuccess: () => {
          void refreshPhotos();
        },
        onError: () => {
          toast.error('Failed to set primary photo');
        },
      });
    },
    [setPrimaryMutation, refreshPhotos]
  );

  const handleReorder = useCallback(
    (orderedPhotos: Array<{ id: string; sort_order: number }>) => {
      reorderMutation.mutate(orderedPhotos, {
        onSuccess: () => {
          void refreshPhotos();
        },
        onError: () => {
          toast.error('Failed to reorder photos');
        },
      });
    },
    [reorderMutation, refreshPhotos]
  );

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget, {
      onSuccess: () => {
        setDeleteTarget(null);
        toast.success('Photo deleted');
        void refreshPhotos();
      },
      onError: () => {
        setDeleteTarget(null);
        toast.error('Failed to delete photo');
      },
    });
  }, [deleteTarget, deleteMutation, refreshPhotos]);

  const handleConfirmContribute = useCallback(
    (intent: ContributeIntent) => {
      if (!contributeTarget) return;
      contributeMutation.mutate(
        { photoId: contributeTarget, intent },
        {
          onSuccess: () => {
            setContributeTarget(null);
            toast.success('Photo contributed for review');
            void refreshPhotos();
          },
          onError: () => {
            setContributeTarget(null);
            toast.error('Failed to contribute photo');
          },
        }
      );
    },
    [contributeTarget, contributeMutation, refreshPhotos]
  );

  const contributePhotoUrl = contributeTarget ? (photos.find((p) => p.id === contributeTarget)?.url ?? null) : null;

  const photoLabel = photos.length === 1 ? '1 photo' : `${photos.length} photos`;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="sm:max-w-3xl w-full flex flex-col">
          <SheetHeader>
            <SheetTitle>Manage Photos</SheetTitle>
            <SheetDescription>
              {collectionItemName} &middot; {photoLabel}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto space-y-6 py-4">
            <div className="space-y-2">
              <DropZone onFilesSelected={uploadFiles} disabled={isUploading} />
              <UploadQueue items={uploadItems} onDismiss={dismissItem} />
            </div>

            <PhotoGrid
              photos={photos}
              onReorder={handleReorder}
              onSetPrimary={handleSetPrimary}
              onDelete={setDeleteTarget}
              onContribute={setContributeTarget}
              disabled={isUploading}
            />
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeleteTarget(null);
        }}
        title="Delete photo?"
        description="This photo will be permanently removed. This action cannot be undone."
        confirmLabel="Delete Photo"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        isPending={deleteMutation.isPending}
      />

      <ContributeDialog
        open={contributeTarget !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setContributeTarget(null);
        }}
        photoUrl={contributePhotoUrl}
        onConfirm={handleConfirmContribute}
        isPending={contributeMutation.isPending}
      />
    </>
  );
}
