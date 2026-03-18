import { describe, it, expect } from 'vitest';
import { buildSearchTsquery } from './queries.js';

describe('buildSearchTsquery', () => {
  it('returns prefix match for single word', () => {
    expect(buildSearchTsquery('optimus')).toBe("'optimus':*");
  });

  it('returns exact + prefix for multiple words', () => {
    expect(buildSearchTsquery('optimus prime')).toBe("'optimus' & 'prime':*");
  });

  it('handles partial last word', () => {
    expect(buildSearchTsquery('optimus pr')).toBe("'optimus' & 'pr':*");
  });

  it('strips punctuation', () => {
    expect(buildSearchTsquery('optimus!!!')).toBe("'optimus':*");
  });

  it('splits hyphens into separate tokens (product codes like FT-44)', () => {
    expect(buildSearchTsquery('FT-44')).toBe("'ft' & '44':*");
  });

  it('lowercases input', () => {
    expect(buildSearchTsquery('MEGATRON')).toBe("'megatron':*");
  });

  it('handles extra whitespace', () => {
    expect(buildSearchTsquery('  optimus   prime  ')).toBe("'optimus' & 'prime':*");
  });

  it('returns null for empty string', () => {
    expect(buildSearchTsquery('')).toBeNull();
  });

  it('returns null for whitespace-only', () => {
    expect(buildSearchTsquery('   ')).toBeNull();
  });

  it('returns null for punctuation-only', () => {
    expect(buildSearchTsquery('!!!')).toBeNull();
  });

  it('handles three words', () => {
    expect(buildSearchTsquery('the transformers movie')).toBe("'the' & 'transformers' & 'movie':*");
  });
});
