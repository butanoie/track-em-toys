/**
 * IndexedDB cache for ONNX model binaries. Downloads model files with progress
 * reporting and caches them for subsequent sessions.
 */

import type { ModelCacheEntry, DownloadProgress } from './types.js';

const DB_NAME = 'trackem-ml-models';
const DB_VERSION = 1;
const STORE_NAME = 'model-binaries';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'name' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error ?? new Error('IndexedDB open failed'));
    };
  });

  return dbPromise;
}

/**
 * Read a cached model entry from IndexedDB.
 *
 * @param name - Model name (e.g., "primary-classifier")
 * @returns Cached entry or null if not found / IndexedDB unavailable
 */
export async function getCachedModel(name: string): Promise<ModelCacheEntry | null> {
  try {
    const db = await openDb();
    return new Promise<ModelCacheEntry | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(name);
      request.onsuccess = () => {
        const result: unknown = request.result;
        if (result && typeof result === 'object' && 'version' in result) {
          resolve(result as ModelCacheEntry);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Store a model entry in IndexedDB.
 *
 * @param entry - Model cache entry to store
 */
export async function putCachedModel(entry: ModelCacheEntry): Promise<void> {
  try {
    const db = await openDb();
    return new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // IndexedDB unavailable — cache miss on next use, non-fatal
  }
}

/**
 * Download a file as ArrayBuffer with progress reporting via ReadableStream.
 *
 * @param url - URL to download
 * @param expectedSize - Expected total bytes (for progress calculation)
 * @param onProgress - Progress callback (loaded, total)
 */
async function downloadWithProgress(
  url: string,
  expectedSize: number,
  onProgress?: DownloadProgress
): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const contentLength = response.headers.get('Content-Length');
  const total = contentLength ? parseInt(contentLength, 10) : expectedSize;

  if (!response.body) {
    return response.arrayBuffer();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.(loaded, total);
  }

  const result = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result.buffer;
}

/**
 * Parse the label_map from a metadata JSON response.
 *
 * @param raw - Parsed JSON from the metadata URL
 * @returns label_map record, or null if invalid
 */
function parseLabelMap(raw: unknown): Record<string, string> | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.label_map !== 'object' || obj.label_map === null || Array.isArray(obj.label_map)) return null;
  const map = obj.label_map as Record<string, unknown>;
  if (!Object.values(map).every((v) => typeof v === 'string')) return null;
  return map as Record<string, string>;
}

interface ModelDownloadParams {
  name: string;
  version: string;
  downloadUrl: string;
  metadataUrl: string;
  sizeBytes: number;
}

/**
 * Load a model from IndexedDB cache or download it fresh. Returns the cache entry
 * containing graph bytes, data bytes, and label map.
 *
 * @param params - Model metadata needed for download
 * @param onProgress - Progress callback for download (loaded, total)
 */
export async function loadModel(params: ModelDownloadParams, onProgress?: DownloadProgress): Promise<ModelCacheEntry> {
  // Check cache
  const cached = await getCachedModel(params.name);
  if (cached && cached.version === params.version) {
    return cached;
  }

  // Fetch metadata for label map
  const metaResponse = await fetch(params.metadataUrl);
  if (!metaResponse.ok) {
    throw new Error(`Metadata fetch failed: ${metaResponse.status}`);
  }
  const metaJson: unknown = await metaResponse.json();
  const labelMap = parseLabelMap(metaJson);
  if (!labelMap) {
    throw new Error('Invalid model metadata: missing or malformed label_map');
  }

  // Download .onnx graph file
  const graphBytes = await downloadWithProgress(params.downloadUrl, params.sizeBytes, onProgress);

  // Download .onnx.data sidecar (weights)
  const dataUrl = params.downloadUrl + '.data';
  const dataBytes = await downloadWithProgress(dataUrl, params.sizeBytes);

  const entry: ModelCacheEntry = {
    name: params.name,
    version: params.version,
    graphBytes,
    dataBytes,
    labelMap,
    cachedAt: Date.now(),
  };

  await putCachedModel(entry);
  return entry;
}
