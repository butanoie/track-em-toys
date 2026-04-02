/**
 * Parse ML model labels in `franchise__item-slug` format and build catalog URLs.
 * Pure functions — no external dependencies.
 */

const LABEL_DELIMITER = '__';

/**
 * Parse a model label into franchise and item slug components.
 *
 * @param label - Raw label string (e.g., "transformers__optimus-prime")
 * @returns Parsed components, or null if the label is malformed
 */
export function parseLabel(label: string): { franchiseSlug: string; itemSlug: string } | null {
  const idx = label.indexOf(LABEL_DELIMITER);
  if (idx <= 0 || idx >= label.length - LABEL_DELIMITER.length) return null;

  const franchiseSlug = label.slice(0, idx);
  const itemSlug = label.slice(idx + LABEL_DELIMITER.length);

  if (!franchiseSlug || !itemSlug) return null;
  return { franchiseSlug, itemSlug };
}

/**
 * Build a catalog item URL path from franchise and item slugs.
 *
 * @param franchiseSlug - Franchise slug
 * @param itemSlug - Item slug
 */
export function buildCatalogItemPath(franchiseSlug: string, itemSlug: string): string {
  return `/catalog/${franchiseSlug}/items/${itemSlug}`;
}

/**
 * Apply softmax to raw logits, returning probabilities that sum to 1.
 *
 * @param logits - Raw model output values
 */
export function softmax(logits: Float32Array): Float32Array {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) {
    if (logits[i] > max) max = logits[i];
  }
  const exps = new Float32Array(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    exps[i] = Math.exp(logits[i] - max);
    sum += exps[i];
  }
  for (let i = 0; i < exps.length; i++) {
    exps[i] = exps[i] / sum;
  }
  return exps;
}

/**
 * Extract top-K predictions from model output scores and a label map.
 *
 * @param scores - Model output (logits or probabilities)
 * @param labelMap - Mapping from string index to label (e.g., {"0": "transformers__optimus-prime"})
 * @param topK - Number of top predictions to return
 */
export function extractTopPredictions(
  scores: Float32Array,
  labelMap: Record<string, string>,
  topK: number
): { label: string; franchiseSlug: string; itemSlug: string; confidence: number }[] {
  // Always apply softmax — model outputs raw logits, and even if values
  // happen to fall in [0,1] they won't sum to 1 without normalization
  const probs = softmax(scores);

  // Build index-score pairs and sort descending
  const indexed: { idx: number; score: number }[] = [];
  for (let i = 0; i < probs.length; i++) {
    indexed.push({ idx: i, score: probs[i] });
  }
  indexed.sort((a, b) => b.score - a.score);

  const results: { label: string; franchiseSlug: string; itemSlug: string; confidence: number }[] = [];
  for (const { idx, score } of indexed.slice(0, topK)) {
    const label = labelMap[String(idx)];
    if (!label) continue;

    const parsed = parseLabel(label);
    if (!parsed) continue;

    results.push({
      label,
      franchiseSlug: parsed.franchiseSlug,
      itemSlug: parsed.itemSlug,
      confidence: score,
    });
  }

  return results;
}

/**
 * Format a slug into a display-friendly name (e.g., "ft-04-scoria" → "Ft 04 Scoria").
 *
 * @param slug - Item slug with hyphens
 */
export function formatSlugAsName(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
