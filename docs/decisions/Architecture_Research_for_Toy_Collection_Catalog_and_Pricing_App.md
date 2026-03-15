# Architecture research for the Toy Collection Catalog & Pricing App

This report covers three additions to your requirements document: a shared-reference/private-instance PostgreSQL data model, OAuth2 authentication with Apple and Google, and Railway deployment. Each section provides implementation-ready detail — schema designs, library choices, configuration specifics, and cost estimates — so you can write precise, professional requirements sections directly from this research.

---

## 1. Shared catalog, private collections: the PostgreSQL data model

The core architectural pattern is well-established across collectible platforms: a **single shared schema** with `user_id` columns on private tables, not separate schemas per user. Discogs, MusicBrainz, Goodreads, BoardGameGeek, and MyFigureCollection all use this approach. Per-user schemas don't scale beyond a few hundred users and create operational nightmares for migrations, backups, and cross-user aggregation queries.

### Shared reference tables (readable by all users)

The shared item catalog stores the canonical definition of "what a figure is." No `user_id` columns appear on these tables — they are community-owned reference data.

```sql
CREATE TABLE manufacturers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,  -- URL-safe kebab-case key
    country TEXT, website_url VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,  -- URL-safe kebab-case key
    franchise TEXT NOT NULL DEFAULT 'Transformers',
    faction_id UUID REFERENCES factions(id) ON DELETE SET NULL,
    character_type TEXT,  -- 'Transformer', 'Human', etc.
    sub_group_id UUID REFERENCES sub_groups(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,  -- manufacturer's product name (e.g., "Phoenix" for a 3P Optimus Prime)
    slug TEXT NOT NULL UNIQUE,  -- URL-safe kebab-case key
    manufacturer_id UUID REFERENCES manufacturers(id),
    character_id UUID REFERENCES characters(id),
    toy_line_id UUID REFERENCES toy_lines(id),
    year_released INTEGER,
    description TEXT, barcode TEXT, sku TEXT,
    product_code TEXT,  -- user-definable item ID (e.g., "MP-44", "FT-44")
    is_third_party BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES users(id),
    data_quality TEXT NOT NULL DEFAULT 'needs_review'
        CHECK (data_quality IN ('needs_review', 'verified', 'community_verified')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE item_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    url TEXT NOT NULL, caption TEXT,
    uploaded_by UUID REFERENCES users(id),
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### Private collection tables (per-user, isolated by RLS)

Each collector's personal data lives in tables keyed by `user_id`. The **`user_collection_items`** table is the critical bridge — it links a user to a shared catalog item and holds all private metadata.

```sql
CREATE TABLE user_collection_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    condition TEXT CHECK (condition IN ('mint','near_mint','excellent','good','fair','poor')),
    acquisition_price NUMERIC(12,2),
    acquisition_source TEXT,
    acquisition_date DATE,
    quantity INTEGER DEFAULT 1,
    is_for_sale BOOLEAN DEFAULT FALSE,
    asking_price NUMERIC(12,2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, item_id)
);

CREATE TABLE user_pricing_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_collection_item_id UUID NOT NULL REFERENCES user_collection_items(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),  -- denormalized for RLS
    price NUMERIC(12,2) NOT NULL,
    source TEXT,
    recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_wantlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    priority INTEGER DEFAULT 0,
    max_price NUMERIC(12,2), notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, item_id)
);
```

**Key design note**: The `user_id` column is **denormalized onto `user_pricing_records`** rather than relying on a join through `user_collection_items`. This avoids chained RLS policy evaluation, which can cause exponential performance degradation on large tables.

### Row-Level Security enforces data isolation at the database level

RLS is enabled **only on private tables** — shared catalog tables remain open to all authenticated users. The pattern uses PostgreSQL session variables set at the start of each API request.

```sql
-- Enable RLS on private tables only
ALTER TABLE user_collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_pricing_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_wantlist ENABLE ROW LEVEL SECURITY;

-- Session context function
CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.user_id', true), '')::UUID;
END;
$$ LANGUAGE plpgsql STABLE;

-- Critical optimization: wrap in subselect for initPlan caching
CREATE POLICY user_isolation ON user_collection_items
    FOR ALL USING (user_id = (SELECT current_app_user_id()));
