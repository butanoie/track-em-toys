/**
 * Client-side image classification using onnxruntime-web.
 * Handles ONNX session lifecycle and inference orchestration.
 *
 * This module uses dynamic import for onnxruntime-web to keep it out of the
 * main bundle — the ~394KB JS + WASM runtime only loads when inference is needed.
 */

import type { ModelCacheEntry, Prediction } from './types.js';
import { extractTopPredictions } from './label-parser.js';
import { preprocessImage } from './preprocess.js';

const INPUT_SIZE = 224;
const DEFAULT_TOP_K = 5;

// Module-scoped session cache — survives across component re-renders
type OrtSession = { run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: Float32Array }>> };
const sessionCache = new Map<string, OrtSession>();

let ortInitialized = false;

/**
 * Dynamically import onnxruntime-web and configure WASM paths.
 * Deferred to first use so the ~394KB bundle only loads when needed.
 */
async function getOrt() {
  const ort = await import('onnxruntime-web');

  if (!ortInitialized) {
    ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.env.versions.web}/dist/`;
    ortInitialized = true;
  }

  return ort;
}

/**
 * Create or retrieve a cached ONNX InferenceSession for the given model.
 *
 * @param cacheEntry - Model cache entry with graph + data bytes
 */
async function getOrCreateSession(cacheEntry: ModelCacheEntry): Promise<OrtSession> {
  const existing = sessionCache.get(cacheEntry.version);
  if (existing) return existing;

  const ort = await getOrt();

  // The .onnx graph references external data by filename.
  // We pass the sidecar bytes via externalData so the runtime can resolve them.
  const dataFileName = `${cacheEntry.version}.onnx.data`;

  const session = await ort.InferenceSession.create(new Uint8Array(cacheEntry.graphBytes), {
    executionProviders: ['wasm'],
    externalData: [
      {
        path: dataFileName,
        data: new Uint8Array(cacheEntry.dataBytes),
      },
    ],
  });

  sessionCache.set(cacheEntry.version, session as OrtSession);
  return session as OrtSession;
}

/**
 * Run image classification on a file using a cached ONNX model.
 *
 * @param file - Image file to classify
 * @param cacheEntry - Model cache entry (graph bytes, data bytes, label map)
 * @param topK - Number of top predictions to return (default: 5)
 */
export async function classifyImage(
  file: File,
  cacheEntry: ModelCacheEntry,
  topK: number = DEFAULT_TOP_K
): Promise<Prediction[]> {
  const ort = await getOrt();

  const inputTensor = await preprocessImage(file);
  const session = await getOrCreateSession(cacheEntry);

  const tensor = new ort.Tensor('float32', inputTensor, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const results = await session.run({ input: tensor });

  const outputKey = Object.keys(results)[0];
  if (!outputKey) throw new Error('Model returned no output');
  const output = results[outputKey].data;
  if (!(output instanceof Float32Array)) {
    throw new Error(`Expected Float32Array output, got ${typeof output}`);
  }
  const scores: Float32Array = output;

  return extractTopPredictions(scores, cacheEntry.labelMap, topK);
}
