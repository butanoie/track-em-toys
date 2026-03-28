/**
 * Shared types for the ML training data pipeline.
 *
 * Manifest types mirror the API's manifest output (api/src/catalog/ml-export/routes.ts).
 * Keep in sync manually — ml/ has no dependency on api/.
 */

export interface ManifestEntry {
  photo_path: string;
  label: string;
  item_name: string;
  franchise_slug: string;
  item_slug: string;
}

export interface ManifestWarning {
  label: string;
  photo_count: number;
  message: string;
}

export interface Manifest {
  version: number;
  exported_at: string;
  stats: {
    total_photos: number;
    items: number;
    franchises: number;
    low_photo_items: number;
  };
  entries: ManifestEntry[];
  warnings: ManifestWarning[];
}

export type CliSource = { mode: 'manifest'; manifestPath: string } | { mode: 'source-dir'; sourceDir: string };

export interface CliOptions {
  source: CliSource;
  outputDir: string;
  targetCount: number;
  format: 'webp' | 'jpeg';
  classes: string[] | null;
  noClean: boolean;
  testSet: boolean;
}

export interface ClassBalance {
  label: string;
  sourceCount: number;
  targetCount: number;
  augmentCount: number;
}

export interface BalanceReport {
  classes: ClassBalance[];
  min: number;
  max: number;
  mean: number;
  belowViableMinimum: string[];
}

export interface AugmentedImage {
  filename: string;
  buffer: Buffer;
}

export interface CopyError {
  photo_path: string;
  reason: string;
}

export interface CopyResult {
  originalsWritten: number;
  augmentedWritten: number;
  skipped: number;
  errors: CopyError[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  classStats: Map<string, number>;
}
