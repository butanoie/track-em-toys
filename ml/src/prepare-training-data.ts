/**
 * Pipeline: prepare-training-data
 * Input:    ML export manifest JSON  (--manifest <path>)
 *       OR  Seed-images directory     (--source-dir <path>)
 * Output:   Create ML folder-per-class structure at ML_TRAINING_DATA_PATH
 *           Format: {outputDir}/{franchise__item-slug}/{filename}.webp
 * Time:     ~30s per 1000 photos on Apple Silicon (copy-only), ~2-5min with augmentation
 */

import 'dotenv/config';
import { stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { AugmentedImage, CliOptions, ImageCategory } from './types.js';
import { readManifest, groupEntriesByLabel, flattenLabel } from './manifest.js';
import { scanSourceDir } from './scan.js';
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
  let sourceDir: string | undefined;
  let outputDir: string | undefined;
  let targetCount = DEFAULT_TARGET_COUNT;
  let format: 'webp' | 'jpeg' = 'webp';
  let classes: string[] | null = null;
  let category: CliOptions['category'] = null;
  let noAugment = false;
  let noClean = false;
  let testSet = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--manifest' && i + 1 < args.length) {
      manifestPath = args[++i];
    } else if (arg === '--source-dir' && i + 1 < args.length) {
      sourceDir = args[++i];
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
    } else if (arg === '--category' && i + 1 < args.length) {
      const cat = args[++i] as ImageCategory;
      const valid: ImageCategory[] = ['primary', 'secondary', 'package', 'accessories'];
      if (!valid.includes(cat)) {
        console.error(`Error: --category must be one of: ${valid.join(', ')}`);
        process.exit(1);
      }
      category = cat;
    } else if (arg === '--no-augment') {
      noAugment = true;
    } else if (arg === '--no-clean') {
      noClean = true;
    } else if (arg === '--test-set') {
      testSet = true;
    } else if (!arg?.startsWith('--') && !manifestPath && !sourceDir) {
      manifestPath = arg;
    }
  }

  if (manifestPath && sourceDir) {
    console.error('Error: --manifest and --source-dir are mutually exclusive');
    process.exit(1);
  }

  if (testSet && !sourceDir) {
    console.error('Error: --test-set requires --source-dir (manifests do not contain test data)');
    process.exit(1);
  }

  if (!manifestPath && !sourceDir) {
    console.error('Error: either --manifest or --source-dir is required');
    console.error('Usage:');
    console.error('  npm run prepare-data -- --manifest <path> [options]');
    console.error('  npm run prepare-data -- --source-dir <path> [options]');
    console.error('Options:');
    console.error('  --manifest <path>       Path to ML export manifest JSON');
    console.error('  --source-dir <path>     Path to seed-images directory');
    console.error('  --output <path>         Output directory (default: ML_TRAINING_DATA_PATH env)');
    console.error('  --target-count <n>      Target images per class (default: 100)');
    console.error('  --format webp|jpeg      Output image format (default: webp)');
    console.error('  --classes <a,b,c>       Only process these labels (comma-separated)');
    console.error('  --category <name>       Filter to a single category (primary|secondary|package|accessories)');
    console.error('  --no-augment            Copy originals only, skip augmentation');
    console.error('  --no-clean              Skip cleaning class directories before writing');
    console.error('  --test-set              Scan test tiers only, copy without augmentation');
    process.exit(1);
  }

  if (!outputDir) {
    outputDir = testSet ? process.env['ML_TEST_DATA_PATH'] : process.env['ML_TRAINING_DATA_PATH'];
  }

  if (!outputDir) {
    const envVar = testSet ? 'ML_TEST_DATA_PATH' : 'ML_TRAINING_DATA_PATH';
    console.error('Error: output directory is required');
    console.error(`Set ${envVar} environment variable or use --output <path>`);
    process.exit(1);
  }

  // Append category subdirectory when using the default env path (no explicit --output)
  const effectiveOutputDir = category && !args.includes('--output') ? join(outputDir, category) : outputDir;

  const source = manifestPath
    ? { mode: 'manifest' as const, manifestPath: resolve(manifestPath) }
    : { mode: 'source-dir' as const, sourceDir: resolve(sourceDir!) };

  return {
    source,
    outputDir: resolve(effectiveOutputDir),
    targetCount,
    format,
    classes,
    category,
    noAugment,
    noClean,
    testSet,
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
 * Main pipeline: read manifest or scan source dir, analyze balance, copy + augment, validate.
 */
async function main(): Promise<void> {
  const startTime = Date.now();
  const options = loadCliOptions();

  console.log('ML Training Data Preparation');
  console.log('═'.repeat(80));

  if (options.source.mode === 'manifest') {
    console.log(`Source:       manifest (${options.source.manifestPath})`);
  } else {
    console.log(`Source:       directory scan (${options.source.sourceDir})`);
  }
  console.log(`Output:       ${options.outputDir}`);
  console.log(`Target/class: ${options.targetCount}`);
  console.log(`Format:       ${options.format}`);
  console.log(`Clean mode:   ${options.noClean ? 'disabled' : 'enabled'}`);
  const skipAugment = options.testSet || options.noAugment;
  console.log(`Augmentation: ${skipAugment ? 'disabled' : 'enabled'}`);
  if (options.category) {
    console.log(`Category:     ${options.category}`);
  }
  if (options.testSet) {
    console.log(`Mode:         test-set (test tiers, no augmentation)`);
  }
  if (options.classes) {
    console.log(`Filter:       ${options.classes.join(', ')}`);
  }

  // Step 1: Load manifest (from file or directory scan)
  console.log('\n[1/5] Loading image sources...');
  let manifest;

  if (options.source.mode === 'manifest') {
    // Check manifest age
    const manifestStat = await stat(options.source.manifestPath);
    const ageMs = Date.now() - manifestStat.mtimeMs;
    const ageHours = ageMs / (1000 * 60 * 60);
    if (ageHours > 24) {
      console.log(`  Warning: Manifest is ${Math.floor(ageHours)} hours old — consider re-exporting from the API.`);
    }

    manifest = await readManifest(options.source.manifestPath);
  } else {
    manifest = await scanSourceDir(options.source.sourceDir, {
      testSet: options.testSet,
      category: options.category ?? undefined,
    });
  }

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

  // Step 3: Balance analysis (skip when augmentation is off)
  if (!skipAugment) {
    const report = analyzeBalance(grouped, options.targetCount);
    printBalanceReport(report);

    const estimatedBytes = report.classes.reduce((sum, c) => sum + c.targetCount * 500_000, 0);
    const estimatedMB = Math.ceil(estimatedBytes / (1024 * 1024));
    console.log(`Estimated output size: ~${estimatedMB} MB`);
  } else {
    const totalImages = [...grouped.values()].reduce((sum, entries) => sum + entries.length, 0);
    console.log(`  ${grouped.size} classes, ${totalImages} images (no augmentation)`);
  }

  // Step 4: Copy + augment
  console.log('\n[3/5] Preparing output directory...');
  await prepareOutputDir(options.outputDir);

  console.log(`\n[4/5] Copying photos${skipAugment ? '' : ' and generating augmentations'}...`);
  let totalOriginals = 0;
  let totalAugmented = 0;
  let totalSkipped = 0;
  const allWarnings: string[] = [];
  const allErrors: { label: string; photo_path: string; reason: string }[] = [];

  const classEntries = [...grouped.entries()];

  await processBatch(classEntries, CONCURRENCY_LIMIT, async ([label, entries]) => {
    let augmented: AugmentedImage[] = [];

    if (!skipAugment) {
      const augmentCount = Math.max(0, options.targetCount - entries.length);
      const result = await augmentClass(entries, augmentCount, TRANSFORMS, options.format);
      augmented = result.images;

      if (result.warnings.length > 0) {
        allWarnings.push(...result.warnings.map((w) => `[${flattenLabel(label)}] ${w}`));
      }
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
    if (skipAugment) {
      console.log(`  ${flatLabel}: ${entries.length} images`);
    } else {
      console.log(
        `  ${flatLabel}: ${entries.length} originals + ${augmented.length} augmented = ${entries.length + augmented.length} total`
      );
    }
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
