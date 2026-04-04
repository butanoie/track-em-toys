import { apiFetchJson, apiFetch, throwApiError, API_BASE, attemptRefresh } from '@/lib/api-client';
import { authStore } from '@/lib/auth-store';
import { DuplicateUploadError } from '@/catalog/photos/api';
import {
  CollectionPhotosResponseSchema,
  CollectionPhotoListResponseSchema,
  SetPrimaryCollectionPhotoResponseSchema,
  ReorderCollectionPhotosResponseSchema,
  ContributePhotoResponseSchema,
  RevokeContributionResponseSchema,
  DuplicatePhotoResponseSchema,
  type CollectionPhoto,
  type CollectionPhotoListItem,
} from '@/lib/zod-schemas';

export { buildPhotoUrl, PHOTO_BASE_URL } from '@/lib/photo-url';
export { validateFile, DuplicateUploadError } from '@/catalog/photos/api';

export interface UploadProgress {
  percent: number;
}

function collectionPhotoPath(collectionItemId: string): string {
  return `/collection/${encodeURIComponent(collectionItemId)}/photos`;
}

export function uploadCollectionPhoto(
  collectionItemId: string,
  file: File,
  onProgress: (p: UploadProgress) => void
): Promise<CollectionPhoto[]> {
  return doUpload(collectionItemId, file, onProgress, false);
}

function doUpload(
  collectionItemId: string,
  file: File,
  onProgress: (p: UploadProgress) => void,
  isRetry: boolean
): Promise<CollectionPhoto[]> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}${collectionPhotoPath(collectionItemId)}`);
    xhr.withCredentials = true;

    const token = authStore.getToken();
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress({ percent: Math.round((e.loaded / e.total) * 100) });
      }
    };

    xhr.onload = () => {
      if (xhr.status === 201) {
        try {
          const json: unknown = JSON.parse(xhr.responseText);
          const parsed = CollectionPhotosResponseSchema.parse(json);
          resolve(parsed.photos);
        } catch {
          reject(new Error('Invalid upload response'));
        }
        return;
      }

      if (xhr.status === 401 && !isRetry) {
        void attemptRefresh()
          .then((refreshed) => {
            if (refreshed) {
              doUpload(collectionItemId, file, onProgress, true).then(resolve, reject);
            } else {
              reject(new Error('Authentication failed'));
            }
          })
          .catch((e: unknown) => {
            reject(e instanceof Error ? e : new Error('Auth refresh error'));
          });
        return;
      }

      if (xhr.status === 409) {
        try {
          const raw: unknown = JSON.parse(xhr.responseText);
          const parsed = DuplicatePhotoResponseSchema.safeParse(raw);
          if (parsed.success) {
            reject(new DuplicateUploadError(parsed.data.matched.id, parsed.data.matched.url));
            return;
          }
        } catch {
          // fall through to generic error
        }
      }

      reject(new Error(extractErrorMessage(xhr.responseText, xhr.status)));
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));

    const fd = new FormData();
    fd.append('file', file);
    xhr.send(fd);
  });
}

function extractErrorMessage(responseText: string, status: number): string {
  try {
    const raw: unknown = JSON.parse(responseText);
    if (typeof raw === 'object' && raw !== null && 'error' in raw) {
      const { error } = raw as { error: unknown };
      if (typeof error === 'string') return error;
    }
  } catch {
    // fall through to default
  }
  return `Upload failed (${status})`;
}

export async function listCollectionPhotos(collectionItemId: string): Promise<CollectionPhotoListItem[]> {
  const result = await apiFetchJson(collectionPhotoPath(collectionItemId), CollectionPhotoListResponseSchema);
  return result.photos;
}

export async function deleteCollectionPhoto(collectionItemId: string, photoId: string): Promise<void> {
  const response = await apiFetch(`${collectionPhotoPath(collectionItemId)}/${encodeURIComponent(photoId)}`, {
    method: 'DELETE',
  });
  if (!response.ok) await throwApiError(response);
}

export async function setPrimaryCollectionPhoto(collectionItemId: string, photoId: string): Promise<CollectionPhoto> {
  const result = await apiFetchJson(
    `${collectionPhotoPath(collectionItemId)}/${encodeURIComponent(photoId)}/primary`,
    SetPrimaryCollectionPhotoResponseSchema,
    { method: 'PATCH' }
  );
  return result.photo;
}

export async function reorderCollectionPhotos(
  collectionItemId: string,
  photos: Array<{ id: string; sort_order: number }>
): Promise<CollectionPhoto[]> {
  const result = await apiFetchJson(
    `${collectionPhotoPath(collectionItemId)}/reorder`,
    ReorderCollectionPhotosResponseSchema,
    { method: 'PATCH', body: JSON.stringify({ photos }) }
  );
  return result.photos;
}

export async function contributeCollectionPhoto(
  collectionItemId: string,
  photoId: string,
  consentVersion: string
): Promise<string> {
  const result = await apiFetchJson(
    `${collectionPhotoPath(collectionItemId)}/${encodeURIComponent(photoId)}/contribute`,
    ContributePhotoResponseSchema,
    {
      method: 'POST',
      body: JSON.stringify({ consent_version: consentVersion, consent_acknowledged: true }),
    }
  );
  return result.contribution_id;
}

export async function revokeCollectionPhotoContribution(collectionItemId: string, photoId: string): Promise<boolean> {
  const result = await apiFetchJson(
    `${collectionPhotoPath(collectionItemId)}/${encodeURIComponent(photoId)}/contribution`,
    RevokeContributionResponseSchema,
    { method: 'DELETE' }
  );
  return result.revoked;
}
