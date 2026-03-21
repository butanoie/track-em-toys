/**
 * Pure utility functions for relationship data transformation.
 * No React imports — independently unit-testable.
 */

const TYPE_LABELS: Record<string, string> = {
  'combiner-component': 'Combiner Components',
  'partner-bond': 'Partner Bonds',
  'vehicle-crew': 'Vehicle Crew',
  rival: 'Rivals',
  sibling: 'Siblings',
  'mentor-student': 'Mentor / Student',
  evolution: 'Evolution',
  'mold-origin': 'Mold Origin',
  'gift-set-contents': 'Gift Set Contents',
  variant: 'Variants',
};

/** Character types where both sides share identical roles (role === type name). */
const SYMMETRIC_CHARACTER_TYPES = new Set(['rival', 'sibling']);

/**
 * Convert a relationship type slug to a human-readable heading.
 * Falls back to capitalising and replacing hyphens for unknown types.
 */
export function formatRelationshipType(type: string): string {
  const label = TYPE_LABELS[type];
  if (label) return label;
  return type
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Returns true when a character relationship role is redundant for display.
 * A role is redundant when the type is symmetric and the role matches the
 * type name exactly (e.g., role "rival" under type "rival").
 * Null roles are not redundant — they are absent (caller handles via `{role && ...}`).
 */
export function isRedundantCharacterRole(type: string, role: string | null): boolean {
  if (role === null) return false;
  return SYMMETRIC_CHARACTER_TYPES.has(type) && role === type;
}

/** Group an array of records by their `type` field, preserving insertion order. */
export function groupByType<T extends { type: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const group = map.get(item.type);
    if (group) {
      group.push(item);
    } else {
      map.set(item.type, [item]);
    }
  }
  return map;
}

/**
 * If all records in a group share the same non-null subtype, return it.
 * Otherwise return null (caller renders per-item badges).
 */
export function getGroupSubtype(items: Array<{ subtype: string | null }>): string | null {
  if (items.length === 0) return null;
  const first = items[0].subtype;
  if (first === null) return null;
  return items.every((item) => item.subtype === first) ? first : null;
}
