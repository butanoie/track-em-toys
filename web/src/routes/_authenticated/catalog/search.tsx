import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { SearchPage } from '@/catalog/pages/SearchPage';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const searchSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  type: z.enum(['character', 'item']).optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
  limit: z.coerce.number().int().min(1).max(100).optional().catch(undefined),
  selected: z.string().optional().catch(undefined),
  selected_type: z.enum(['item', 'character']).optional().catch(undefined),
});

export const Route = createFileRoute('/_authenticated/catalog/search')({
  validateSearch: searchSearchSchema,
  pendingComponent: () => <LoadingSpinner className="py-16" />,
  component: SearchPage,
});
