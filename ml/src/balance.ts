import type { ManifestEntry, BalanceReport, ClassBalance } from './types.js';
import { flattenLabel } from './manifest.js';

const VIABLE_MINIMUM = 10;

/**
 * Analyze class balance across grouped manifest entries.
 * Computes how many augmented images each class needs to reach the target.
 *
 * @param grouped - Entries grouped by label
 * @param targetCount - Desired number of images per class after augmentation
 */
export function analyzeBalance(grouped: Map<string, ManifestEntry[]>, targetCount: number): BalanceReport {
  const classes: ClassBalance[] = [];
  const belowViableMinimum: string[] = [];

  for (const [label, entries] of grouped) {
    const sourceCount = entries.length;
    const augmentCount = Math.max(0, targetCount - sourceCount);
    classes.push({ label, sourceCount, targetCount: Math.max(sourceCount, targetCount), augmentCount });

    if (sourceCount < VIABLE_MINIMUM) {
      belowViableMinimum.push(label);
    }
  }

  classes.sort((a, b) => a.label.localeCompare(b.label));

  const counts = classes.map((c) => c.sourceCount);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const mean = counts.reduce((sum, n) => sum + n, 0) / counts.length;

  return { classes, min, max, mean, belowViableMinimum };
}

/**
 * Print a formatted class balance report to stdout.
 *
 * @param report - Balance analysis result
 */
export function printBalanceReport(report: BalanceReport): void {
  console.log('\nClass Balance Report');
  console.log('─'.repeat(80));
  console.log(`${'Label'.padEnd(45)} ${'Orig'.padStart(5)} ${'Target'.padStart(7)} ${'Augment'.padStart(8)} Status`);
  console.log('─'.repeat(80));

  for (const cls of report.classes) {
    const flatLabel = flattenLabel(cls.label);
    const displayLabel = flatLabel.length > 44 ? flatLabel.slice(0, 41) + '...' : flatLabel;
    const viable = cls.sourceCount >= VIABLE_MINIMUM;
    const status = viable ? 'Viable' : `Low source (min ${VIABLE_MINIMUM})`;
    const marker = viable ? ' ' : '!';

    console.log(
      `${marker}${displayLabel.padEnd(44)} ${String(cls.sourceCount).padStart(5)} ${String(cls.targetCount).padStart(7)} ${String(cls.augmentCount).padStart(8)} ${status}`
    );
  }

  console.log('─'.repeat(80));
  console.log(
    `Classes: ${report.classes.length}  |  Min: ${report.min}  |  Max: ${report.max}  |  Mean: ${report.mean.toFixed(1)}`
  );

  if (report.belowViableMinimum.length > 0) {
    console.log(
      `\nWarning: ${report.belowViableMinimum.length} class(es) below viable minimum (${VIABLE_MINIMUM} originals):`
    );
    for (const label of report.belowViableMinimum) {
      console.log(`  - ${flattenLabel(label)}`);
    }
  }

  console.log();
}
