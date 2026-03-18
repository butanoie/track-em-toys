import type { FastifyInstance } from 'fastify';
import { listManufacturers, getManufacturerBySlug } from './queries.js';
import { listManufacturersSchema, getManufacturerSchema } from './schemas.js';

/**
 * Register manufacturer catalog routes.
 *
 * @param fastify - Fastify instance
 * @param _opts - Fastify plugin options (unused)
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin contract requires async
export async function manufacturerRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  fastify.get(
    '/',
    {
      schema: listManufacturersSchema,
      config: { rateLimit: { max: 100, timeWindow: '1 minute' } },
    },
    async () => {
      const data = await listManufacturers();
      return { data };
    }
  );

  fastify.get<{ Params: { slug: string } }>(
    '/:slug',
    {
      schema: getManufacturerSchema,
      config: { rateLimit: { max: 100, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const manufacturer = await getManufacturerBySlug(request.params.slug);
      if (!manufacturer) {
        return reply.code(404).send({ error: 'Manufacturer not found' });
      }
      return manufacturer;
    }
  );
}
