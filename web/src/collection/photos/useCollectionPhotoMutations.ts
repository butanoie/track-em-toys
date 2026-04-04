import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  deleteCollectionPhoto,
  setPrimaryCollectionPhoto,
  reorderCollectionPhotos,
  contributeCollectionPhoto,
  revokeCollectionPhotoContribution,
} from './api';
import type { CollectionPhoto } from '@/lib/zod-schemas';

const CONSENT_VERSION = '1.0';

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

  const contributeMutation = useMutation<string, Error, string>({
    mutationFn: (photoId) => contributeCollectionPhoto(collectionItemId, photoId, CONSENT_VERSION),
    onSuccess: invalidateCollection,
  });

  const revokeMutation = useMutation<boolean, Error, string>({
    mutationFn: (photoId) => revokeCollectionPhotoContribution(collectionItemId, photoId),
    onSuccess: invalidateCollection,
  });

  return { deleteMutation, setPrimaryMutation, reorderMutation, contributeMutation, revokeMutation };
}

export type CollectionPhotoMutations = ReturnType<typeof useCollectionPhotoMutations>;
