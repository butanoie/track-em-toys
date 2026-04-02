import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useMlStatsSummary, useMlStatsDaily, useMlStatsModels } from './hooks';
import { Route } from '@/routes/_authenticated/admin/ml';

const DAYS_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
] as const;

export function MlStatsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const days = search.days ?? 7;

  const { data: summary, isPending: summaryLoading } = useMlStatsSummary(days);
  const { data: daily, isPending: dailyLoading } = useMlStatsDaily(days);
  const { data: models, isPending: modelsLoading } = useMlStatsModels(days);

  const handleDaysChange = useCallback(
    (value: string) => {
      void navigate({
        to: '/admin/ml',
        search: { days: parseInt(value, 10) },
      });
    },
    [navigate]
  );

  return (
    <div className="flex-1 space-y-6 overflow-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">ML Stats</h1>
        <Select value={String(days)} onValueChange={handleDaysChange}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DAYS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary stat cards */}
      {summaryLoading ? (
        <LoadingSpinner className="py-8" />
      ) : summary ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Scans" value={summary.total_scans} />
          <StatCard
            title="Acceptance Rate"
            value={`${(summary.acceptance_rate * 100).toFixed(1)}%`}
            subtitle={`${summary.predictions_accepted} accepted`}
          />
          <StatCard
            title="Error Rate"
            value={`${(summary.error_rate * 100).toFixed(1)}%`}
            subtitle={`${summary.scans_failed} failed`}
          />
          <StatCard title="Completed" value={summary.scans_completed} />
        </div>
      ) : null}

      {/* Daily scans chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {dailyLoading ? (
            <LoadingSpinner className="py-8" />
          ) : daily && daily.data.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={daily.data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(d: string) => d.slice(5)} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="scans_completed"
                  name="Completed"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="predictions_accepted"
                  name="Accepted"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="scans_failed"
                  name="Failed"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No data for this period.</p>
          )}
        </CardContent>
      </Card>

      {/* Model comparison chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Model Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          {modelsLoading ? (
            <LoadingSpinner className="py-8" />
          ) : models && models.data.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={models.data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="model_name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="total_scans" name="Total Scans" fill="#3b82f6" />
                <Bar dataKey="predictions_accepted" name="Accepted" fill="#22c55e" />
                <Bar dataKey="scans_failed" name="Failed" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No model data for this period.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, subtitle }: { title: string; value: string | number; subtitle?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
