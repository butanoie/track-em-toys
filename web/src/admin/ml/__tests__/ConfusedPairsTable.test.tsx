import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfusedPairsTable } from '../ConfusedPairsTable';

describe('ConfusedPairsTable', () => {
  it('renders confused pairs as table rows', () => {
    render(
      <ConfusedPairsTable
        pairs={[
          {
            true_label: 'transformers__bumblebee',
            predicted_label: 'transformers__optimus-prime',
            count: 5,
            pct_of_true_class: 0.25,
          },
          { true_label: 'gi-joe__snake-eyes', predicted_label: 'gi-joe__scarlett', count: 3, pct_of_true_class: 0.15 },
        ]}
      />
    );

    expect(screen.getByText('Bumblebee')).toBeInTheDocument();
    expect(screen.getByText('Optimus Prime')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('25.0%')).toBeInTheDocument();

    expect(screen.getByText('Snake Eyes')).toBeInTheDocument();
    expect(screen.getByText('Scarlett')).toBeInTheDocument();
  });

  it('shows perfect classification message when pairs is empty', () => {
    render(<ConfusedPairsTable pairs={[]} />);
    expect(screen.getByText(/perfect classification/)).toBeInTheDocument();
  });

  it('renders table headers', () => {
    render(
      <ConfusedPairsTable pairs={[{ true_label: 'a__b', predicted_label: 'a__c', count: 1, pct_of_true_class: 0.1 }]} />
    );

    expect(screen.getByText('True Class')).toBeInTheDocument();
    expect(screen.getByText('Predicted As')).toBeInTheDocument();
    expect(screen.getByText('Count')).toBeInTheDocument();
    expect(screen.getByText('% of True')).toBeInTheDocument();
  });
});
