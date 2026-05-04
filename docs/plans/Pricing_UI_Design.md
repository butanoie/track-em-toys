# Pricing UI Design

**Date:** 2026-04-16
**Status:** Design complete (4 sections); implementation pending
**Depends on:** DB migration (`price_records`, `collection_items` acquisition fields, `users` location/currency fields), API endpoints
**Companion doc:** [`Pricing_Pipeline_Plan.md`](Pricing_Pipeline_Plan.md) — backend pipeline, data sources, API contracts

## Overview

UI surfaces for the three-tier pricing model. Each tier has different visibility, source, and interaction patterns.

| Tier (canonical name) | UI label | Where it appears | Who sees it | Who writes it |
|------------------------|----------|------------------|-------------|---------------|
| **MSRP** | "MSRP" | Item detail page (catalog) | All authenticated users | Automated pipeline (curators manage) |
| **Market value** | "Market Value" | Item detail + collection valuation | All authenticated users | eBay Browse API (on-demand, 7-day cache) |
| **Acquisition price** | "You Paid" | Collection item only | Owner only (RLS) | User enters manually |

**Nomenclature note:** the canonical column/code name is **acquisition_price** (DB, API, code identifiers). The user-facing label is **"You Paid"** in display surfaces, **"Price paid"** in the entry form. Use `acquisition_*` everywhere in code; never "purchase price" or "price purchased".

## Sections