```

At the start of every API request, the backend runs `SELECT set_config('app.user_id', '<id>', false)` — then all queries on RLS-protected tables are automatically filtered. **The `(SELECT ...)` wrapper** is essential: without it, PostgreSQL evaluates the function per-row instead of caching the result, causing **100x+ performance degradation** on large tables (documented by Supabase).

Three critical RLS rules for production: always **index columns used in RLS policies** (composite `(user_id, item_id)` indexes on collection tables); never use the table owner role for application connections (RLS doesn't apply to owners); and combine RLS with application-level authorization for complex business rules like moderator access.

### Catalog contribution model follows MusicBrainz patterns

For the shared catalog, an **approval queue** pattern handles user contributions. MusicBrainz's open-source PostgreSQL schema is the gold standard reference implementation.

```sql
CREATE TABLE catalog_edits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES items(id),
    editor_id UUID NOT NULL REFERENCES users(id),
    edit_type TEXT NOT NULL CHECK (edit_type IN ('create','update','merge','delete')),
    data_before JSONB,
    data_after JSONB NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','auto_approved')),
    reviewed_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);
```

The hybrid approach works best for a growing community: **new users' edits require approval**, established contributors (based on edit count and approval rate) get auto-approved, and all changes are tracked in an audit log regardless. This mirrors how Discogs and MusicBrainz graduated trust levels.

### Indexing strategy and key query patterns

The four primary query patterns each need specific index support:

- **Browse catalog** (no user context): Full-text search via `gin_trgm_ops` index on `items.name`, plus standard B-tree indexes on `manufacturer_id`, `character_id`
- **View my collection** (RLS-filtered): Composite `(user_id, item_id)` unique index plus `(user_id, created_at DESC)` for sorted browsing
- **Catalog browse with "in my collection" overlay**: LEFT JOIN private data onto public results using `AND ci.user_id = (SELECT current_app_user_id())`
- **Aggregate stats** ("1,247 collectors have this"): Separate `item_id` index on `user_collection_items`, or materialized views for `have_count`/`want_count` on high-traffic items

---

## 2. OAuth2 with Apple and Google: a unified authentication architecture

Both providers use standard OIDC flows, but Apple has significant quirks. The architecture must handle **two client types** (web SPA + native iOS) authenticating against the same backend, with different `client_id` values per provider per platform.

### The unified sign-in endpoint pattern

Rather than separate endpoints per provider, the backend exposes a single endpoint that routes to the appropriate validator:

```
POST /auth/signin
{
  "provider": "apple" | "google",
  "id_token": "<provider_jwt>",
  "user_info": { "name": "..." }  // Apple first-login only
}
→ { "access_token": "<app_jwt>", "refresh_token": "<app_refresh>", "user": {...} }
```

The flow for both web and native clients is identical from the backend's perspective: **client gets `id_token` from provider → sends to backend → backend validates cryptographically → issues session tokens**. The critical implementation detail is that the `audience` check must accept an **array** of valid client IDs — Apple's Bundle ID for iOS plus Services ID for web, and Google's separate web and iOS client IDs.

### Apple Sign-In implementation details

Apple's OIDC flow has five quirks that must be handled in the requirements:

- **User info arrives only on first authorization**. Full name and email are provided exactly once. The backend must store this data immediately or it's permanently lost. To re-test, users must revoke the app in Settings → Apple ID → Sign-In & Security.
- **No static client secret**. Apple requires a JWT signed with your `.p8` private key (ES256) as the `client_secret`, regenerated every 6 months maximum.
- **Two different `client_id` values**. iOS uses the app's **Bundle ID** (e.g., `com.myapp.ios`); web uses a **Services ID** (e.g., `com.myapp.web`). The backend's audience validation must accept both.
- **Private email relay**. Users can hide their email, receiving a `@privaterelay.appleid.com` address. This won't match any Google email for the same user — account linking fails for these users without explicit UI.
- **Server-to-server notifications**. Apple sends webhooks for consent-revoked and account-delete events. The backend must handle these to stay compliant with App Store requirements.

**Apple Developer setup requires**: an App ID with Sign in with Apple enabled, a Services ID configured with your web domain and return URLs, a signing key (`.p8` file, downloadable only once), plus Team ID and Key ID.

For **Python FastAPI**, the recommended approach is manual validation with `python-jose[cryptography]` + `httpx` — fetch Apple's JWKS from `https://appleid.apple.com/auth/keys`, match the `kid` header, verify RS256 signature, and validate `iss`/`aud`/`exp` claims. The `authlib` library is a good alternative for the full OIDC redirect flow on web. For **Node.js**, the `apple-signin-auth` package (by a-tokyo) is the most maintained option, handling public key caching, client secret generation, and token verification.

### Google Sign-In is more straightforward

