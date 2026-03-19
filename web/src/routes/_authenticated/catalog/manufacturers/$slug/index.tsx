import { createFileRoute } from '@tanstack/react-router';
import { ManufacturerHubPage } from '@/catalog/pages/ManufacturerHubPage';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export const Route = createFileRoute('/_authenticated/catalog/manufacturers/$slug/')({
  pendingComponent: () => <LoadingSpinner className="py-16" />,
  component: ManufacturerHubPage,
});
