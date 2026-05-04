# Pricing Pipeline Plan

**Date:** 2026-04-16
**Status:** MSRP pipeline built (9 sources); eBay Browse API spike complete (on-demand architecture decided); UI design complete; DB migration + API ingest pending
**Companion doc:** [`Pricing_UI_Design.md`](Pricing_UI_Design.md) — frontend design for all four pricing UI surfaces (settings, item detail, valuation, acquisition entry)

## Goal

Automatically populate catalog items with MSRP data from online retailers for insurance valuation. No manual price entry required for catalog data — curators manage via automated pipeline. Users add their own acquisition prices through the collection edit dialog.

## Three-Tier Price Model

| Tier (canonical name) | Scope | Storage | Source |
|-----------------------|-------|---------|--------|
| **Acquisition price** | Private (user + physical copy) | `collection_items.acquisition_price` (RLS) | User enters manually via `EditCollectionItemDialog` |
| **MSRP** | Shared catalog, per item | `price_records` (no RLS) | Automated pipeline (9 sources) |
| **Market value** | Shared catalog, per item | `price_records` (no RLS) | eBay Browse API (on-demand, 7-day cache) |

**Naming:** Always use `acquisition_*` for the user-paid tier in DB/API/code. UI labels it "You Paid" (display) and "Price paid" (entry form). See [`Pricing_UI_Design.md`](Pricing_UI_Design.md) §4 for entry-form details.

**Purpose:** Insurance valuation — "what is my collection worth?" Not tracking personal sales.

## Data Sources

9 automated sources covering 5 currencies (USD, CAD, GBP, EUR, CN export) across 5 countries. ~1,300+ unique items matched with multi-country pricing.

**Multi-country pricing model:** Currency ≠ Country. Each price record carries `store`, `currency`, AND `country` independently. The same currency (e.g., USD) can represent different regional MSRPs depending on the market the store serves.

Source details (store names, URLs, API endpoints, collection mappings, scraping techniques) are proprietary — see `docs/PRICING_SOURCES.md` in the data repository.

## Pipeline Architecture

```
track-em-toys-data/                              track-em-toys/
┌─────────────────────────────┐                  ┌────────────────────────┐
│ tools/fetch-prices/         │                  │ api/db/seed/           │
│   fetch-prices.ts (8 stores)│                  │   ingest-prices.ts     │
│   fetch-showz.ts (1 store)  │                  │     ↓ reads manifests  │
│     ↓                       │                  │     ↓ resolves slugs   │
│ data/items/{mfg}/           │   SEED_DATA_PATH │     ↓ upserts DB       │
│   {mfg}-price-manifest.json │  ──────────────► │                        │
│   (merged multi-source)     │                  │ price_records table    │
└─────────────────────────────┘                  └────────────────────────┘
```

**Trigger:** Manual CLI initially. Cron/CI for monthly refresh later.

### Market Value Pipeline (eBay Browse API)

Unlike MSRP (batch), market value is fetched **on-demand** per user request:

```
User views collection item market value
  → API checks price_records for eBay data < 7 days old
    → Fresh: return cached value
    → Stale/missing:
      1. Load catalog data (manufacturer, product_code, sub_brand, toy_line)
      2. Load collection_item (package_condition → eBay conditionIds)
      3. Determine marketplace from user locale (EBAY_US/CA/GB)
      4. Cascading query: code → sub_brand+name → mfg+name → fallback
      5. Post-filter results (exclude KOs, compute median)
      6. Upsert price_records (price_type='market_value', source='ebay')
      7. Return to user
```

