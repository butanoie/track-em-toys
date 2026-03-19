import { createFileRoute } from '@tanstack/react-router';
import { ManufacturerListPage } from '@/catalog/pages/ManufacturerListPage';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export const Route = createFileRoute('/_authenticated/catalog/manufacturers/')({
  pendingComponent: () => <LoadingSpinner className="py-16" />,
  component: ManufacturerListPage,
});
