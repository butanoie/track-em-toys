import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { listAdminUsers, type AdminUsersParams } from '@/admin/api';
import type { AdminUsersList } from '@/lib/zod-schemas';

export function useAdminUsers(params: AdminUsersParams) {
  return useQuery<AdminUsersList>({
    queryKey: ['admin', 'users', params],
    queryFn: () => listAdminUsers(params),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
