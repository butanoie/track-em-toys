import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DetailField } from '../DetailField';

describe('DetailField', () => {
  it('renders label and value', () => {
    render(<DetailField label="Size Class" value="Leader" />);
    expect(screen.getByText('Size Class')).toBeInTheDocument();
    expect(screen.getByText('Leader')).toBeInTheDocument();
  });

  it('renders children instead of value when both are provided', () => {
    render(
      <DetailField label="Character" value="fallback">
        <a href="/char">Optimus Prime</a>
      </DetailField>
    );
    expect(screen.getByText('Optimus Prime')).toBeInTheDocument();
    expect(screen.queryByText('fallback')).not.toBeInTheDocument();
  });

  it('returns null when both value and children are absent', () => {
    const { container } = render(<DetailField label="Empty" />);
    expect(container.innerHTML).toBe('');
  });

  it('returns null when value is null', () => {
    const { container } = render(<DetailField label="Empty" value={null} />);
    expect(container.innerHTML).toBe('');
  });
});
