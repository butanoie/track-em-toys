import { createFileRoute } from '@tanstack/react-router';
import { FranchiseListPage } from '@/catalog/pages/FranchiseListPage';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export const Route = createFileRoute('/_authenticated/catalog/')({
  pendingComponent: () => <LoadingSpinner className="py-16" />,
  component: FranchiseListPage,
});
