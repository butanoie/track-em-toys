import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  deleteCollectionPhoto,
  setPrimaryCollectionPhoto,
  reorderCollectionPhotos,
  contributeCollectionPhoto,
  revokeCollectionPhotoContribution,
} from './api';
import { CONSENT_VERSION } from './consent';
import type { CollectionPhoto, ContributeIntent } from '@/lib/zod-schemas';

interface ContributeVariables {
  photoId: string;
  intent: ContributeIntent;
}

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

  const contributeMutation = useMutation<string, Error, ContributeVariables>({
    mutationFn: ({ photoId, intent }) => contributeCollectionPhoto(collectionItemId, photoId, CONSENT_VERSION, intent),
    onSuccess: invalidateCollection,
  });

  const revokeMutation = useMutation<boolean, Error, string>({
    mutationFn: (photoId) => revokeCollectionPhotoContribution(collectionItemId, photoId),
    onSuccess: invalidateCollection,
  });

  return { deleteMutation, setPrimaryMutation, reorderMutation, contributeMutation, revokeMutation };
}

export type CollectionPhotoMutations = ReturnType<typeof useCollectionPhotoMutations>;
