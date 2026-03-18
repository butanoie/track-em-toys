import { useAuth } from '@/auth/useAuth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { AdminUserRowSchema, type AdminUserRow } from '@/lib/zod-schemas';
import type { AdminUserMutations } from '@/admin/hooks/useAdminUserMutations';
import type { PendingAction } from './types';

interface UserRowActionsProps {
  row: AdminUserRow;
  mutations: AdminUserMutations;
  onAction: (action: PendingAction) => void;
}

const roleSchema = AdminUserRowSchema.shape.role;

export function UserRowActions({ row, mutations, onAction }: UserRowActionsProps) {
  const { user: currentUser } = useAuth();
  const isSelf = currentUser?.id === row.id;
  const isPurged = row.deleted_at !== null;
  const isDeactivated = row.deactivated_at !== null;

  const isRolePending = mutations.patchRole.isPending && mutations.patchRole.variables?.id === row.id;

  function handleRoleChange(value: string) {
    const parsed = roleSchema.safeParse(value);
    if (parsed.success && parsed.data !== row.role) {
      onAction({ type: 'role_change', user: row, newRole: parsed.data });
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={row.role} onValueChange={handleRoleChange} disabled={isSelf || isPurged || isRolePending}>
        <SelectTrigger className="w-28 h-8 text-xs" aria-label={`Change role for ${row.email ?? 'user'}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="user">User</SelectItem>
          <SelectItem value="curator">Curator</SelectItem>
          <SelectItem value="admin">Admin</SelectItem>
        </SelectContent>
      </Select>

      {!isPurged && !isSelf && (
        <>
          {isDeactivated ? (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8"
              onClick={() => onAction({ type: 'reactivate', user: row })}
            >
              Reactivate
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8"
              onClick={() => onAction({ type: 'deactivate', user: row })}
            >
              Deactivate
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            className="text-xs h-8"
            onClick={() => onAction({ type: 'purge', user: row })}
          >
            Purge
          </Button>
        </>
      )}
    </div>
  );
}
