import { apiFetchJson, apiFetch, throwApiError, API_BASE, attemptRefresh } from '@/lib/api-client';
import { authStore } from '@/lib/auth-store';
import {
  UploadPhotosResponseSchema,
  SetPrimaryResponseSchema,
  ReorderPhotosResponseSchema,
  DuplicatePhotoResponseSchema,
  type PhotoWriteItem,
} from '@/lib/zod-schemas';

/** Thrown when the API rejects an upload as a perceptual duplicate (409). */
export class DuplicateUploadError extends Error {
  constructor(
    public readonly matchedId: string,
    public readonly matchedUrl: string
  ) {
    super('A duplicate image has already been uploaded for this item');
    this.name = 'DuplicateUploadError';
  }
}

const PHOTO_BASE_URL = import.meta.env.VITE_PHOTO_BASE_URL ?? '';

export function buildPhotoUrl(relativeUrl: string): string {
  if (!PHOTO_BASE_URL) return relativeUrl;
  const base = PHOTO_BASE_URL.replace(/\/+$/, '');
  const path = relativeUrl.replace(/^\/+/, '');
  return `${base}/${path}`;
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export function validateFile(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return `${file.name} is not a supported image format`;
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `${file.name} exceeds the 10 MB limit`;
  }
  return null;
}

function photoPath(franchise: string, slug: string): string {
  return `/catalog/franchises/${encodeURIComponent(franchise)}/items/${encodeURIComponent(slug)}/photos`;
}

export interface UploadProgress {
  percent: number;
}

export function uploadPhoto(
  franchise: string,
  slug: string,
  file: File,
  onProgress: (p: UploadProgress) => void
): Promise<PhotoWriteItem[]> {
  return doUpload(franchise, slug, file, onProgress, false);
}

function doUpload(
  franchise: string,
  slug: string,
  file: File,
  onProgress: (p: UploadProgress) => void,
  isRetry: boolean
): Promise<PhotoWriteItem[]> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}${photoPath(franchise, slug)}`);
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
          const parsed = UploadPhotosResponseSchema.parse(json);
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
              doUpload(franchise, slug, file, onProgress, true).then(resolve, reject);
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

export async function deletePhoto(franchise: string, slug: string, photoId: string): Promise<void> {
  const response = await apiFetch(`${photoPath(franchise, slug)}/${encodeURIComponent(photoId)}`, {
    method: 'DELETE',
  });
  if (!response.ok) await throwApiError(response);
}

export async function setPrimaryPhoto(franchise: string, slug: string, photoId: string): Promise<PhotoWriteItem> {
  const result = await apiFetchJson(
    `${photoPath(franchise, slug)}/${encodeURIComponent(photoId)}/primary`,
    SetPrimaryResponseSchema,
    { method: 'PATCH' }
  );
  return result.photo;
}

export async function reorderPhotos(
  franchise: string,
  slug: string,
  photos: Array<{ id: string; sort_order: number }>
): Promise<PhotoWriteItem[]> {
  const result = await apiFetchJson(`${photoPath(franchise, slug)}/reorder`, ReorderPhotosResponseSchema, {
    method: 'PATCH',
    body: JSON.stringify({ photos }),
  });
  return result.photos;
}
