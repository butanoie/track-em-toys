import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteCollectionPhoto, setPrimaryCollectionPhoto, reorderCollectionPhotos } from './api';
import type { CollectionPhoto } from '@/lib/zod-schemas';

export function useCollectionPhotoMutations(collectionItemId: string) {
  const queryClient = useQueryClient();

  const invalidateCollection = () => {
    void queryClient.invalidateQueries({ queryKey: ['collection'] });
  };

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: (photoId) => deleteCollectionPhoto(collectionItemId, photoId),
    onSuccess: invalidateCollection,
  });

  const setPrimaryMutation = useMutation<CollectionPhoto, Error, string>({
    mutationFn: (photoId) => setPrimaryCollectionPhoto(collectionItemId, photoId),
    onSuccess: invalidateCollection,
  });

  const reorderMutation = useMutation<CollectionPhoto[], Error, Array<{ id: string; sort_order: number }>>({
    mutationFn: (photos) => reorderCollectionPhotos(collectionItemId, photos),
    onSuccess: invalidateCollection,
  });

  return { deleteMutation, setPrimaryMutation, reorderMutation };
}

export type CollectionPhotoMutations = ReturnType<typeof useCollectionPhotoMutations>;
