import { createFileRoute } from '@tanstack/react-router';
import { ItemDetailPage } from '@/catalog/pages/ItemDetailPage';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export const Route = createFileRoute('/_authenticated/catalog/$franchise/items/$slug')({
  pendingComponent: () => <LoadingSpinner className="py-16" />,
  component: ItemDetailPage,
});
