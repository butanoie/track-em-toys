/**
 * Type definition and runtime validation for the -metrics.json files
 * produced by ml/scripts/train.py.
 */

export interface ModelMetrics {
  model_stem: string;
  category: string;
  class_count: number;
  best_val_accuracy: number;
  top3_accuracy: number | null;
  label_map: Record<string, string>;
  per_class_accuracy: Record<string, number>;
  confusion_matrix: number[][];
  hyperparams: Record<string, unknown>;
  seed: number;
  trained_at: string;
  data_dir: string;
}

type ParseResult = { ok: true; data: ModelMetrics } | { ok: false; error: string };

/**
 * Validate that a parsed JSON value matches the ModelMetrics shape.
 *
 * @param value - Parsed JSON to validate
 */
export function parseModelMetrics(value: unknown): ParseResult {
  if (typeof value !== 'object' || value === null) {
    return { ok: false, error: 'not an object' };
  }

  const obj = value as Record<string, unknown>;

  const requiredStrings = ['model_stem', 'category', 'trained_at', 'data_dir'] as const;
  for (const key of requiredStrings) {
    if (typeof obj[key] !== 'string') {
      return { ok: false, error: `missing or invalid string field: ${key}` };
    }
  }

  const requiredNumbers = ['class_count', 'best_val_accuracy', 'seed'] as const;
  for (const key of requiredNumbers) {
    if (typeof obj[key] !== 'number') {
      return { ok: false, error: `missing or invalid number field: ${key}` };
    }
  }

  // top3_accuracy is optional (older metrics files may not have it)
  if (obj.top3_accuracy !== undefined && obj.top3_accuracy !== null && typeof obj.top3_accuracy !== 'number') {
    return { ok: false, error: 'invalid top3_accuracy: expected number or null' };
  }

  if (!Array.isArray(obj.confusion_matrix)) {
    return { ok: false, error: 'missing or invalid confusion_matrix' };
  }

  for (const key of ['label_map', 'per_class_accuracy', 'hyperparams'] as const) {
    if (typeof obj[key] !== 'object' || obj[key] === null || Array.isArray(obj[key])) {
      return { ok: false, error: `missing or invalid object field: ${key}` };
    }
  }

  // Validate per_class_accuracy values are numbers
  const pca = obj.per_class_accuracy as Record<string, unknown>;
  for (const [k, v] of Object.entries(pca)) {
    if (typeof v !== 'number') {
      return { ok: false, error: `per_class_accuracy["${k}"] is not a number` };
    }
  }

  return {
    ok: true,
    data: {
      ...(obj as unknown as ModelMetrics),
      top3_accuracy: typeof obj.top3_accuracy === 'number' ? obj.top3_accuracy : null,
    },
  };
}
