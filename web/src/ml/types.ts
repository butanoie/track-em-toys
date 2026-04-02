/** ML service types — framework-agnostic, no React or Zod dependencies. */

export interface ModelCacheEntry {
  name: string;
  version: string;
  graphBytes: ArrayBuffer;
  dataBytes: ArrayBuffer;
  labelMap: Record<string, string>;
  cachedAt: number;
}

export interface Prediction {
  label: string;
  franchiseSlug: string;
  itemSlug: string;
  confidence: number;
}

export interface InferenceResult {
  predictions: Prediction[];
  modelVersion: string;
  inferenceMs: number;
}

export type DownloadProgress = (loaded: number, total: number) => void;
