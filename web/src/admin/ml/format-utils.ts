/**
 * Format a raw ML class label (e.g., "transformers__optimus-prime") to a
 * human-readable name (e.g., "Optimus Prime").
 *
 * Strips the franchise prefix (before `__`) and title-cases the item slug.
 */
export function formatClassLabel(raw: string): string {
  const parts = raw.split('__');
  const item = parts.length > 1 ? (parts.at(-1) ?? raw) : raw;
  return item
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format a raw ML class label with franchise prefix visible.
 * E.g., "transformers__optimus-prime" → "Transformers › Optimus Prime"
 */
export function formatClassLabelFull(raw: string): string {
  const delimIdx = raw.indexOf('__');
  if (delimIdx === -1) return formatClassLabel(raw);

  const franchise = raw.slice(0, delimIdx);
  const item = raw.slice(delimIdx + 2);

  const fmtFranchise = franchise
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const fmtItem = item
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return `${fmtFranchise} › ${fmtItem}`;
}
