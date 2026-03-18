import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { AdminUsersPage } from '@/admin/users/AdminUsersPage';

const adminUsersSearchSchema = z.object({
  role: z.enum(['user', 'curator', 'admin']).optional().catch(undefined),
  email: z.string().optional().catch(undefined),
  limit: z.coerce.number().int().min(1).max(100).optional().catch(undefined),
  offset: z.coerce.number().int().min(0).optional().catch(undefined),
});

export const Route = createFileRoute('/_authenticated/admin/users')({
  validateSearch: adminUsersSearchSchema,
  pendingComponent: AdminUsersPending,
  component: AdminUsersPage,
});

function AdminUsersPending() {
  return (
    <div className="flex items-center justify-center py-16">
      <div
        role="status"
        aria-label="Loading"
        className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"
      />
    </div>
  );
}
