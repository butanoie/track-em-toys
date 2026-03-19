import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { ManufacturerItemsPage } from '@/catalog/pages/ManufacturerItemsPage';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const manufacturerItemsSearchSchema = z.object({
  franchise: z.string().optional().catch(undefined),
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

export const Route = createFileRoute('/_authenticated/catalog/manufacturers/$slug/items')({
  validateSearch: manufacturerItemsSearchSchema,
  pendingComponent: () => <LoadingSpinner className="py-16" />,
  component: ManufacturerItemsPage,
});
