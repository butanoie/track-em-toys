/**
 * Pipeline: prepare-training-data
 * Input:    ML export manifest JSON (produced by POST /catalog/ml-export)
 * Output:   Create ML folder-per-class structure at ML_TRAINING_DATA_PATH
 *           Format: {outputDir}/{franchise__item-slug}/{filename}.webp
 * Time:     ~30s per 1000 photos on Apple Silicon (copy-only), ~2-5min with augmentation
 */

import 'dotenv/config';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CliOptions } from './types.js';
import { readManifest, groupEntriesByLabel, flattenLabel } from './manifest.js';
import { analyzeBalance, printBalanceReport } from './balance.js';
import { TRANSFORMS } from './transforms.js';
import { augmentClass } from './augment.js';
import { prepareOutputDir, copyClass } from './copy.js';
import { validateOutputStructure } from './validate.js';

const DEFAULT_TARGET_COUNT = 100;
const CONCURRENCY_LIMIT = 5;

/**
 * Parse CLI arguments and environment variables into options.
 */
function loadCliOptions(): CliOptions {
  const args = process.argv.slice(2);
  let manifestPath: string | undefined;
  let outputDir: string | undefined = process.env['ML_TRAINING_DATA_PATH'];
  let targetCount = DEFAULT_TARGET_COUNT;
  let format: 'webp' | 'jpeg' = 'webp';
  let classes: string[] | null = null;
  let noClean = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--manifest' && i + 1 < args.length) {
      manifestPath = args[++i];
    } else if (arg === '--output' && i + 1 < args.length) {
      outputDir = args[++i];
    } else if (arg === '--target-count' && i + 1 < args.length) {
      targetCount = parseInt(args[++i]!, 10);
      if (isNaN(targetCount) || targetCount < 1) {
        console.error('Error: --target-count must be a positive integer');
        process.exit(1);
      }
    } else if (arg === '--format' && i + 1 < args.length) {
      const fmt = args[++i];
      if (fmt !== 'webp' && fmt !== 'jpeg') {
        console.error('Error: --format must be "webp" or "jpeg"');
        process.exit(1);
      }
      format = fmt;
    } else if (arg === '--classes' && i + 1 < args.length) {
      const classArg = args[++i];
      if (classArg) {
        classes = classArg.split(',').map((c) => c.trim());
      }
    } else if (arg === '--no-clean') {
      noClean = true;
    } else if (!arg?.startsWith('--') && !manifestPath) {
      manifestPath = arg;
    }
  }

  if (!manifestPath) {
    console.error('Error: manifest path is required');
    console.error('Usage: npm run prepare-data -- --manifest <path> [options]');
    console.error('Options:');
    console.error('  --manifest <path>       Path to ML export manifest JSON (required)');
    console.error('  --output <path>         Output directory (default: ML_TRAINING_DATA_PATH env)');
    console.error('  --target-count <n>      Target images per class (default: 100)');
    console.error('  --format webp|jpeg      Output image format (default: webp)');
    console.error('  --classes <a,b,c>       Only process these labels (comma-separated)');
    console.error('  --no-clean              Skip cleaning class directories before writing');
    process.exit(1);
  }

  if (!outputDir) {
    console.error('Error: output directory is required');
    console.error('Set ML_TRAINING_DATA_PATH environment variable or use --output <path>');
    process.exit(1);
  }

  return {
    manifestPath: resolve(manifestPath),
    outputDir: resolve(outputDir),
    targetCount,
    format,
    classes,
    noClean,
  };
}

/**
 * Process classes in batches to limit concurrency.
 *
 * @param items - Array of items to process
 * @param limit - Max concurrent items per batch
 * @param fn - Async function to apply to each item
 */
async function processBatch<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    await Promise.all(batch.map(fn));
  }
}

/**
 * Main pipeline: read manifest, analyze balance, copy + augment, validate.
 */
