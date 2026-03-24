import { useMutation, useQueryClient } from '@tanstack/react-query';
import { importCollection } from '@/collection/api';
import type { CollectionExportPayload, CollectionImportResponse } from '@/lib/zod-schemas';

export function useCollectionImport() {
  const queryClient = useQueryClient();

  return useMutation<CollectionImportResponse, Error, CollectionExportPayload>({
    mutationFn: importCollection,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collection'] });
    },
  });
}
