import { describe, it, expect } from 'vitest';
import { parseModelMetadata } from './metadata-schema.js';

function validMetadata(overrides?: Record<string, unknown>) {
  return {
    name: 'primary-classifier',
    version: 'primary-classifier-20260331-c117-a83.8',
    category: 'primary',
    format: 'onnx',
    class_count: 117,
    accuracy: 0.838,
    input_shape: [1, 3, 224, 224],
    input_names: ['input'],
    output_names: ['output'],
    label_map: { '0': 'transformers__optimus-prime' },
    trained_at: '2026-03-31T00:59:50.123Z',
    exported_at: '2026-03-31T01:10:30.456Z',
    ...overrides,
  };
}

describe('parseModelMetadata', () => {
  it('accepts valid metadata', () => {
    const result = parseModelMetadata(validMetadata());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe('primary-classifier');
      expect(result.data.class_count).toBe(117);
    }
  });

  it('rejects non-object input', () => {
    expect(parseModelMetadata(null)).toEqual({ ok: false, error: 'not an object' });
    expect(parseModelMetadata('string')).toEqual({ ok: false, error: 'not an object' });
    expect(parseModelMetadata(42)).toEqual({ ok: false, error: 'not an object' });
  });

  it('rejects missing string fields', () => {
    for (const field of ['name', 'version', 'category', 'format', 'trained_at', 'exported_at']) {
      const result = parseModelMetadata(validMetadata({ [field]: undefined }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(field);
      }
    }
  });

  it('rejects non-string values for string fields', () => {
    const result = parseModelMetadata(validMetadata({ name: 123 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('name');
    }
  });

  it('rejects missing number fields', () => {
    for (const field of ['class_count', 'accuracy']) {
      const result = parseModelMetadata(validMetadata({ [field]: undefined }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(field);
      }
    }
  });

  it('rejects non-number values for number fields', () => {
    const result = parseModelMetadata(validMetadata({ accuracy: 'high' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('accuracy');
    }
  });

  it('rejects missing array fields', () => {
    for (const field of ['input_shape', 'input_names', 'output_names']) {
      const result = parseModelMetadata(validMetadata({ [field]: undefined }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(field);
      }
    }
  });

  it('rejects non-array values for array fields', () => {
    const result = parseModelMetadata(validMetadata({ input_shape: 'not-an-array' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('input_shape');
    }
  });

  it('rejects invalid label_map', () => {
    expect(parseModelMetadata(validMetadata({ label_map: null }))).toEqual({
      ok: false,
      error: 'missing or invalid label_map',
    });
    expect(parseModelMetadata(validMetadata({ label_map: [1, 2] }))).toEqual({
      ok: false,
      error: 'missing or invalid label_map',
    });
    expect(parseModelMetadata(validMetadata({ label_map: 'string' }))).toEqual({
      ok: false,
      error: 'missing or invalid label_map',
    });
  });

  it('accepts metadata with extra fields (forward-compatible)', () => {
    const result = parseModelMetadata(validMetadata({ label_hierarchy: { '0': { franchise: 'tf' } } }));
    expect(result.ok).toBe(true);
  });
});
