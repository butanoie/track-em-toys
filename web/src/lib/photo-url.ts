export const PHOTO_BASE_URL = import.meta.env.VITE_PHOTO_BASE_URL ?? '';

export function buildPhotoUrl(relativeUrl: string): string {
  if (!PHOTO_BASE_URL) return relativeUrl;
  const base = PHOTO_BASE_URL.replace(/\/+$/, '');
  const path = relativeUrl.replace(/^\/+/, '');
  return `${base}/${path}`;
}
