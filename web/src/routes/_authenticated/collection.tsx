import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { CollectionConditionSchema } from '@/lib/zod-schemas';
import { pageLimitSchema } from '@/lib/pagination-constants';
import { CollectionPage } from '@/collection/pages/CollectionPage';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const collectionSearchSchema = z.object({
  franchise: z.string().optional().catch(undefined),
  condition: z.enum(CollectionConditionSchema.options).optional().catch(undefined),
  search: z.string().optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
  limit: pageLimitSchema,
  selected: z.string().optional().catch(undefined),
  selected_franchise: z.string().optional().catch(undefined),
});

export const Route = createFileRoute('/_authenticated/collection')({
  validateSearch: collectionSearchSchema,
  pendingComponent: () => <LoadingSpinner className="py-16" />,
  component: CollectionPage,
});
