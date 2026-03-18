import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { AdminUsersPage } from '@/admin/users/AdminUsersPage';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const adminUsersSearchSchema = z.object({
  role: z.enum(['user', 'curator', 'admin']).optional().catch(undefined),
  email: z.string().optional().catch(undefined),
  limit: z.coerce.number().int().min(1).max(100).optional().catch(undefined),
  offset: z.coerce.number().int().min(0).optional().catch(undefined),
});

export const Route = createFileRoute('/_authenticated/admin/users')({
  validateSearch: adminUsersSearchSchema,
  pendingComponent: () => <LoadingSpinner className="py-16" />,
  component: AdminUsersPage,
});
