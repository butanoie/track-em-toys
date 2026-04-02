import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { parseModelMetadata, type ModelMetadata } from './metadata-schema.js';

/** Narrow logger type for testability — avoids `as unknown as` in test mocks. */
export type ScannerLogger = Pick<FastifyBaseLogger, 'warn' | 'error'>;

export interface ScannedModel {
  metadata: ModelMetadata;
  metadataFilename: string;
  onnxFilename: string | null;
  sizeBytes: number;
}

const METADATA_SUFFIX = '-metadata.json';

/**
 * Get the file size in bytes, returning 0 if the file does not exist.
 *
 * @param filePath - Absolute path to the file
 */
async function safeFileSize(filePath: string): Promise<number> {
  try {
    const s = await stat(filePath);
    return s.size;
  } catch {
    return 0;
  }
}

/**
 * Scan a directory for *-metadata.json files, parse each one, and return
 * successfully parsed models. Malformed or unreadable files are logged and
 * skipped. Never throws.
 *
 * @param modelsPath - Absolute path to the models directory
 * @param log - Fastify logger for warnings
 */
export async function scanModels(modelsPath: string, log: ScannerLogger): Promise<ScannedModel[]> {
  let entries: string[];
  try {
    entries = await readdir(modelsPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      log.warn({ path: modelsPath }, 'ML models directory does not exist');
    } else {
      log.error({ err, path: modelsPath }, 'Failed to read ML models directory');
    }
    return [];
  }

  const metadataFiles = entries.filter((f) => f.endsWith(METADATA_SUFFIX));
  const models: ScannedModel[] = [];

  for (const metadataFilename of metadataFiles) {
    const filePath = join(modelsPath, metadataFilename);

    let raw: string;
    try {
      raw = await readFile(filePath, 'utf-8');
    } catch (err) {
      log.warn({ err, file: metadataFilename }, 'Failed to read metadata file');
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      log.warn({ err, file: metadataFilename }, 'Failed to parse metadata JSON');
      continue;
    }

    const result = parseModelMetadata(parsed);
    if (!result.ok) {
      log.warn({ file: metadataFilename, reason: result.error }, 'Invalid metadata schema');
      continue;
    }

    const { data: metadata } = result;

    // Derive ONNX filename from the version field (matches export.py convention)
    const expectedOnnx = `${metadata.version}.onnx`;
    const onnxPath = join(modelsPath, expectedOnnx);
    const onnxDataPath = join(modelsPath, `${metadata.version}.onnx.data`);

    const onnxSize = await safeFileSize(onnxPath);
    const onnxDataSize = await safeFileSize(onnxDataPath);
    const totalSize = onnxSize + onnxDataSize;

    models.push({
      metadata,
      metadataFilename,
      onnxFilename: onnxSize > 0 ? expectedOnnx : null,
      sizeBytes: totalSize,
    });
  }

  return models;
}
