import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConditionBadge } from '../ConditionBadge';

describe('ConditionBadge', () => {
  it('renders short code by default', () => {
    render(<ConditionBadge condition="mint_sealed" />);
    expect(screen.getByText('MISB')).toBeInTheDocument();
  });

  it('renders full label when variant is "full"', () => {
    render(<ConditionBadge condition="mint_sealed" variant="full" />);
    expect(screen.getByText('Mint Sealed')).toBeInTheDocument();
  });

  it('renders title with full label for accessibility', () => {
    render(<ConditionBadge condition="damaged" />);
    expect(screen.getByTitle('Damaged')).toBeInTheDocument();
  });

  it('renders all 7 condition values without error', () => {
    const conditions = [
      'mint_sealed',
      'opened_complete',
      'opened_incomplete',
      'loose_complete',
      'loose_incomplete',
      'damaged',
      'unknown',
    ] as const;
    for (const c of conditions) {
      const { unmount, container } = render(<ConditionBadge condition={c} />);
      expect(container.querySelector('[title]')).toBeInTheDocument();
      unmount();
    }
  });
});