1. [User Location & Currency Settings](#1-user-location--currency-settings) — adds `country`, `subdivision`, `currency` to user profile
2. [Item Detail — Price Display](#2-item-detail--price-display) — three-tier display with regional expandos on item detail page
3. [Collection Valuation](#3-collection-valuation) — summary card on `/collection` + dedicated `/collection/valuation` page
4. [Acquisition Price Entry](#4-acquisition-price-entry) — adds `acquisition_*` fields to `EditCollectionItemDialog` and `AddToCollectionDialog`

## 1. User Location & Currency Settings

**Mockup:** [`docs/web/design-mockups/settings-location.html`](../web/design-mockups/settings-location.html)

Adds three optional fields to the existing Profile card on the Settings page: **Country**, **Region** (state/province), and **Currency**. Location determines which eBay marketplace to query for market value pricing. Currency determines the display currency for aggregate valuations.

### Country ≠ Currency (design principle)

These two concepts are deliberately separate fields:

- **Country** drives regional data fetches — which eBay marketplace to query, which MSRP country's row appears as the primary price on item detail.
- **Currency** drives display aggregation — which currency is used for valuation hero totals, FX conversion target, and the default currency for new acquisition price entries.

A Canadian collector who primarily deals with US sellers can say "I'm in Canada (for market data) but show me everything in USD." Conflating country with currency would force a false choice and hurt the power-user experience.

### Layout

- Fields added below Name/Email in the Profile card, separated by a horizontal rule
- Three-column responsive grid: `[Country | Region | Currency]` on desktop, stacks on narrow screens
- Region field is a cascading select — appears only when the selected country has subdivisions
- Countries without subdivisions produce a two-column layout: `[Country | Currency]`

### Behavior

| State | Country | Region | Currency | Save |
|-------|---------|--------|----------|------|
| Empty (default) | Placeholder | Disabled, "Select country first" | Placeholder | Disabled |
| Country selected (w/ subdivisions) | Selected | Enabled with options | Auto-filled to country's currency, "matches country" hint | Enabled |
| Country selected (no subdivisions) | Selected | Hidden | Auto-filled to country's currency | Enabled |
| Currency manually overridden | Selected | Selected/hidden | Selected (different from country default), "preferred — overrides country default" hint | Enabled |
| Saved | Selected | Selected (or hidden) | Selected | Disabled + "Saved" indicator |
| Dirty after save | Changed | Changed | Changed | Enabled + pulsing dot on card title |

### Currency cascading

When the user selects a country, the currency field auto-fills to that country's primary currency if:

1. Currency is currently unset, OR
2. Currency was previously auto-filled by a different country (not manually changed)

Once the user **manually** selects a different currency, it sticks — changing country afterward does not overwrite their explicit choice. This is tracked client-side only via a `currencyManuallySet` boolean; the persisted DB model has no "source" flag.

Country → default currency mapping (extends the eBay marketplace table):

| Country | Default Currency |
|---------|------------------|
| US | USD |
| CA | CAD |
| GB | GBP |
| AU | AUD |
| DE, FR, IT, ES, NL, BE, IE, ... | EUR |
| JP | JPY |
| All others | USD (fallback) |

### Supported currencies

The dropdown lists a curated set (users from unsupported locales can still use the app with USD as their display currency):

- CAD — Canadian Dollar
- USD — US Dollar
- GBP — British Pound
- EUR — Euro
- AUD — Australian Dollar
- JPY — Japanese Yen

Additional currencies can be added if users request them. Expanding the list is a DB/seed change only (no migration).

### Subdivision support (unchanged from prior iteration)

| Country | Label | Source |
|---------|-------|--------|
| US | State | 50 states + DC + territories |
| CA | Province | 13 provinces/territories |
| AU | State | 8 states/territories |
| GB | Country | England, Scotland, Wales, Northern Ireland |
| All others | (hidden) | No subdivision selector |

### Data model

```sql
ALTER TABLE users
  ADD COLUMN country     CHAR(2),         -- ISO 3166-1 alpha-2 (e.g., 'US', 'CA')
  ADD COLUMN subdivision VARCHAR(6),      -- ISO 3166-2 code (e.g., 'US-CA', 'CA-BC')
  ADD COLUMN currency    CHAR(3);         -- ISO 4217 alpha-3 (e.g., 'USD', 'CAD')
```

All three are nullable. An optional CHECK constraint could enforce the subdivision prefix matches the country, but we defer it — client-side validation is sufficient and keeps migrations simple.

### API

```
PATCH /auth/me
  Body: { country?: string | null, subdivision?: string | null, currency?: string | null }
  → Returns updated user profile

GET /auth/me
  → Response includes country, subdivision, currency fields
```

Fields can be cleared by sending `null`. The client sends the full triple atomically on Save (single PATCH), so partial-update consistency isn't a concern.

### Country → eBay marketplace mapping (unchanged)

| Country | eBay Marketplace ID |
|---------|---------------------|
| US | EBAY_US |
| CA | EBAY_CA |
| GB | EBAY_GB |
| AU | EBAY_AU |
| DE, FR, IT, ES | EBAY_DE (default EU) |
| All others | EBAY_US (fallback) |

Note: the marketplace returns prices in its own currency. A Canadian user (`country=CA`) viewing an item shows the EBAY_CA CAD prices as the primary, but totals in valuation use the user's `currency` field (which may differ). The fallback chain for display currency is: `user.currency` → `user.country`'s default currency → USD.

### Design details

- Map pin icon (Lucide `MapPin`) on Country label (no icons on Region or Currency to avoid noise)
- "optional" tag in muted text next to each label
- Hint text on Country: "Used for regional pricing and marketplace preferences"
- Hint text on Currency (placeholder state): "Valuation display currency"
- Cascaded state indicator: small green-check icon + blue text "matches country"
- Override state indicator: amber text "preferred — overrides country default (CAD)"
- Dirty form indicator: pulsing dot on card title
- Save confirmation: green checkmark + "Saved" text in card footer (fades after 3s)

## 2. Item Detail — Price Display

**Mockup:** [`docs/web/design-mockups/item-detail-pricing.html`](../web/design-mockups/item-detail-pricing.html)

Three-tier price display (MSRP, Market Value, You Paid) that slots into the existing `ItemDetailContent` component, between the metadata grid and the `ItemRelationships` section.

### Layout

Shares the left column of the two-column item detail grid, positioned directly after the metadata `<dl>`. The section uses the same `uppercase tracking-wider muted-foreground` label styling as existing `DetailField` components to feel native to the page.

| Position | Element |
|----------|---------|
| Section header | Dollar-sign icon + `PRICING` label (matches existing uppercase meta labels) |
| Row 1 | Primary MSRP (user's region) |
| Row 1 expando | "N other regions" — shown only when data exists for other countries |
| Row 2 | Primary Market Value (user's region) with range bar + listing count |
| Row 2 expando | "N other regions" — shown only when data exists for other countries |
| Row 3 (collection only) | "You Paid" with acquisition date and source, separated by dashed border |

### Behavior

| State | MSRP expando | Market expando | Acquisition row |
|-------|--------------|----------------|-----------------|
| Not in collection, single region | Hidden | Hidden | Hidden |
| Not in collection, multi-region | Shown (collapsed) | Shown (collapsed) | Hidden |
| In collection, single region | Hidden | Hidden | Visible |
| In collection, multi-region | Shown (collapsed) | Shown (collapsed) | Visible |
| Expando open | Secondary rows render inline with slideDown animation | Secondary rows render with compact range bar | — |
| No price data for a tier | Tier row is hidden entirely | Tier row is hidden entirely | — |

### Primary region selection

The user's `country` field (from settings) drives which regional price is shown primary:

- `user.country === 'CA'` → show CA price first at full size; US, GB, DE behind expando
- `user.country === null` (no location set) → show the first available price and apply US currency as the default assumption
- `user.country` has no data for this item → fall back to the most specific price available (US > any other)

### Multi-currency display rules

- **Never convert currencies client-side.** Each price is shown in its observed currency with a country badge.
- Country badges (e.g., `CA`, `US`, `GB`) appear only when multiple regions exist — a single-region item shows no badge.
- Primary row: 18px monospace amount with 13px currency prefix.
- Secondary rows (inside expando): 13px monospace amount with 11px currency prefix.
- Monospace (`DM Mono`) reinforces the "ledger / price guide" aesthetic and keeps columns aligned when stacked.

### Market Value specifics

- Shows **median** as the headline price (more robust than mean with small samples and outliers).
- `market-range` bar: gradient (green → amber → red) with a marker indicating where the median sits between min and max. Provides an instant visual sense of distribution skew.
- Meta line: `"median of N listings"` + freshness date (e.g., `Apr 12`). The listing count gives confidence signal — 360 listings is more trustworthy than 2.
- Expando secondary rows include a compact 60px range bar per region.

### Freshness indicator

Three-state dot next to the observation date:

| State | MSRP threshold | Market value threshold | Visual |
|-------|---------------|----------------------|--------|
| Fresh | ≤ 30 days | ≤ 7 days | Green dot |
| Aging | 30–60 days | 7–14 days | Amber dot |
| Stale | > 60 days | > 14 days | Red dot + "stale" text, amount dimmed to 60% opacity |

Thresholds differ because market value is fetched on-demand with a 7-day cache TTL (stale after that triggers a re-fetch), while MSRP is batch-fetched monthly.

### Acquisition row ("You Paid")

- Only renders when the item is in the user's collection (checked via `useCollectionCheck`).
- Top border is **dashed** (not solid like other row separators) — visually signals "private data, different source" without requiring extra copy.
- Label uses an **earth-tone accent** (`oklch(0.55 0.14 55)`) to distinguish from the muted-foreground MSRP/Market labels.
- Meta line: `"{acquisition_date} · {acquisition_source}"` where source is free-text the user entered.
- If item appears multiple times in collection: show a single aggregate row with "×N copies" or list each copy — **TBD during implementation**.

### Component architecture

Extract a new `PricingSection` component nested inside `ItemDetailContent.tsx`:

```
src/catalog/pricing/
  PricingSection.tsx       — top-level wrapper, handles "no data" empty state
  PriceRow.tsx             — primary row (MSRP or Market Value)
  RegionalExpando.tsx      — collapsible secondary-region list
  MarketRangeBar.tsx       — gradient bar + median marker
  FreshnessDot.tsx         — colored dot + date based on observed_at
  AcquisitionRow.tsx       — "You Paid" row, guarded by collection membership
  hooks/usePriceSummary.ts — derives primary/secondary rows from price_records[]
```

`usePriceSummary` takes `{ prices: PriceRecord[], userCountry: string | null, itemId: UUID }` and returns `{ msrp: { primary, others[] }, marketValue: { primary, others[] }, acquisition: AcquisitionPrice | null }`. Kept as a hook (not a server-side derivation) so it reacts to `user.country` changes without re-fetching.

### API contract assumption

```
GET /catalog/:franchise/items/:slug/prices
→ {
    prices: Array<{
      price_type: 'msrp' | 'market_value',
      currency: string,          // 'USD' | 'CAD' | 'GBP' | 'EUR'
      country: string,           // ISO 3166-1 alpha-2
      amount: string,            // decimal as string (pg NUMERIC)
      observed_at: string,       // ISO 8601
      // Market value extras:
      median?: string,
      min?: string,
      max?: string,
      sample_size?: number
    }>
  }
```

`source` and `source_url` are stripped server-side per the source-obfuscation rule (`docs/plans/Pricing_Pipeline_Plan.md`).

## 3. Collection Valuation

**Mockup:** [`docs/web/design-mockups/collection-valuation.html`](../web/design-mockups/collection-valuation.html)

Two surfaces — a compact summary card that appears inline on the main `/collection` page (between stats bar and filters), and a dedicated full page at `/collection/valuation` for the complete breakdown and export.

### Surface 3a — Summary card on `/collection`

A glanceable card above the filters showing the three-tier total. Clickable link to the full page.

| Element | Content |
|---------|---------|
| Section label | "Collection Valuation" with small chart icon |
| Primary tier | Market Value — large monospace number + "+24%" gain/loss chip vs acquisition |
| Secondary tiers | MSRP Total and "You Paid" — smaller monospace numbers |
| Coverage line | "Pricing coverage" bar showing % of collection items with any price data |
| CTA | "View full breakdown →" link to `/collection/valuation` |

### Surface 3b — Full page `/collection/valuation`

Dedicated page for insurance documentation and detailed review.

**Layout:**

1. **Page header** — "Collection Valuation" title (Fraunces serif) + PDF/CSV export buttons
2. **Hero tiers** — three-column display: Market Value (primary, largest), MSRP Total, You Paid. Left border accent colors match each tier.
3. **FX disclaimer** — amber-bordered notice explaining that totals are estimates, observed amounts are authoritative for insurance
4. **Currency breakdown** — bar chart of market value by observed currency (USD, CAD, GBP, EUR) with per-currency totals
5. **Filter chips** — quick filters: All / With market value / Missing pricing / With gain / With loss
6. **Per-item breakdown table** — one row per collection item:
   - Thumbnail + name + manufacturer/year
   - Condition summary (package condition + item grade)
   - You Paid (observed currency)
   - MSRP (observed currency)
   - Market Value (observed currency) + delta chip vs You Paid
7. **Table footer** — totals row in user's currency (estimated after FX conversion)

### Currency formatting

Every monetary amount uses **locale-positioned symbol + trailing ISO code**:

| Locale | CAD | USD | GBP | EUR |
|--------|-----|-----|-----|-----|
| `en-CA`, `en-US` | `$279.99 CAD` | `$279.99 USD` | `£179.99 GBP` | `€219.99 EUR` |
| `fr-CA` | `279,99 $ CAD` | `279,99 $ USD` | `179,99 £ GBP` | `219,99 € EUR` |
| `de-DE` | `279,99 $ CAD` | `279,99 $ USD` | `179,99 £ GBP` | `219,99 € EUR` |

**Why both symbol and ISO:** The symbol (`$`, `£`, `€`) signals "this is money" at a glance. The ISO code resolves the symbol's ambiguity — `$` could be CAD, USD, AUD, HKD, etc. Using both serves both readers: the casual scanner sees the symbol, the analytical reader sees the ISO code.

**Implementation:**
```ts
function formatPrice(amount: string, currency: string, locale: string) {
  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(parseFloat(amount));
  return `${formatted} ${currency}`;  // ISO code trails as plain text
}
```

The ISO code is rendered as a sibling element (not part of the formatted string) so it can be styled independently — smaller font, muted color, e.g.:

```jsx
<span className="amount">
  {formatted}
  <span className="iso">{currency}</span>
</span>
```

CSS gives `.iso` a smaller font size (0.5–0.75em depending on context) and `var(--muted-foreground)` color. `narrowSymbol` ensures we get `$` rather than `CA$` or `US$` in en-CA locale.

This formatting rule applies to **every monetary amount across every pricing surface** — Item Detail Pricing (Section 2), Collection Valuation (this section), and Acquisition Price Entry (Section 4). It is not unique to valuation.

### Handling multi-currency (load-bearing decision)

Three approaches were considered. We commit to **hybrid honest estimates**:

- **Per-item rows** show values in their observed currency (authoritative for insurance claims).
- **Aggregate totals** convert everything to the user's currency using the latest known FX rate and display with an explicit "as of [date]" disclaimer.
- **Currency breakdown section** shows both the observed-currency subtotals AND the converted CAD equivalents so the user can audit the conversion.

FX rates are fetched from a free daily-rate source (to be selected during implementation — likely `open.er-api.com` or ECB). Rates are cached 24 hours server-side and stamped on the response so the client can render the "as of" date.

### Coverage transparency

Every tier shows "X of Y items" to expose data completeness:

| Tier | Counts as "covered" if |
|------|------------------------|
| Market Value | The item has any `price_type='market_value'` record in `price_records` |
| MSRP Total | The item has any `price_type='msrp'` record in `price_records` |
| You Paid | `collection_items.acquisition_price` is set |

An overall coverage bar on the summary card computes "any of the above" per item / total items.

### Delta (gain/loss) logic

Gain/loss percentages are shown on Market Value rows vs "You Paid":

```
delta = (market_value - acquisition_price) / acquisition_price
```

- Only shown when **both** values exist and are in the same currency (avoids mixing FX conversion into the delta).
- Green chip if positive, red chip if negative, no chip if missing data.
- Intentionally NOT shown vs MSRP — many collectors pay above MSRP for secondary-market items, making that comparison misleading.

### Missing data rendering

Empty table cells are intentionally verbose, not dashes:

| Cell state | Display |
|-----------|---------|
| Field not filled by user (acquisition price) | `"not entered"` italic muted — actionable, user can fix |
| No data returned from sources (MSRP, market) | `"no data"` italic muted — not actionable |
| Loading | Skeleton shimmer (matches existing Shadcn patterns) |

### Export

Two buttons in the page header:

- **Export PDF** — generates a formatted PDF for insurance filing: header with user name + date, summary tiers, per-item table with thumbnails and observed prices, FX rate notice on a separate page as a footnote. Server-side generation (likely using `@react-pdf/renderer` or a templating approach).
- **Export CSV** — client-side generation (Papaparse or plain `Blob`), one row per item with all tiers in observed currencies, ISO date stamps, no formatting.

### Empty states

| Scenario | State |
|----------|-------|
| User hasn't set location | Empty card: "Set your country in Settings to see collection valuation in your local currency" + CTA to Settings |
| Collection is empty | Reuses existing collection empty state (no valuation card rendered) |
| Collection has items but no pricing data for any | Empty card: "None of the items in your collection have pricing data yet" + CTA to Catalog |

### Component architecture

```
src/collection/valuation/
  ValuationSummaryCard.tsx     — compact card for /collection
  ValuationPage.tsx            — /collection/valuation page
  ValuationHero.tsx            — three-tier hero display
  CurrencyBreakdown.tsx        — bar chart by observed currency
  ValuationTable.tsx           — per-item breakdown table
  ValuationExportButtons.tsx   — PDF + CSV triggers
  FxDisclaimer.tsx             — estimates disclaimer with rate date
  hooks/useValuation.ts        — aggregates prices + acquisitions + FX
  hooks/useFxRates.ts          — fetches/caches daily FX rates
  lib/compute-totals.ts        — per-currency subtotals and converted totals
  lib/fx-convert.ts            — pure conversion utility
```

`useValuation` returns `{ tiers, coverage, byCurrency, rows, fxAsOf }` from a single call, derived client-side from the user's collection + the per-item prices endpoint results already cached in TanStack Query.

### Route & navigation

New route: `src/routes/_authenticated/collection/valuation.tsx`. Add link from the main collection page (summary card CTA) and optionally a nav link in the `MainNav` under Collection if that becomes a common entry point.

### API contract assumption

```
GET /collection/valuation
→ {
    summary: {
      total_market_value: { amount: string, currency: string, item_count: number },
      total_msrp:         { amount: string, currency: string, item_count: number },
      total_acquisition:  { amount: string, currency: string, item_count: number },
      coverage_pct: number,           // 0-100, items with any price data
      fx_rates: { USD: number, GBP: number, EUR: number, as_of: string }
    },
    currency_breakdown: Array<{ currency: string, amount: string, converted_amount: string }>,
    items: Array<{
      collection_item_id: UUID,
      item: { slug, name, product_code, manufacturer, year_released, thumbnail_url },
      package_condition: string, item_condition: number,
      acquisition: { amount, currency, date, source } | null,
      msrp: { amount, currency, observed_at } | null,        // user's country preferred, else first available
      market_value: { amount, currency, median, observed_at } | null
    }>
  }
```

The endpoint pre-computes tier totals and currency breakdowns server-side to avoid client-side aggregation of potentially hundreds of items. FX conversion is applied server-side using cached rates so the `as_of` timestamp is authoritative.

## 4. Acquisition Price Entry

**Mockup:** [`docs/web/design-mockups/acquisition-fields.html`](../web/design-mockups/acquisition-fields.html)

Adds four optional fields — **Price paid**, **Currency**, **Date acquired**, **Source** — to the existing `EditCollectionItemDialog` (and the parallel `AddToCollectionDialog`). The fields appear in a new "Acquisition Details" section below the existing Notes field, separated by a labeled divider rule.

### Layout

The new section uses two compact rows beneath the existing fields:

| Row | Layout | Fields |
|-----|--------|--------|
| Section header | Divider with `ACQUISITION DETAILS` label, optional "Clear" link on the right when populated | — |
| Row 1 | `[1fr | 9rem]` grid | Price paid \| Currency |
| Row 2 | `[1fr | 1fr]` grid | Date acquired \| Source |

Stacks to single column below 480px.

### Field specs

| Field | Input type | Default | Validation |
|-------|-----------|---------|------------|
| `acquisition_price` | Text input, monospace, right-aligned, with leading currency symbol prefix in muted box | empty | Decimal ≥ 0; max 12 digits + 2 decimals (matches `NUMERIC(12,2)`) |
| `acquisition_currency` | Select (CAD/USD/GBP/EUR/AUD/JPY) | `user.currency` from profile (cascaded from `user.country` if unset) | Must be ISO 4217 alpha-3, restricted to supported list |
| `acquisition_date` | Native `<input type="date">` | empty | Valid date; future dates allowed with non-blocking warning |
| `acquisition_source` | Text input | empty | Max 200 chars, sanitized server-side (strip control chars, trim) |

### Behavior

| State | Currency hint | Clear button | Save enabled |
|-------|---------------|--------------|--------------|
| Empty (initial) | "from your profile" check-icon hint | Hidden | Disabled until any field changes |
| User-filled, currency unchanged | "from your profile" hint persists | Visible | Enabled |
| Currency manually changed | "overrides your profile (CAD)" — amber accent text | Visible | Enabled |
| Future date entered | Amber border on date input + non-blocking warning notice below | — | Enabled (warning is informational only) |

### Currency cascade rules

When the dialog opens for an existing item:

- If `collection_item.acquisition_currency` is set → use it
- Else if `user.currency` is set → use it (with "from your profile" hint)
- Else if `user.country` has a default currency → use it (with "from your profile" hint)
- Else → default to USD

When the user manually changes the currency selector, the hint switches from "from your profile" (cascaded) to "overrides your profile (CAD)" (manual). The override state is purely a UI affordance — the persisted value is just the chosen currency.

### Symbol prefix on price input

The leading muted prefix box (`$`, `£`, `€`, `¥`) updates dynamically when the currency changes, mirroring the symbol-prefix convention from the valuation display:

| Currency | Prefix symbol |
|----------|---------------|
| USD, CAD, AUD | `$` |
| GBP | `£` |
| EUR | `€` |
| JPY | `¥` |

The displayed value remains the raw decimal (e.g., `279.99`); locale-aware formatting only applies to read-side displays (valuation totals, item detail pricing). Edit inputs are kept simple to avoid format-roundtrip bugs.

### Future-date handling

Pre-orders are a real collector workflow — collectors record planned purchases before the item ships. Hard-blocking future dates would frustrate this. We display:

- Amber border on the date input
- Inline warning notice: "Date is in the future. Save anyway if recording a pre-order."
- Save button stays enabled

If a date is more than 1 year in the future, we tighten to a stronger warning (still non-blocking) — likely a typo. Not in the mockup, deferred to implementation.

### Clear button

When any acquisition field has a value, a small "Clear" link appears in the section header (right side). One click resets all four fields to defaults (price empty, currency back to profile cascade, date empty, source empty). Avoids forcing users to clear four fields individually.

The Clear button only resets the form state; it doesn't auto-save. The user still needs to click "Save Changes" to commit the cleared values.

### Data model

```sql
ALTER TABLE collection_items
  ADD COLUMN acquisition_price    NUMERIC(12,2),
  ADD COLUMN acquisition_currency CHAR(3),
  ADD COLUMN acquisition_date     DATE,
  ADD COLUMN acquisition_source   TEXT;
```

All four columns are nullable — acquisition data is opt-in. No CHECK constraint on `acquisition_currency` (validation lives in the API schema for flexibility). No FK or normalization on `acquisition_source` (free text by design).

### API

Extends the existing PATCH endpoint:

```
PATCH /collection/:id
  Body: {
    package_condition?, item_condition?, notes?,         // existing
    acquisition_price?: string | null,                   // decimal as string (preserves precision)
    acquisition_currency?: string | null,                // ISO 4217 alpha-3
    acquisition_date?: string | null,                    // ISO 8601 date (YYYY-MM-DD)
    acquisition_source?: string | null
  }
```

Sending `null` clears a field. Sending `undefined` (omitting the key) leaves it unchanged. Same partial-update semantics as the existing fields.

The `AddToCollectionDialog` POST endpoint (`POST /collection`) accepts the same four fields in its body.

### Component architecture

Extract a new shared component for reuse between Edit and Add dialogs:

```
src/collection/components/
  AcquisitionFieldsSection.tsx   — section divider + 2 rows of fields
  PriceInput.tsx                 — symbol-prefixed monospace input
  CurrencySelect.tsx             — curated list select with profile-default hint
  DateInput.tsx                  — wraps <input type="date"> with future-date warning
  SourceInput.tsx                — free-text input with placeholder
  hooks/useCurrencyCascade.ts    — derives default currency from user profile
```

`AcquisitionFieldsSection` is composed into both `EditCollectionItemDialog` and `AddToCollectionDialog` so both flows behave identically.

### Display surfaces (where these values render)

Once entered, the acquisition values appear in three places:

1. **Item Detail Pricing section** (Section 2) — "You Paid" row with date and source as the meta line, only when item is in user's collection
2. **Collection Valuation page** (Section 3) — "You Paid" column in the per-item breakdown table; aggregated into the "You Paid" hero tier
3. **Collection list/table view** — TBD whether to show inline. Suggest: not in the default view (would crowd the cards), but exposed as an optional column in table view via a settings toggle. Defer this decision to implementation.

### Validation rules summary

| Rule | Where enforced | UX |
|------|---------------|-----|
| Price is positive decimal | Client (regex on input change) + server (Zod) | Inline red border on invalid, save disabled |
| Currency in supported list | Client (select restricts options) + server (Zod enum) | N/A (can't pick invalid value) |
| Date is parseable | Native `<input type="date">` handles | Browser-native error |
| Date in future | Client warning only | Amber border + inline notice, save enabled |
| Source max length | Client (maxLength=200) + server (Zod) | Truncated at input level |
| At least one field changed (PATCH) | Server | Existing error path; save button already disabled when no change |

## Design Principles

1. **Country and Currency are separate concerns** — Country drives regional data fetches (marketplace, primary MSRP row). Currency drives display aggregation (valuation totals, acquisition defaults). The UI cascades country → currency as a convenience but allows manual override.
2. **Optional everything** — location, currency, acquisition price are all optional. The app works without any of it, with USD as the zero-config fallback.
3. **Freshness transparency** — always show when a price was last observed. Flag stale data (> 30 days for MSRP, > 7 days for market value).
4. **Multi-currency awareness** — never convert currencies silently. Per-item prices always show in their observed currency; aggregates convert using a dated FX rate with an explicit disclaimer.
5. **Source obfuscation** — MSRP source IDs (src_01–src_09) and eBay source URLs are never shown to users. Only amount, currency, country, and date.
