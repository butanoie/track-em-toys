import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { CharactersPage } from '@/catalog/pages/CharactersPage';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { pageLimitSchema } from '@/lib/pagination-constants';

const charactersSearchSchema = z.object({
  continuity_family: z.string().optional().catch(undefined),
  faction: z.string().optional().catch(undefined),
  character_type: z.string().optional().catch(undefined),
  sub_group: z.string().optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
  limit: pageLimitSchema,
  selected: z.string().optional().catch(undefined),
});

export const Route = createFileRoute('/_authenticated/catalog/$franchise/characters/')({
  validateSearch: charactersSearchSchema,
  pendingComponent: () => <LoadingSpinner className="py-16" />,
  component: CharactersPage,
});
