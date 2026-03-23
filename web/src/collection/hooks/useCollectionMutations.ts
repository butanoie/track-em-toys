import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addCollectionItem, patchCollectionItem, deleteCollectionItem, restoreCollectionItem } from '@/collection/api';
import type { CollectionItem, CollectionCondition } from '@/lib/zod-schemas';

export function useCollectionMutations() {
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['collection'] });
  };

  const add = useMutation<CollectionItem, Error, { item_id: string; condition?: CollectionCondition; notes?: string }>({
    mutationFn: (body) => addCollectionItem(body),
    onSuccess: invalidateAll,
  });

  const patch = useMutation<
    CollectionItem,
    Error,
    { id: string; condition?: CollectionCondition; notes?: string | null }
  >({
    mutationFn: ({ id, ...body }) => patchCollectionItem(id, body),
    onSuccess: invalidateAll,
  });

  const remove = useMutation<void, Error, string>({
    mutationFn: (id) => deleteCollectionItem(id),
    onSuccess: invalidateAll,
  });

  const restore = useMutation<CollectionItem, Error, string>({
    mutationFn: (id) => restoreCollectionItem(id),
    onSuccess: invalidateAll,
  });

  return { add, patch, remove, restore };
}

export type CollectionMutations = ReturnType<typeof useCollectionMutations>;