Google follows standard OIDC. The web SPA uses Google Identity Services (GIS) to get an `id_token` client-side; iOS uses the Google Sign-In SDK. Both send the token to the backend.

For **Python FastAPI**: the official `google-auth` library's `id_token.verify_oauth2_token()` is the standard. For **Node.js**: `google-auth-library`'s `OAuth2Client.verifyIdToken()`. Both handle JWKS fetching and caching internally.

**Google Cloud Console setup**: Create OAuth 2.0 credentials for both "Web application" (with authorized redirect URIs) and "iOS" (with Bundle ID) application types. Configure the consent screen with `openid`, `email`, and `profile` scopes.

### Database schema for multi-provider auth

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE,
    email_verified BOOLEAN DEFAULT FALSE,
    display_name VARCHAR(255),
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE oauth_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,         -- 'apple', 'google'
    provider_user_id VARCHAR(255) NOT NULL, -- sub claim
    email VARCHAR(255),
    is_private_email BOOLEAN DEFAULT FALSE,
    raw_profile JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(provider, provider_user_id)
);

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    device_info VARCHAR(255),              -- 'ios', 'web'
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Account linking strategy**: Link by verified email when both providers report the same address with `email_verified = true`. Apple private relay users cannot be auto-linked — they need an explicit "Link Account" UI flow. The `provider_user_id` (sub claim) is the only truly reliable identifier per provider.

**Session token strategy**: Short-lived access tokens (**15 minutes**, stateless JWT) plus long-lived refresh tokens (**30 days**, stored in database with hash for revocation). Rotate refresh tokens on each use.

### Railway-specific OAuth configuration

Railway provides **automatic HTTPS** via Let's Encrypt on all domains, which satisfies OAuth redirect requirements. Store all secrets as **sealed environment variables** (values invisible in UI/API, injected only at runtime) — this is essential for the Apple `.p8` private key, client secrets, and JWT signing keys. The Apple private key can be stored as a multi-line env var or single-line with `\n` escapes.

Callback URLs use the format `https://<your-domain>/auth/<provider>/callback`. Set an `API_BASE_URL` environment variable and construct callback URLs dynamically — this prevents breakage when switching between Railway-generated domains (`*.up.railway.app`) and custom domains. **PR preview environments** get unique URLs that won't match registered OAuth callbacks, so disable OAuth in preview or accept this limitation.

---

## 3. Railway as the deployment platform: what it handles and what it doesn't

Railway is well-suited for this application's backend needs. It handles PostgreSQL, API servers, and now even S3-compatible object storage natively. The main architectural decision is whether to host the SPA frontend on Railway or use a purpose-built CDN.

### PostgreSQL runs as a managed template service

Railway offers **PostgreSQL 16 and 17** as first-class database templates. Provision from the dashboard canvas (`+ New → Database`) or CLI. Railway automatically generates and injects connection variables — `DATABASE_URL`, `PGHOST`, `PGPORT`, etc. — which other services reference via **Variable References** syntax: `${{Postgres.DATABASE_URL}}`.

Data persists on **Railway Volumes** (attached persistent disks). Pro users can self-serve increase volumes up to **250 GB**. Storage costs approximately **$0.15/GB/month**. A typical small database (1–5 GB) costs **$0.15–$0.75/month** in storage, with the PostgreSQL container itself running around **$0.55–$3/month** depending on memory allocation.

**Limitations versus dedicated PostgreSQL hosting**: no built-in connection pooling (add PgBouncer manually), limited extension support (basic `uuid-ossp` and `pgcrypto` work but PostGIS/pgvector require custom containers), only US and EU regions, and manual scaling only. For a small-to-medium collectibles app, these limitations are unlikely to matter. Automate `pg_dump` backups rather than relying solely on Railway's built-in volume backups.

### API server deployment: Railpack, Nixpacks, or Dockerfile

Railway offers three build paths. **Railpack** (launched March 2026, currently beta) is the newest and recommended option — it produces **38% smaller Node images and 77% smaller Python images** than Nixpacks, with better caching. **Nixpacks** is the legacy auto-detection system, still the default on some projects. **Custom Dockerfiles** give full control and are recommended for production apps needing optimized images.

For a FastAPI backend, the start command is `uvicorn main:app --host 0.0.0.0 --port $PORT`. Railway injects the `PORT` environment variable automatically — the app **must** bind to `0.0.0.0:$PORT`. Configuration lives in `railway.toml`:

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "./Dockerfile"

