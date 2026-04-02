import { describe, it, expect } from 'vitest';
import { formatClassLabel, formatClassLabelFull } from './format-utils';

describe('formatClassLabel', () => {
  it('strips franchise prefix and title-cases the item slug', () => {
    expect(formatClassLabel('transformers__optimus-prime')).toBe('Optimus Prime');
  });

  it('handles single-word items', () => {
    expect(formatClassLabel('transformers__bumblebee')).toBe('Bumblebee');
  });

  it('handles labels without franchise prefix', () => {
    expect(formatClassLabel('optimus-prime')).toBe('Optimus Prime');
  });

  it('handles multi-segment franchise names', () => {
    expect(formatClassLabel('gi-joe__classified-snake-eyes')).toBe('Classified Snake Eyes');
  });
});

describe('formatClassLabelFull', () => {
  it('shows franchise and item with separator', () => {
    expect(formatClassLabelFull('transformers__optimus-prime')).toBe('Transformers › Optimus Prime');
  });

  it('handles multi-word franchise', () => {
    expect(formatClassLabelFull('gi-joe__snake-eyes')).toBe('Gi Joe › Snake Eyes');
  });

  it('falls back to formatClassLabel when no delimiter', () => {
    expect(formatClassLabelFull('optimus-prime')).toBe('Optimus Prime');
  });
});
