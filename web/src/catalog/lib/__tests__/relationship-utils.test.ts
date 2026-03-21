import { describe, it, expect } from 'vitest';
import {
  formatRelationshipType,
  isRedundantCharacterRole,
  groupByType,
  getGroupSubtype,
} from '../relationship-utils';

describe('formatRelationshipType', () => {
  it.each([
    ['combiner-component', 'Combiner Components'],
    ['partner-bond', 'Partner Bonds'],
    ['vehicle-crew', 'Vehicle Crew'],
    ['rival', 'Rivals'],
    ['sibling', 'Siblings'],
    ['mentor-student', 'Mentor / Student'],
    ['evolution', 'Evolution'],
    ['mold-origin', 'Mold Origin'],
    ['gift-set-contents', 'Gift Set Contents'],
    ['variant', 'Variants'],
  ])('maps "%s" to "%s"', (input, expected) => {
    expect(formatRelationshipType(input)).toBe(expected);
  });

  it('falls back to capitalised words for unknown types', () => {
    expect(formatRelationshipType('some-new-type')).toBe('Some New Type');
  });
});

describe('isRedundantCharacterRole', () => {
  it('returns false when role is null (absent, not redundant)', () => {
    expect(isRedundantCharacterRole('combiner-component', null)).toBe(false);
  });

  it('returns true when symmetric type and role matches type name', () => {
    expect(isRedundantCharacterRole('rival', 'rival')).toBe(true);
    expect(isRedundantCharacterRole('sibling', 'sibling')).toBe(true);
  });

  it('returns false when symmetric type but role differs from type name', () => {
    expect(isRedundantCharacterRole('sibling', 'twin')).toBe(false);
  });

  it('returns false for non-symmetric types even when role matches type name', () => {
    expect(isRedundantCharacterRole('combiner-component', 'combiner-component')).toBe(false);
  });

  it('returns false for non-symmetric types with distinct roles', () => {
    expect(isRedundantCharacterRole('combiner-component', 'right leg')).toBe(false);
    expect(isRedundantCharacterRole('vehicle-crew', 'driver')).toBe(false);
  });

  it('returns false for item relationship types (not symmetric)', () => {
    expect(isRedundantCharacterRole('variant', 'base')).toBe(false);
    expect(isRedundantCharacterRole('variant', 'variant')).toBe(false);
  });
});

describe('groupByType', () => {
  it('returns empty map for empty input', () => {
    expect(groupByType([])).toEqual(new Map());
  });

  it('groups items by type preserving insertion order', () => {
    const items = [
      { type: 'rival', name: 'A' },
      { type: 'combiner-component', name: 'B' },
      { type: 'rival', name: 'C' },
    ];
    const result = groupByType(items);
    const keys = [...result.keys()];
    expect(keys).toEqual(['rival', 'combiner-component']);
    expect(result.get('rival')).toEqual([
      { type: 'rival', name: 'A' },
      { type: 'rival', name: 'C' },
    ]);
    expect(result.get('combiner-component')).toEqual([{ type: 'combiner-component', name: 'B' }]);
  });
});

describe('getGroupSubtype', () => {
  it('returns null for empty array', () => {
    expect(getGroupSubtype([])).toBeNull();
  });

  it('returns null when first item subtype is null', () => {
    expect(getGroupSubtype([{ subtype: null }, { subtype: 'x' }])).toBeNull();
  });

  it('returns the subtype when all items share the same non-null subtype', () => {
    expect(getGroupSubtype([{ subtype: 'headmaster' }, { subtype: 'headmaster' }])).toBe('headmaster');
  });

  it('returns null when items have mixed subtypes', () => {
    expect(getGroupSubtype([{ subtype: 'headmaster' }, { subtype: 'targetmaster' }])).toBeNull();
  });

  it('returns the subtype for a single item', () => {
    expect(getGroupSubtype([{ subtype: 'upgrade' }])).toBe('upgrade');
  });

  it('returns null for a single item with null subtype', () => {
    expect(getGroupSubtype([{ subtype: null }])).toBeNull();
  });
});
