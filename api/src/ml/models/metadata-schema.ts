/**
 * Type definition and runtime validation for the -metadata.json files
 * produced by ml/scripts/export.py.
 */

export interface ModelMetadata {
  name: string;
  version: string;
  category: string;
  format: string;
  class_count: number;
  accuracy: number;
  input_shape: number[];
  input_names: string[];
  output_names: string[];
  label_map: Record<string, string>;
  trained_at: string;
  exported_at: string;
}

type ParseResult = { ok: true; data: ModelMetadata } | { ok: false; error: string };

/**
 * Validate that a parsed JSON value matches the ModelMetadata shape.
 * Returns a discriminated result so callers can log the specific failure reason.
 *
 * @param value - Parsed JSON to validate
 */
export function parseModelMetadata(value: unknown): ParseResult {
  if (typeof value !== 'object' || value === null) {
    return { ok: false, error: 'not an object' };
  }

  const obj = value as Record<string, unknown>;

  const requiredStrings = ['name', 'version', 'category', 'format', 'trained_at', 'exported_at'] as const;
  for (const key of requiredStrings) {
    if (typeof obj[key] !== 'string') {
      return { ok: false, error: `missing or invalid string field: ${key}` };
    }
  }

  const requiredNumbers = ['class_count', 'accuracy'] as const;
  for (const key of requiredNumbers) {
    if (typeof obj[key] !== 'number') {
      return { ok: false, error: `missing or invalid number field: ${key}` };
    }
  }

  const requiredArrays = ['input_shape', 'input_names', 'output_names'] as const;
  for (const key of requiredArrays) {
    if (!Array.isArray(obj[key])) {
      return { ok: false, error: `missing or invalid array field: ${key}` };
    }
  }

  if (typeof obj.label_map !== 'object' || obj.label_map === null || Array.isArray(obj.label_map)) {
    return { ok: false, error: 'missing or invalid label_map' };
  }

  return { ok: true, data: value as ModelMetadata };
}
