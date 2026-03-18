import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import scalar from '@scalar/fastify-api-reference';
import fp from 'fastify-plugin';

async function docsPluginImpl(fastify: FastifyInstance, _opts: object): Promise<void> {
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: "Track'em Toys API",
        description: "REST API for the Track'em Toys collector catalog & pricing app.",
        version: '0.1.0',
      },
      servers: [{ url: 'http://localhost:3000', description: 'Local development' }],
      tags: [
        { name: 'system', description: 'Health and status endpoints' },
        { name: 'jwks', description: 'JSON Web Key Set discovery' },
        { name: 'auth', description: 'Authentication and session management' },
        {
          name: 'catalog',
          description: 'Shared toy catalog — characters, items, manufacturers, toy lines, and reference data',
        },
        { name: 'catalog-search', description: 'Full-text search across the catalog' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await fastify.register(scalar, {
    routePrefix: '/reference',
  });
}

export const docsPlugin = fp(docsPluginImpl, { name: 'docs-plugin' });
