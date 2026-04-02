import { useQuery } from '@tanstack/react-query';
import { listMlModels } from '@/collection/api';

export function useMlModels() {
  return useQuery({
    queryKey: ['ml', 'models'],
    queryFn: listMlModels,
    staleTime: 5 * 60_000,
  });
}
