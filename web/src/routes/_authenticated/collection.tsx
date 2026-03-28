import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { PackageConditionSchema } from '@/lib/zod-schemas';
import { pageLimitSchema } from '@/lib/pagination-constants';
import { CollectionPage } from '@/collection/pages/CollectionPage';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const collectionSearchSchema = z.object({
  franchise: z.string().optional().catch(undefined),
  toy_line: z.string().optional().catch(undefined),
  package_condition: z.enum(PackageConditionSchema.options).optional().catch(undefined),
  item_condition_min: z.coerce.number().int().min(1).max(10).optional().catch(undefined),
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
