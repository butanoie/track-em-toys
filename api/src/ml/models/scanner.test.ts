import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
}));

import { readdir, readFile, stat } from 'node:fs/promises';
import { scanModels, type ScannerLogger } from './scanner.js';

const mockReaddir = vi.mocked(readdir);
const mockReadFile = vi.mocked(readFile);
const mockStat = vi.mocked(stat);

const mockLog = {
  warn: vi.fn(),
  error: vi.fn(),
} satisfies ScannerLogger;

function validMetadata(overrides?: Record<string, unknown>) {
  return JSON.stringify({
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
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('scanModels', () => {
  it('returns empty array when directory does not exist', async () => {
    const err = new Error('ENOENT') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    mockReaddir.mockRejectedValue(err);

    const result = await scanModels('/missing/dir', mockLog);

    expect(result).toEqual([]);
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/missing/dir' }),
      expect.stringContaining('does not exist')
    );
  });

  it('returns empty array and logs error on non-ENOENT readdir failure', async () => {
    const err = new Error('EACCES') as NodeJS.ErrnoException;
    err.code = 'EACCES';
    mockReaddir.mockRejectedValue(err);

    const result = await scanModels('/locked/dir', mockLog);

    expect(result).toEqual([]);
    expect(mockLog.error).toHaveBeenCalled();
  });

  it('returns empty array when no metadata files exist', async () => {
    mockReaddir.mockResolvedValue(['model.onnx', 'model.pt', 'README.md'] as unknown as Awaited<
      ReturnType<typeof readdir>
    >);

    const result = await scanModels('/models', mockLog);

    expect(result).toEqual([]);
  });

  it('parses a valid metadata file with ONNX present', async () => {
    mockReaddir.mockResolvedValue([
      'primary-classifier-20260331-c117-a83.8-metadata.json',
      'primary-classifier-20260331-c117-a83.8.onnx',
      'primary-classifier-20260331-c117-a83.8.onnx.data',
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    mockReadFile.mockResolvedValue(validMetadata());

    // .onnx file: 300KB, .onnx.data file: 6MB
    mockStat.mockImplementation(async (filePath) => {
      const p = String(filePath);
      if (p.endsWith('.onnx.data')) return { size: 6_000_000 } as Awaited<ReturnType<typeof stat>>;
      if (p.endsWith('.onnx')) return { size: 300_000 } as Awaited<ReturnType<typeof stat>>;
      throw new Error('unexpected stat call');
    });

    const result = await scanModels('/models', mockLog);

    expect(result).toHaveLength(1);
    const model = result[0];
    expect(model).toBeDefined();
    expect(model!.metadata.name).toBe('primary-classifier');
    expect(model!.onnxFilename).toBe('primary-classifier-20260331-c117-a83.8.onnx');
    expect(model!.sizeBytes).toBe(6_300_000);
    expect(model!.metadataFilename).toBe('primary-classifier-20260331-c117-a83.8-metadata.json');
  });

  it('returns null onnxFilename and 0 sizeBytes when ONNX file is missing', async () => {
    mockReaddir.mockResolvedValue(['model-v1-metadata.json'] as unknown as Awaited<ReturnType<typeof readdir>>);

    mockReadFile.mockResolvedValue(validMetadata({ version: 'model-v1' }));

    // Both .onnx and .onnx.data missing
    mockStat.mockRejectedValue(new Error('ENOENT'));

    const result = await scanModels('/models', mockLog);

    expect(result).toHaveLength(1);
    const model = result[0];
    expect(model).toBeDefined();
    expect(model!.onnxFilename).toBeNull();
    expect(model!.sizeBytes).toBe(0);
  });

  it('skips files with invalid JSON', async () => {
    mockReaddir.mockResolvedValue(['bad-metadata.json'] as unknown as Awaited<ReturnType<typeof readdir>>);

    mockReadFile.mockResolvedValue('not valid json {{{');

    const result = await scanModels('/models', mockLog);

    expect(result).toEqual([]);
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.objectContaining({ file: 'bad-metadata.json' }),
      expect.stringContaining('parse')
    );
  });

  it('skips files with invalid schema', async () => {
    mockReaddir.mockResolvedValue(['incomplete-metadata.json'] as unknown as Awaited<ReturnType<typeof readdir>>);

    mockReadFile.mockResolvedValue(JSON.stringify({ name: 'test' }));

    const result = await scanModels('/models', mockLog);

    expect(result).toEqual([]);
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.objectContaining({ file: 'incomplete-metadata.json', reason: expect.any(String) }),
      expect.stringContaining('Invalid metadata')
    );
  });

  it('scans multiple metadata files', async () => {
    mockReaddir.mockResolvedValue([
      'primary-classifier-20260331-c117-a83.8-metadata.json',
      'secondary-classifier-20260331-c109-a86.3-metadata.json',
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    let callCount = 0;
    mockReadFile.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return validMetadata();
      return validMetadata({
        name: 'secondary-classifier',
        version: 'secondary-classifier-20260331-c109-a86.3',
        category: 'secondary',
      });
    });

    mockStat.mockResolvedValue({ size: 100_000 } as Awaited<ReturnType<typeof stat>>);

    const result = await scanModels('/models', mockLog);

    expect(result).toHaveLength(2);
    expect(result[0]).toBeDefined();
    expect(result[0]!.metadata.name).toBe('primary-classifier');
    expect(result[1]).toBeDefined();
    expect(result[1]!.metadata.name).toBe('secondary-classifier');
  });
});
