import { apiFetch, apiFetchJson, throwApiError } from '@/lib/api-client';
import {
  PhotoApprovalListResponseSchema,
  PhotoApprovalDecisionResponseSchema,
  PhotoApprovalConflictResponseSchema,
  PhotoApprovalCountResponseSchema,
  type PhotoApprovalListResponse,
  type PhotoApprovalDecisionResponse,
  type PhotoApprovalCountResponse,
  type RejectionReasonCode,
} from '@/lib/zod-schemas';

export interface DecidePhotoBody {
  status: 'approved' | 'rejected' | 'pending';
  expected_status?: 'pending' | 'approved' | 'rejected';
  visibility?: 'training_only';
  rejection_reason_code?: RejectionReasonCode;
  rejection_reason_text?: string;
}

/**
 * Discriminated union returned by `decidePhoto`.
 *
 * The 200 path returns `{ conflict: false, data }`. The 409 path returns
 * `{ conflict: true, current_status }`. We model 409 as a *value*, not an
 * exception, because the conflict body's `current_status` field carries
 * information the caller needs (the actual current status of the photo) —
 * and `apiFetchJson` would otherwise route the response through
 * `throwApiError`, which parses the body via `ApiErrorSchema = { error }`
 * and silently strips the `current_status` field.
 *
 * All other non-2xx responses still throw `ApiError` via `throwApiError`.
 */
export type DecideResult =
  | { conflict: false; data: PhotoApprovalDecisionResponse }
  | { conflict: true; current_status: 'pending' | 'approved' | 'rejected'; error: string };

export function listPendingPhotos(): Promise<PhotoApprovalListResponse> {
  return apiFetchJson('/admin/photos/pending', PhotoApprovalListResponseSchema);
}

export function getPendingPhotoCount(): Promise<PhotoApprovalCountResponse> {
  return apiFetchJson('/admin/photos/pending-count', PhotoApprovalCountResponseSchema);
}

export async function decidePhoto(id: string, body: DecidePhotoBody): Promise<DecideResult> {
  const response = await apiFetch(`/admin/photos/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

  if (response.status === 409) {
    const raw: unknown = await response.json();
    const parsed = PhotoApprovalConflictResponseSchema.parse(raw);
    return { conflict: true, current_status: parsed.current_status, error: parsed.error };
  }

  if (!response.ok) {
    await throwApiError(response);
  }

  const json: unknown = await response.json();
  return { conflict: false, data: PhotoApprovalDecisionResponseSchema.parse(json) };
}