[deploy]
startCommand = "uvicorn main:app --host 0.0.0.0 --port $PORT"
healthcheckPath = "/health"
healthcheckTimeout = 300
restartPolicyType = "always"
```

GitHub integration provides **automatic deploys on push** and ephemeral **PR preview environments** with unique URLs. Pre-deploy commands handle database migrations before the main process starts.

### SPA frontend is better served elsewhere

While Railway *can* host a React/Vue SPA (using Caddy as a static file server in a separate service), **the recommended production architecture deploys the frontend on Vercel, Netlify, or Cloudflare Pages**. These platforms provide global CDN edge delivery, automatic builds, and generous free tiers — capabilities Railway doesn't match since it serves from containers in specific regions, not a CDN edge network.

If keeping everything on Railway, use a separate service with a Caddyfile that handles SPA routing (`try_files {path} /index.html`). Railway's Railpack beta is adding static site detection for Vite and CRA projects, but this isn't production-stable yet.

### Photo storage: Railway Buckets or Cloudflare R2

**Railway launched native S3-compatible Storage Buckets in September 2025**, built on Tigris infrastructure. These are fully compatible with any S3 client library (AWS SDK, boto3). Buckets are private by default, support presigned URLs, provide at-rest encryption, and isolate per environment. On the Pro plan, storage is **unlimited** with **free bucket egress**.

For a photo-heavy collectibles app, two strong options exist:

- **Railway Buckets** (simplest integration): Credentials inject automatically via Variable References. Pro plan = unlimited storage. No separate service to manage. Best choice for simplicity.
- **Cloudflare R2** (best for global CDN delivery): **$0.015/GB/month** with **zero egress fees**. 100 GB costs ~$1.50/month. Pairs naturally with Cloudflare's CDN for fast global photo delivery. Best choice if you need edge caching for photos served to a geographically distributed user base.

AWS S3 ($0.023/GB/month + $0.09/GB egress) and Backblaze B2 ($0.006/GB/month, free egress via Cloudflare) are viable alternatives, but R2 offers the best price-performance ratio for photo serving.

### Networking, domains, and service communication

Railway services within a project communicate over **private networking** via internal DNS (`<service>.railway.internal`), encrypted by WireGuard. Private traffic incurs **no egress costs**. Custom domains require a CNAME record pointing to a Railway-provided target, with automatic Let's Encrypt SSL certificates provisioned within about an hour. For apex domains, use a DNS provider supporting CNAME flattening (Cloudflare recommended).

### Projected monthly costs

| Component | Estimated Cost |
|-----------|---------------|
| PostgreSQL (512MB RAM, 5GB storage) | $2–4/month |
| API server (512MB–1GB RAM) | $3–7/month |
| Frontend on Railway (Caddy, minimal) | $1–3/month |
| Storage Buckets (Pro plan, included) | $0 additional |
| **Total on Pro plan ($20/mo subscription)** | **$10–20/month** |

A lightweight deployment fits within the **$5 Hobby plan credit**. Most small-to-medium apps on the **$20 Pro plan** stay within the included credit. Billing is per-minute, so idle services cost very little. Set **hard usage limits** in Railway to prevent surprise bills. Volume storage is charged even when services are stopped.

### What should go in your requirements document

For your three new sections, the key requirements to specify are:

**Data model section**: Single shared schema with RLS on private tables; shared catalog tables (items, manufacturers, characters, categories, item_photos) with no user_id; private collection tables (user_collection_items, user_pricing_records, user_wantlist) with user_id foreign key; approval queue for catalog contributions with graduated trust levels; composite indexes on (user_id, item_id) for collection tables; `set_config` session context pattern for RLS.

**Authentication section**: OAuth2/OIDC with Apple and Google as launch providers; unified `/auth/signin` endpoint accepting provider id_tokens; separate client_id values per provider per platform (4 total); account linking by verified email with explicit linking UI for Apple private relay users; short-lived access JWTs (15 min) + database-backed refresh tokens (30 days); `oauth_accounts` table supporting multiple providers per user; Apple `.p8` key and all secrets stored as sealed Railway environment variables.

**Deployment section**: Railway Pro plan (~$10–20/month); PostgreSQL 16/17 as managed template with auto-injected DATABASE_URL; FastAPI/Node.js API server with Dockerfile build and railway.toml configuration; SPA frontend on Cloudflare Pages or Vercel (not Railway); photo storage on Railway Buckets (simplest) or Cloudflare R2 (best CDN); private networking between API and database; custom domain with automatic HTTPS; GitHub autodeploy integration.