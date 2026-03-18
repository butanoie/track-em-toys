# Interactive API Documentation with Swagger and Scalar

**Date:** 2026-03-04
**Time:** 07:07:08 UTC
**Type:** Infrastructure
**Phase:** 1.2 (API Auth)
**Version:** v0.2.5

## Summary

Added auto-generated OpenAPI 3.0 documentation and an interactive API reference UI powered by `@fastify/swagger` and `@scalar/fastify-api-reference`. The docs plugin is gated to non-production environments and serves an interactive explorer at `/reference/`. All 6 existing route schemas were enriched with descriptions, tags, summaries, and security metadata.

---

## Changes Implemented

### 1. Docs Plugin

Created a Fastify plugin that registers Swagger (OpenAPI spec generation) and Scalar (interactive reference UI).

**Created:**

- `api/src/plugins/docs.ts` — Plugin using `fastify-plugin` wrapper that registers:
  - `@fastify/swagger` — Generates OpenAPI 3.0.3 spec from Fastify route schemas
  - `@scalar/fastify-api-reference` — Serves interactive API explorer at `/reference/`
  - Defines three API tags: `system`, `jwks`, `auth`
  - Declares `bearerAuth` security scheme (HTTP Bearer with JWT format)

### 2. Server Integration

Registered the docs plugin in `buildServer()`, gated behind an environment check so it's excluded in production.

**Modified:**

- `api/src/server.ts` — Conditionally registers `docsPlugin` when `nodeEnv !== 'production'`

### 3. Schema Enrichment

Enhanced all existing route schemas with OpenAPI metadata for better documentation.

**Modified:**

- `api/src/auth/schemas.ts` — Added `description`, `summary`, `tags`, and `security` fields to all 6 route schemas (signin, refresh, logout, link-account, JWKS, health)
- `api/src/auth/jwks.ts` — Added schema metadata for the JWKS discovery endpoint

### 4. Dependencies

**Added:**

- `@fastify/swagger` — OpenAPI spec generation from Fastify schemas
- `@scalar/fastify-api-reference` — Modern API reference UI (alternative to Swagger UI)

**Modified:**

- `api/package.json` — Added 2 new dependencies
- `api/package-lock.json` — Lock file updated (+277 lines)

---

## Technical Details

### OpenAPI Spec Configuration

```typescript
openapi: {
  openapi: '3.0.3',
  info: {
    title: "Track'em Toys API",
    version: '0.1.0',
  },
  tags: [
    { name: 'system', description: 'Health and status endpoints' },
    { name: 'jwks', description: 'JSON Web Key Set discovery' },
    { name: 'auth', description: 'Authentication and session management' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
}
```

### Environment Gating

The docs plugin is only registered when `config.nodeEnv !== 'production'`, keeping the OpenAPI spec and reference UI inaccessible in production deployments. This is a defense-in-depth measure — the spec itself isn't secret, but exposing a full API explorer in production is unnecessary attack surface.

### Test Strategy

Tests use `vi.doMock()` + `vi.resetModules()` to swap `config.nodeEnv` between describe blocks, giving each suite a fresh `buildServer()` import that sees the correct environment. This verifies both that docs are served in development and that they are absent in production.

---

## Validation & Testing

**Created:**

- `api/src/plugins/docs.test.ts` — 158 lines covering:
  - OpenAPI spec generation (`/documentation/json` returns valid spec)
  - Scalar reference UI serves at `/reference/`
  - Route schemas appear with correct tags and descriptions
  - Production environment excludes docs routes (404)
  - Security scheme declaration in spec output

---

## Impact Assessment

- **Developer experience**: Developers can explore and test all API endpoints interactively at `https://localhost:3010/reference/`
- **Schema quality**: Enriching route schemas with descriptions and tags improves both documentation and validation error messages
- **Production safety**: Environment gating ensures no documentation leakage in production
- **Future routes**: All new routes automatically appear in the docs when they define Fastify schemas

---

## Related Files

**Created (2):**

- `api/src/plugins/docs.ts`
- `api/src/plugins/docs.test.ts`

**Modified (4):**

- `api/src/server.ts`
- `api/src/auth/schemas.ts`
- `api/src/auth/jwks.ts`
- `api/package.json`

---

## Summary Statistics

| Metric                 | Count |
| ---------------------- | ----- |
| Files created          | 2     |
| Files modified         | 4     |
| Lines added            | ~504  |
| Dependencies added     | 2     |
| Route schemas enriched | 6     |
| Test lines added       | 158   |

---

## Status

✅ COMPLETE
