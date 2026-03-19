import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { ItemsPage } from '@/catalog/pages/ItemsPage';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const itemsSearchSchema = z.object({
  manufacturer: z.string().optional().catch(undefined),
  size_class: z.string().optional().catch(undefined),
  toy_line: z.string().optional().catch(undefined),
  continuity_family: z.string().optional().catch(undefined),
  is_third_party: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional()
    .catch(undefined),
  cursor: z.string().optional().catch(undefined),
  selected: z.string().optional().catch(undefined),
});

export const Route = createFileRoute('/_authenticated/catalog/$franchise/items')({
  validateSearch: itemsSearchSchema,
  pendingComponent: () => <LoadingSpinner className="py-16" />,
  component: ItemsPage,
});
