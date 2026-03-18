import { useCallback, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Route } from '@/routes/_authenticated/admin/users';
import { useAdminUsers } from '@/admin/hooks/useAdminUsers';
import { useAdminUserMutations } from '@/admin/hooks/useAdminUserMutations';
import { ConfirmDialog } from '@/admin/components/ConfirmDialog';
import { Pagination } from '@/admin/components/Pagination';
import { UserFilters } from './UserFilters';
import { UserRowActions } from './UserRowActions';
import { type PendingAction, getMutationErrorMessage, isBannerError } from './types';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AdminUserRow } from '@/lib/zod-schemas';

const DEFAULT_LIMIT = 20;

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
    >
      {message}
    </div>
  );
}

function roleBadgeClass(role: string): string {
  switch (role) {
    case 'admin':
      return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    case 'curator':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

function statusBadge(row: AdminUserRow) {
  if (row.deleted_at) {
    return <Badge variant="destructive">Purged</Badge>;
  }
  if (row.deactivated_at) {
    return (
      <Badge variant="outline" className="border-amber-300 text-amber-700">
        Deactivated
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-green-300 text-green-700">
      Active
    </Badge>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function pendingActionTitle(action: PendingAction): string {
  switch (action.type) {
    case 'role_change':
      return 'Change User Role';
    case 'deactivate':
      return 'Deactivate User';
    case 'reactivate':
      return 'Reactivate User';
    case 'purge':
      return 'GDPR Purge — Permanent Deletion';
  }
}

function pendingActionDescription(action: PendingAction): string {
  const name = action.user.email ?? action.user.display_name ?? 'this user';
  switch (action.type) {
    case 'role_change':
      return `Change ${name}'s role from "${action.user.role}" to "${action.newRole}"?`;
    case 'deactivate':
      return `Deactivate ${name}? They will be unable to sign in until reactivated. All active sessions will be revoked.`;
    case 'reactivate':
      return `Reactivate ${name}? They will be able to sign in again via OAuth.`;
    case 'purge':
      return `Permanently delete all personal data for ${name}. This action cannot be undone. Email, name, and avatar will be scrubbed. Auth data will be hard-deleted.`;
  }
}

export function AdminUsersPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const limit = search.limit ?? DEFAULT_LIMIT;
  const offset = search.offset ?? 0;
  const emailFilter = search.email ?? '';
  const roleFilter = search.role ?? '';

  const { data, isPending, isError, error } = useAdminUsers({
    role: search.role,
    email: search.email || undefined,
    limit,
    offset,
  });

  const mutations = useAdminUserMutations();

  const setSearch = useCallback(
    (updates: Record<string, string | number | undefined>) => {
      void navigate({
        to: '/admin/users',
        search: (prev) => {
          const next = { ...prev, ...updates };
          for (const [key, value] of Object.entries(next)) {
            if (value === '' || value === undefined) {
              delete (next as Record<string, unknown>)[key];
            }
          }
          return next;
        },
      });
    },
    [navigate]
  );

  const handleEmailChange = useCallback(
    (email: string) => setSearch({ email: email || undefined, offset: 0 }),
    [setSearch]
  );

  const handleRoleChange = useCallback(
    (role: string) => setSearch({ role: role || undefined, offset: 0 }),
    [setSearch]
  );

  const handlePageChange = useCallback((newOffset: number) => setSearch({ offset: newOffset }), [setSearch]);

  function handleConfirm() {
    if (!pendingAction) return;
    setActionError(null);

    const name = pendingAction.user.email ?? pendingAction.user.display_name ?? 'User';

    const onSuccess = () => {
      setPendingAction(null);
      switch (pendingAction.type) {
        case 'role_change':
          toast.success(`Role updated to ${pendingAction.newRole} for ${name}`);
          break;
        case 'deactivate':
          toast.success(`${name} deactivated`);
          break;
        case 'reactivate':
          toast.success(`${name} reactivated`);
          break;
        case 'purge':
          toast.success(`User data purged permanently`);
          break;
      }
    };

    const onError = (err: Error) => {
      if (isBannerError(err)) {
        setActionError(getMutationErrorMessage(err));
        setPendingAction(null);
      } else {
        toast.error('Action failed. Please try again.');
        // Keep purge dialog open on transient errors to preserve typed confirmation
        setPendingAction((prev) => (prev?.type === 'purge' ? prev : null));
      }
    };

    switch (pendingAction.type) {
      case 'role_change':
        mutations.patchRole.mutate({ id: pendingAction.user.id, role: pendingAction.newRole }, { onSuccess, onError });
        break;
      case 'deactivate':
        mutations.deactivate.mutate(pendingAction.user.id, { onSuccess, onError });
        break;
      case 'reactivate':
        mutations.reactivate.mutate(pendingAction.user.id, { onSuccess, onError });
        break;
      case 'purge':
        mutations.purge.mutate(pendingAction.user.id, { onSuccess, onError });
        break;
    }
  }

  const isActionPending =
    mutations.patchRole.isPending ||
    mutations.deactivate.isPending ||
    mutations.reactivate.isPending ||
    mutations.purge.isPending;

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage user accounts and roles</p>
        </div>

        {actionError && <ErrorBanner message={actionError} />}

        <UserFilters
          email={emailFilter}
          role={roleFilter}
          onEmailChange={handleEmailChange}
          onRoleChange={handleRoleChange}
        />

        {isError && <ErrorBanner message={error instanceof Error ? error.message : 'Failed to load users.'} />}

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending && !data && (
                <>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={5}>
                        <div className="h-6 bg-muted animate-pulse rounded" />
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              )}

              {data && data.data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No users found matching your filters.
                  </TableCell>
                </TableRow>
              )}

              {data?.data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">
                        {row.deleted_at ? 'Deleted user' : (row.display_name ?? '—')}
                      </div>
                      <div className="text-xs text-muted-foreground">{row.deleted_at ? '—' : (row.email ?? '—')}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={roleBadgeClass(row.role)}>
                      {row.role}
                    </Badge>
                  </TableCell>
                  <TableCell>{statusBadge(row)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(row.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <UserRowActions
                      row={row}
                      mutations={mutations}
                      onAction={(action) => {
                        setActionError(null);
                        setPendingAction(action);
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {data && data.total_count > 0 && (
          <Pagination
            total={data.total_count}
            limit={data.limit}
            offset={data.offset}
            onPageChange={handlePageChange}
          />
        )}
      </div>

      {pendingAction && (
        <ConfirmDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setPendingAction(null);
          }}
          title={pendingActionTitle(pendingAction)}
          description={pendingActionDescription(pendingAction)}
          confirmText={pendingAction.type === 'purge' ? 'DELETE' : undefined}
          confirmLabel={pendingAction.type === 'purge' ? 'Purge User' : 'Confirm'}
          variant={pendingAction.type === 'purge' ? 'destructive' : 'default'}
          onConfirm={handleConfirm}
          isPending={isActionPending}
        />
      )}
    </>
  );
}
