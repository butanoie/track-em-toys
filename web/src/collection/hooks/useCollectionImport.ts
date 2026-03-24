import { useMutation, useQueryClient } from '@tanstack/react-query';
import { importCollection } from '@/collection/api';
import type { CollectionExportPayload, CollectionImportResponse, ImportMode } from '@/lib/zod-schemas';

export interface ImportVariables {
  data: CollectionExportPayload;
  mode: ImportMode;
}

export function useCollectionImport() {
  const queryClient = useQueryClient();

  return useMutation<CollectionImportResponse, Error, ImportVariables>({
    mutationFn: ({ data, mode }) => importCollection(data, mode),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collection'] });
    },
  });
}