async function main(): Promise<void> {
  const startTime = Date.now();
  const options = loadCliOptions();

  console.log('ML Training Data Preparation');
  console.log('═'.repeat(80));
  console.log(`Manifest:     ${options.manifestPath}`);
  console.log(`Output:       ${options.outputDir}`);
  console.log(`Target/class: ${options.targetCount}`);
  console.log(`Format:       ${options.format}`);
  console.log(`Clean mode:   ${options.noClean ? 'disabled' : 'enabled'}`);
  if (options.classes) {
    console.log(`Filter:       ${options.classes.join(', ')}`);
  }

  // Check manifest age
  const manifestStat = await stat(options.manifestPath);
  const ageMs = Date.now() - manifestStat.mtimeMs;
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours > 24) {
    console.log(`\nWarning: Manifest is ${Math.floor(ageHours)} hours old — consider re-exporting from the API.`);
  }

  // Step 1: Read manifest
  console.log('\n[1/5] Reading manifest...');
  const manifest = await readManifest(options.manifestPath);
  console.log(
    `  Found ${manifest.stats.total_photos} photos across ${manifest.stats.items} items in ${manifest.stats.franchises} franchise(s)`
  );

  // Step 2: Group and filter
  console.log('\n[2/5] Analyzing classes...');
  let grouped = groupEntriesByLabel(manifest.entries);

  if (options.classes) {
    const filtered = new Map<string, typeof manifest.entries>();
    for (const cls of options.classes) {
      const entries = grouped.get(cls);
      if (entries) {
        filtered.set(cls, entries);
      } else {
        console.error(`  Warning: class "${cls}" not found in manifest`);
      }
    }
    grouped = filtered;
  }

  if (grouped.size === 0) {
    console.error('Error: no classes to process');
    process.exit(1);
  }

  // Step 3: Balance analysis
  const report = analyzeBalance(grouped, options.targetCount);
  printBalanceReport(report);

  // Estimate disk usage
  const estimatedBytes = report.classes.reduce((sum, c) => sum + c.targetCount * 500_000, 0);
  const estimatedMB = Math.ceil(estimatedBytes / (1024 * 1024));
  console.log(`Estimated output size: ~${estimatedMB} MB`);

  // Step 4: Copy + augment
  console.log('\n[3/5] Preparing output directory...');
  await prepareOutputDir(options.outputDir);

  console.log('\n[4/5] Copying photos and generating augmentations...');
  let totalOriginals = 0;
  let totalAugmented = 0;
  let totalSkipped = 0;
  const allWarnings: string[] = [];
  const allErrors: { label: string; photo_path: string; reason: string }[] = [];

  const classEntries = [...grouped.entries()];

  await processBatch(classEntries, CONCURRENCY_LIMIT, async ([label, entries]) => {
    const augmentCount = Math.max(0, options.targetCount - entries.length);

    // Augment
    const { images: augmented, warnings } = await augmentClass(entries, augmentCount, TRANSFORMS, options.format);

    if (warnings.length > 0) {
      allWarnings.push(...warnings.map((w) => `[${flattenLabel(label)}] ${w}`));
    }

    // Copy originals + write augmented
    const result = await copyClass(label, entries, augmented, options.outputDir, options.noClean);

    totalOriginals += result.originalsWritten;
    totalAugmented += result.augmentedWritten;
    totalSkipped += result.skipped;

    for (const err of result.errors) {
      allErrors.push({ label, ...err });
    }

    const flatLabel = flattenLabel(label);
    console.log(
      `  ${flatLabel}: ${entries.length} originals + ${augmented.length} augmented = ${entries.length + augmented.length} total`
    );
  });

  // Step 5: Validate
  console.log('\n[5/5] Validating output structure...');
  const expectedLabels = [...grouped.keys()].map(flattenLabel);
  const validation = await validateOutputStructure(options.outputDir, expectedLabels);

  if (validation.warnings.length > 0) {
    for (const w of validation.warnings) {
      console.log(`  Warning: ${w}`);
    }
  }

  if (!validation.valid) {
    console.error('\nValidation FAILED:');
    for (const e of validation.errors) {
      console.error(`  - ${e}`);
    }
    process.exit(2);
  }

  console.log('  Validation passed');

  // Summary
  const durationMs = Date.now() - startTime;
  const durationSec = (durationMs / 1000).toFixed(1);

  console.log('\n' + '═'.repeat(80));
  console.log('Summary');
  console.log('─'.repeat(80));
  console.log(`Classes:     ${grouped.size}`);
  console.log(`Originals:   ${totalOriginals}`);
  console.log(`Augmented:   ${totalAugmented}`);
  console.log(`Total:       ${totalOriginals + totalAugmented}`);
  console.log(`Skipped:     ${totalSkipped}`);
  console.log(`Duration:    ${durationSec}s`);

  if (allWarnings.length > 0) {
    console.log(`\nWarnings (${allWarnings.length}):`);
    for (const w of allWarnings) {
      console.log(`  - ${w}`);
    }
  }

  if (allErrors.length > 0) {
    console.log(`\nErrors (${allErrors.length}):`);
    for (const e of allErrors) {
      console.log(`  - [${e.label}] ${e.photo_path}: ${e.reason}`);
    }
  }

  console.log('\nDone.');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
