import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { MlStatsPage } from '@/admin/ml/MlStatsPage';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const searchSchema = z.object({
  days: z.number().int().optional().catch(undefined),
});

export const Route = createFileRoute('/_authenticated/admin/ml')({
  validateSearch: searchSchema,
  pendingComponent: () => <LoadingSpinner className="py-16" />,
  component: MlStatsPage,
});
