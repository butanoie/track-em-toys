import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../hooks', () => ({
  useMlStatsSummary: vi.fn().mockReturnValue({
    data: {
      total_scans: 100,
      scans_completed: 80,
      scans_failed: 5,
      predictions_accepted: 40,
      acceptance_rate: 0.4,
      error_rate: 0.05,
      by_model: [
        { model_name: 'primary-classifier', scans: 60, accepted: 30 },
        { model_name: 'secondary-classifier', scans: 40, accepted: 10 },
      ],
    },
    isPending: false,
  }),
  useMlStatsDaily: vi.fn().mockReturnValue({
    data: { data: [] },
    isPending: false,
  }),
  useMlStatsModels: vi.fn().mockReturnValue({
    data: { data: [] },
    isPending: false,
  }),
}));

vi.mock('@/routes/_authenticated/admin/ml', () => ({
  Route: { useSearch: () => ({ days: 7 }) },
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: () => <div data-testid="line-chart" />,
  BarChart: () => <div data-testid="bar-chart" />,
  Line: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

import { MlStatsPage } from '../MlStatsPage';

describe('MlStatsPage', () => {
  it('renders stat cards with summary data', () => {
    render(<MlStatsPage />);

    expect(screen.getByText('Total Scans')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('40.0%')).toBeInTheDocument();
    expect(screen.getByText('5.0%')).toBeInTheDocument();
  });

  it('renders page heading', () => {
    render(<MlStatsPage />);

    expect(screen.getByText('ML Stats')).toBeInTheDocument();
  });

  it('renders chart sections', () => {
    render(<MlStatsPage />);

    expect(screen.getByText('Daily Activity')).toBeInTheDocument();
    expect(screen.getByText('Model Comparison')).toBeInTheDocument();
  });

  it('shows empty state for charts when no data', () => {
    render(<MlStatsPage />);

    expect(screen.getAllByText('No data for this period.')).toHaveLength(1);
    expect(screen.getAllByText('No model data for this period.')).toHaveLength(1);
  });
});