**Why on-demand, not batch:**
- Market prices are **location-dependent** (EBAY_US vs EBAY_CA return different listings/currencies)
- Market prices are **condition-dependent** (user's `package_condition` maps to eBay conditionIds)
- Market prices are **time-sensitive** (listings change hourly, 7-day TTL)
- No point polling items nobody's looking at (Browse API: 5,000 calls/day limit)

**eBay API status (2026-04-12):**
- Browse API (`item_summary/search`): **Production access working** — active listings only
- Marketplace Insights API (`item_sales/search`): Denied — Limited Release
- Finding API (`findCompletedItems`): Decommissioned Feb 2025
- Account deletion notification: Exempted (we don't store eBay user data; issue #154)

Spike findings and query strategy analysis are in the data repository.

### Manifest Format (merged multi-source)

One manifest per manufacturer. Each entry has a `prices[]` array with one object per store/currency/country:

```json
{
  "_metadata": {
    "stores": ["src_01", "src_02", "src_03"],
    "manufacturer": "example-mfg",
    "total_seed_items": 122,
    "items_with_prices": 107
  },
  "entries": [{
    "product_code": "EX-01",
    "seed_name": "Example Item",
    "seed_slug": "ex-01-example-item",
    "prices": [
      { "store": "src_01", "currency": "USD", "country": "CA", "amount": "206.99" },
      { "store": "src_02", "currency": "USD", "country": "US", "amount": "199.99" },
      { "store": "src_05", "currency": "CAD", "country": "CA", "amount": "279.99" }
    ]
  }]
}
```

## Database Schema

### `price_records` table (new migration)

```sql
CREATE TYPE public.price_type AS ENUM ('msrp', 'market_value');

CREATE TABLE public.price_records (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id         UUID            NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
    price_type      price_type      NOT NULL,
    amount          NUMERIC(12,2)   NOT NULL CHECK (amount > 0),
    currency        CHAR(3)         NOT NULL,           -- ISO 4217 (USD, CAD)
    country         CHAR(2),                            -- ISO 3166-1 (NULL = global)
    subdivision     VARCHAR(6),                         -- ISO 3166-2 (NULL = country-wide)
    source          TEXT NOT NULL,                      -- opaque store identifier (e.g., 'src_01')
    source_url      TEXT,                               -- product page URL
    notes           TEXT,
    observed_at     DATE            NOT NULL DEFAULT CURRENT_DATE,
    contributed_by  UUID            REFERENCES public.users(id),  -- NULL for automated
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- No RLS — shared catalog data (like item_photos)
-- Write access: curators/admins via requireRole('curator')
-- Read access: any authenticated user

CREATE INDEX idx_price_records_item ON price_records (item_id, price_type, observed_at DESC);
CREATE INDEX idx_price_records_source ON price_records (source, observed_at DESC);
CREATE UNIQUE INDEX idx_price_records_upsert ON price_records (item_id, price_type, source, currency);

CREATE TRIGGER price_records_updated_at
    BEFORE UPDATE ON public.price_records
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
```

### `collection_items` additions (same migration or separate)

```sql
ALTER TABLE public.collection_items
    ADD COLUMN acquisition_price    NUMERIC(12,2),
    ADD COLUMN acquisition_currency CHAR(3),
    ADD COLUMN acquisition_date     DATE,
    ADD COLUMN acquisition_source   TEXT;
```

### `users` additions (location & currency for pricing UI)

```sql
ALTER TABLE public.users
    ADD COLUMN country     CHAR(2),         -- ISO 3166-1 alpha-2 (e.g., 'US', 'CA')
    ADD COLUMN subdivision VARCHAR(6),      -- ISO 3166-2 code (e.g., 'US-CA', 'CA-BC')
    ADD COLUMN currency    CHAR(3);         -- ISO 4217 alpha-3 (e.g., 'USD', 'CAD')
```

All three nullable. Drives:
- **Country** → eBay marketplace selection for on-demand market value fetches; primary MSRP region on item detail page
- **Subdivision** → display only (future: regional sales tax estimates for valuation)
- **Currency** → aggregate display currency on collection valuation; default for new acquisition price entries

See [`Pricing_UI_Design.md`](Pricing_UI_Design.md) §1 for cascade behavior and supported currency list.

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| RLS on price_records? | **No** | Shared catalog data, like `item_photos` |
| Who writes? | Curators/admins + automated pipeline | `contributed_by` NULL for automated |
| Soft delete? | **Hard delete** | No audit trail needed |
| Currency | Multi-currency from start | USD + CAD minimum |
| Granularity | Per catalog item, not per copy | Market value is about the toy model |
| Sold tracking? | **No** | Sell → remove from collection |
| Freshness | 30-day stale threshold | UI flags stale observations |
| Price types | `msrp \| market_value` | Two values, notes field for context |
| UPSERT key | `(item_id, price_type, source, currency)` | One active record per item per source |

## Source Obfuscation

Store identifiers in the DB use opaque IDs (`src_01`, `src_02`, etc.). The mapping from opaque ID to store name/URL is proprietary — stored only in the data repository's `docs/PRICING_SOURCES.md`.

| Layer | Store identity | Notes |
|-------|---------------|-------|
| Manifests (private repo) | Visible | `product_url` for debugging |
| DB `source` column | Opaque | `src_01`, `src_02`, etc. |
| DB `source_url` column | Visible | Server-side only, never in API responses |
| API responses | Hidden | Strip `source` and `source_url`; return only `amount`, `currency`, `country`, `observed_at` |
| Public repo | Hidden | No store names, URLs, or techniques |

## API Endpoints (planned)

Five endpoint changes are required to support the four UI sections. Detailed contracts in [`Pricing_UI_Design.md`](Pricing_UI_Design.md).

### Catalog item pricing (item detail page — UI §2)

```
GET /catalog/:franchise/items/:slug/prices
    → { prices: PriceRecord[] }
    → Any authenticated user
    → Returns all price_records for the item, all currencies/regions
    → EXCLUDES source and source_url fields (obfuscated)
    → Triggers on-demand eBay refresh server-side if market_value
      records for user's country are stale (> 7 days)
```

### Collection valuation (UI §3)

```
GET /collection/valuation
    → {
        summary: { total_market_value, total_msrp, total_acquisition,
                   coverage_pct, fx_rates: { ..., as_of } },
        currency_breakdown: [...],
        items: [...]
      }
    → User-scoped (joins collection_items × price_records)
    → Server-side FX conversion using cached daily rates
    → Aggregates pre-computed to avoid client-side iteration
```

### Acquisition fields on collection item (UI §4)

```
PATCH /collection/:id
    Body extension: {
        acquisition_price?, acquisition_currency?,
        acquisition_date?, acquisition_source?      // all nullable
    }
    → Existing endpoint; just adds 4 new optional fields

POST /collection
    Body extension: same 4 fields accepted at creation time
```

### User profile location/currency (UI §1)

```
PATCH /auth/me
    Body extension: { country?, subdivision?, currency? }    // all nullable
    → Existing endpoint; adds 3 new optional fields
    → Validation: country = ISO 3166-1 alpha-2,
                  subdivision = ISO 3166-2 code,
                  currency = ISO 4217 alpha-3 from supported list

GET /auth/me
    Response extension: includes country, subdivision, currency
```

## Implementation Status

### Phase A — Data pipeline (data repo)

| Step | Status |
|------|--------|
| MSRP fetching tools (9 sources, 5 currencies) | ✅ Complete |
| Multi-file manufacturer combining | ✅ Complete |
| Product matching (code + fuzzy) | ✅ Complete |
| Merged multi-source manifest format | ✅ Complete |
| Full MSRP pipeline validation | ✅ Complete |
| eBay Browse API spike (query strategies, condition mapping) | ✅ Complete |
| eBay production access + compliance (#154) | ✅ Complete |
| Tool documentation | ✅ Complete |
| Run full MSRP pipeline (all 9 sources × all manufacturers) | Next |
| Monthly cron/CI refresh schedule (MSRP only) | Pending |

### Phase B — UI design

| Step | Status |
|------|--------|
| §1 User Location & Currency Settings — design + mockup | ✅ Complete |
| §2 Item Detail — Price Display — design + mockup | ✅ Complete |
| §3 Collection Valuation — design + mockup | ✅ Complete |
| §4 Acquisition Price Entry — design + mockup | ✅ Complete |

### Phase C — DB migrations

| Step | Status |
|------|--------|
| `price_records` table + `price_type` enum | Pending |
| `collection_items` acquisition fields (4 columns) | Pending |
| `users` location & currency fields (3 columns) | Pending |

### Phase D — API implementation

| Step | Status |
|------|--------|
| `ingest-prices.ts` (manifest → DB upsert, MSRP) | Pending |
| `GET /catalog/:franchise/items/:slug/prices` | Pending |
| eBay on-demand fetcher in API layer (market_value, 7-day cache) | Pending |
| `GET /collection/valuation` endpoint | Pending |
| FX rate fetcher + daily cache | Pending |
| `PATCH /collection/:id` extension (4 acquisition fields) | Pending |
| `POST /collection` extension (4 acquisition fields) | Pending |
| `PATCH /auth/me` extension (country, subdivision, currency) | Pending |
| `GET /auth/me` extension (return new user fields) | Pending |

### Phase E — Web UI implementation

| Step | Status |
|------|--------|
| §1 Settings: Country/Region/Currency fields on Profile card | Pending |
| §2 Item Detail: `PricingSection` with regional expandos | Pending |
| §3 Collection: `ValuationSummaryCard` on `/collection` | Pending |
| §3 Collection: `/collection/valuation` page + PDF/CSV export | Pending |
| §4 Edit/Add dialogs: `AcquisitionFieldsSection` | Pending |
| Shared price formatting utility (`Intl.NumberFormat` + ISO suffix) | Pending |
