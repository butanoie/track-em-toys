import { createFileRoute } from '@tanstack/react-router';
import { FranchiseHubPage } from '@/catalog/pages/FranchiseHubPage';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export const Route = createFileRoute('/_authenticated/catalog/$franchise/')({
  pendingComponent: () => <LoadingSpinner className="py-16" />,
  component: FranchiseHubPage,
});
