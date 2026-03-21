import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deletePhoto, setPrimaryPhoto, reorderPhotos } from './api';
import type { PhotoWriteItem } from '@/lib/zod-schemas';

export function usePhotoMutations(franchise: string, slug: string) {
  const queryClient = useQueryClient();

  const invalidateItem = () => {
    void queryClient.invalidateQueries({ queryKey: ['catalog', 'items', franchise, slug] });
  };

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: (photoId) => deletePhoto(franchise, slug, photoId),
    onSuccess: invalidateItem,
  });

  const setPrimaryMutation = useMutation<PhotoWriteItem, Error, string>({
    mutationFn: (photoId) => setPrimaryPhoto(franchise, slug, photoId),
    onSuccess: invalidateItem,
  });

  const reorderMutation = useMutation<PhotoWriteItem[], Error, Array<{ id: string; sort_order: number }>>({
    mutationFn: (photos) => reorderPhotos(franchise, slug, photos),
    onSuccess: invalidateItem,
  });

  return { deleteMutation, setPrimaryMutation, reorderMutation };
}

export type PhotoMutations = ReturnType<typeof usePhotoMutations>;
