import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ConfirmDialog } from '@/admin/components/ConfirmDialog';
import type { Photo } from '@/lib/zod-schemas';
import { DropZone } from './DropZone';
import { UploadQueue } from './UploadQueue';
import { PhotoGrid } from './PhotoGrid';
import { usePhotoUpload } from './usePhotoUpload';
import { usePhotoMutations } from './usePhotoMutations';

interface PhotoManagementSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  franchise: string;
  itemSlug: string;
  itemName: string;
  photos: Photo[];
}

export function PhotoManagementSheet({
  open,
  onOpenChange,
  franchise,
  itemSlug,
  itemName,
  photos,
}: PhotoManagementSheetProps) {
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { deleteMutation, setPrimaryMutation, reorderMutation } = usePhotoMutations(franchise, itemSlug);

  const invalidateItem = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['catalog', 'items', franchise, itemSlug] });
  }, [queryClient, franchise, itemSlug]);

  const {
    items: uploadItems,
    isUploading,
    uploadFiles,
    dismissItem,
  } = usePhotoUpload({
    franchise,
    itemSlug,
    onUploadComplete: invalidateItem,
  });

  const handleSetPrimary = useCallback(
    (photoId: string) => {
      setPrimaryMutation.mutate(photoId, {
        onError: () => {
          toast.error('Failed to set primary photo');
        },
      });
    },
    [setPrimaryMutation]
  );

  const handleReorder = useCallback(
    (orderedPhotos: Array<{ id: string; sort_order: number }>) => {
      reorderMutation.mutate(orderedPhotos, {
        onError: () => {
          toast.error('Failed to reorder photos');
        },
      });
    },
    [reorderMutation]
  );

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget, {
      onSuccess: () => {
        setDeleteTarget(null);
        toast.success('Photo deleted');
      },
      onError: () => {
        setDeleteTarget(null);
        toast.error('Failed to delete photo');
      },
    });
  }, [deleteTarget, deleteMutation]);

  const photoLabel = photos.length === 1 ? '1 photo' : `${photos.length} photos`;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="sm:max-w-lg w-full flex flex-col">
          <SheetHeader>
            <SheetTitle>Manage Photos</SheetTitle>
            <SheetDescription>
              {itemName} &middot; {photoLabel}
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
        description="This photo will be permanently removed from the catalog item. This action cannot be undone."
        confirmLabel="Delete Photo"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        isPending={deleteMutation.isPending}
      />
    </>
  );
}
