import { useMutation, useQueryClient } from '@tanstack/react-query';
import { patchUserRole, deactivateUser, reactivateUser, gdprPurgeUser } from '@/admin/api';
import type { AdminUserRow, UserRole } from '@/lib/zod-schemas';

export function useAdminUserMutations() {
  const queryClient = useQueryClient();

  const invalidateUsers = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
  };

  const patchRole = useMutation<AdminUserRow, Error, { id: string; role: UserRole }>({
    mutationFn: ({ id, role }) => patchUserRole(id, role),
    onSuccess: invalidateUsers,
  });

  const deactivate = useMutation<AdminUserRow, Error, string>({
    mutationFn: (id) => deactivateUser(id),
    onSuccess: invalidateUsers,
  });

  const reactivate = useMutation<AdminUserRow, Error, string>({
    mutationFn: (id) => reactivateUser(id),
    onSuccess: invalidateUsers,
  });

  const purge = useMutation<void, Error, string>({
    mutationFn: (id) => gdprPurgeUser(id),
    onSuccess: invalidateUsers,
  });

  return { patchRole, deactivate, reactivate, purge };
}

export type AdminUserMutations = ReturnType<typeof useAdminUserMutations>;
