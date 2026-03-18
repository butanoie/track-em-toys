import { apiFetch, apiFetchJson, ApiError } from '@/lib/api-client';
import {
  AdminUsersListSchema,
  AdminUserRowSchema,
  ApiErrorSchema,
  type AdminUsersList,
  type AdminUserRow,
  type UserRole,
} from '@/lib/zod-schemas';

export interface AdminUsersParams {
  role?: UserRole;
  email?: string;
  limit: number;
  offset: number;
}

export async function listAdminUsers(params: AdminUsersParams): Promise<AdminUsersList> {
  const searchParams = new URLSearchParams();
  if (params.role) searchParams.set('role', params.role);
  if (params.email) searchParams.set('email', params.email);
  searchParams.set('limit', String(params.limit));
  searchParams.set('offset', String(params.offset));

  return apiFetchJson(`/admin/users?${searchParams.toString()}`, AdminUsersListSchema);
}

export async function patchUserRole(id: string, role: UserRole): Promise<AdminUserRow> {
  return apiFetchJson(`/admin/users/${id}/role`, AdminUserRowSchema, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export async function deactivateUser(id: string): Promise<AdminUserRow> {
  return apiFetchJson(`/admin/users/${id}/deactivate`, AdminUserRowSchema, {
    method: 'POST',
  });
}

export async function reactivateUser(id: string): Promise<AdminUserRow> {
  return apiFetchJson(`/admin/users/${id}/reactivate`, AdminUserRowSchema, {
    method: 'POST',
  });
}

export async function gdprPurgeUser(id: string): Promise<void> {
  const response = await apiFetch(`/admin/users/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    let body: { error: string };
    try {
      const raw: unknown = await response.json();
      const parsed = ApiErrorSchema.safeParse(raw);
      body = parsed.success ? parsed.data : { error: `HTTP ${response.status}` };
    } catch {
      body = { error: `HTTP ${response.status}` };
    }
    throw new ApiError(response.status, body);
  }
}
