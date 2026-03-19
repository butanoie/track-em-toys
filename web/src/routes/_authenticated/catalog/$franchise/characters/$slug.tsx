import { createFileRoute } from '@tanstack/react-router';
import { CharacterDetailPage } from '@/catalog/pages/CharacterDetailPage';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export const Route = createFileRoute('/_authenticated/catalog/$franchise/characters/$slug')({
  pendingComponent: () => <LoadingSpinner className="py-16" />,
  component: CharacterDetailPage,
});
