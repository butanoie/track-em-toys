import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { FranchiseHubPage } from '@/catalog/pages/FranchiseHubPage';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const hubSearchSchema = z.object({
  view: z.enum(['items', 'characters']).optional().catch(undefined),
});

export const Route = createFileRoute('/_authenticated/catalog/$franchise/')({
  validateSearch: hubSearchSchema,
  pendingComponent: () => <LoadingSpinner className="py-16" />,
  component: FranchiseHubPage,
});
