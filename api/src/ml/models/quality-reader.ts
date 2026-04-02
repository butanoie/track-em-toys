/**
 * Reads -metrics.json files and computes derived quality metrics
 * (confused pairs, top-3 accuracy fallback) for the admin dashboard.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseModelMetrics, type ModelMetrics } from './metrics-schema.js';
import type { ScannerLogger } from './scanner.js';

export interface ConfusedPair {
  true_label: string;
  predicted_label: string;
  count: number;
  pct_of_true_class: number;
}

/**
 * Read and parse a -metrics.json file for a given model version.
 *
 * @param modelsPath - Directory containing model files
 * @param version - Model version (used to derive filename: {version}-metrics.json)
 * @param log - Logger for warnings
 */
export async function readModelMetrics(
  modelsPath: string,
  version: string,
  log: ScannerLogger
): Promise<ModelMetrics | null> {
  // Defense-in-depth: reject path traversal in version strings
  if (version.includes('/') || version.includes('\\') || version.includes('..') || version.includes('\0')) {
    log.warn({ version }, 'Rejected metrics read: version contains unsafe characters');
    return null;
  }

  const filename = `${version}-metrics.json`;
  const filePath = join(modelsPath, filename);

  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch {
    // Metrics file missing is normal — model may not have been trained locally
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    log.warn({ err, file: filename }, 'Failed to parse metrics JSON');
    return null;
  }

  const result = parseModelMetrics(parsed);
  if (!result.ok) {
    log.warn({ file: filename, reason: result.error }, 'Invalid metrics schema');
    return null;
  }

  return result.data;
}

/**
 * Extract the top N most-confused class pairs from a confusion matrix.
 * Returns off-diagonal cells sorted by count descending.
 *
 * @param matrix - NxN confusion matrix (rows=true, cols=predicted)
 * @param labelMap - Index-to-label mapping (string keys from JSON)
 * @param topN - Maximum number of pairs to return
 */
export function computeConfusedPairs(
  matrix: number[][],
  labelMap: Record<string, string>,
  topN: number = 20
): ConfusedPair[] {
  const pairs: ConfusedPair[] = [];

  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i];
    if (!row) continue;

    const rowTotal = row.reduce((sum, val) => sum + val, 0);
    if (rowTotal === 0) continue;

    const trueLabel = labelMap[String(i)] ?? `class-${i}`;

    for (let j = 0; j < row.length; j++) {
      if (i === j) continue; // skip diagonal (correct predictions)
      const count = row[j];
      if (!count || count <= 0) continue;

      const predictedLabel = labelMap[String(j)] ?? `class-${j}`;
      pairs.push({
        true_label: trueLabel,
        predicted_label: predictedLabel,
        count,
        pct_of_true_class: count / rowTotal,
      });
    }
  }

  pairs.sort((a, b) => b.count - a.count);
  return pairs.slice(0, topN);
}
