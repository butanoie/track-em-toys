import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: () => <div data-testid="bar-chart" />,
  Bar: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

import { ModelQualitySection } from '../ModelQualitySection';
import type { MlModelQuality } from '@/lib/zod-schemas';

const mockQualityData: MlModelQuality = {
  models: [
    {
      name: 'primary-classifier',
      version: 'primary-classifier-20260401-c3-a85.0',
      category: 'primary',
      accuracy: 0.85,
      class_count: 3,
      size_bytes: 7_000_000,
      trained_at: '2026-04-01T00:00:00Z',
      metrics_available: true,
      top3_accuracy: 0.95,
      quality_gates: { accuracy_pass: true, size_pass: true },
      per_class_accuracy: [
        { label: 'transformers__bumblebee', accuracy: 0.8 },
        { label: 'gi-joe__snake-eyes', accuracy: 0.85 },
        { label: 'transformers__optimus-prime', accuracy: 0.9 },
      ],
      confused_pairs: [
        {
          true_label: 'transformers__bumblebee',
          predicted_label: 'transformers__optimus-prime',
          count: 2,
          pct_of_true_class: 0.2,
        },
      ],
      hyperparams: { lr: 0.001 },
    },
  ],
};

describe('ModelQualitySection', () => {
  it('renders loading state', () => {
    render(<ModelQualitySection data={undefined} isPending={true} />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders nothing when no models', () => {
    const { container } = render(<ModelQualitySection data={{ models: [] }} isPending={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders model quality heading and comparison cards', () => {
    render(<ModelQualitySection data={mockQualityData} isPending={false} />);

    expect(screen.getByText('Model Quality')).toBeInTheDocument();
    expect(screen.getByText('primary-classifier')).toBeInTheDocument();
    expect(screen.getByText('85.0%')).toBeInTheDocument();
    expect(screen.getByText('95.0%')).toBeInTheDocument();
  });

  it('renders per-class accuracy and confused pairs sections', () => {
    render(<ModelQualitySection data={mockQualityData} isPending={false} />);

    expect(screen.getByText('Per-Class Accuracy')).toBeInTheDocument();
    expect(screen.getByText('Top Confused Pairs')).toBeInTheDocument();
  });

  it('renders quality gate badges', () => {
    render(<ModelQualitySection data={mockQualityData} isPending={false} />);

    expect(screen.getByText('Accuracy PASS')).toBeInTheDocument();
    expect(screen.getByText('Size PASS')).toBeInTheDocument();
  });

  it('shows notice when metrics are not available', () => {
    const noMetrics: MlModelQuality = {
      models: [
        {
          ...mockQualityData.models[0]!,
          metrics_available: false,
          per_class_accuracy: null,
          confused_pairs: null,
          top3_accuracy: null,
          hyperparams: null,
        },
      ],
    };

    render(<ModelQualitySection data={noMetrics} isPending={false} />);
    expect(screen.getByText(/Metrics file not found/)).toBeInTheDocument();
  });
});
