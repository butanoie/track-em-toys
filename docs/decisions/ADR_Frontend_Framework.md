# ADR: Frontend Framework Selection

**Date:** 2026-02-22
**Status:** Accepted and implemented
**Decision:** React 19 + Shadcn/ui + Tailwind CSS 4

---

## Context

The web SPA needed a frontend framework, component library, and styling approach. The app is a data-heavy toy collection catalog with search/filter interactions, dashboard views, and potential for 10,000+ items. The iOS app is the primary field-use tool — the web SPA focuses on desktop-centric features (reporting, bulk edit, pricing research).

### Requirements Considered

- Component library richness for rapid prototyping
- Ecosystem maturity (testing, tooling, third-party integrations)
- Performance and bundle size for data-heavy views
- Customization without framework lock-in
- AI agent authoring friendliness

---

## Decision

### React 19 over Vue/Svelte

React dominates in ecosystem breadth, hiring pool, and third-party tool maturity. Vue's reactivity model is arguably cleaner, but React's ecosystem advantage dominates for a data-heavy catalog app (better DataTable integrations, more Storybook plugins, mature testing libraries).

Svelte was rejected — tiny ecosystem for specialized tools, no mature DataTable library, fewer Storybook plugins.

### Shadcn/ui over Material-UI / Chakra UI

Shadcn/ui components are **copy-paste primitives** installed into the source tree, not npm dependencies. Full ownership and customization without fighting framework opinions.

- **Material-UI rejected:** Design-system-heavy approach requires extensive `sx` prop overrides. Better for enterprise apps where design consistency is paramount, not rapid iteration on a personal tool.
- **Chakra UI rejected:** Excellent DX but smaller third-party ecosystem. DataTable libraries less mature.

### Tailwind CSS over CSS-in-JS / CSS Modules

Utility-first styling cuts layout iteration time by 60–70% compared to CSS-in-JS (styled-components, Emotion) which require a component wrapper for every layout change. CSS Modules are maintainable but verbose for a data-heavy app.

### Key Dependency Choices

| Choice | Why |
|--------|-----|
| **Vite** (not CRA) | 10–100x faster builds; native ES modules; CRA is effectively deprecated |
| **TanStack Query** (not Apollo/SWR) | Best server-state management for data-heavy catalog; caching, deduplication, invalidation |
| **React Hook Form + Zod** | Modern form handling standard; schema-based validation with TypeScript integration |
| **Vitest + Testing Library** | Gold standard for React testing in 2026 |

---

## Comparison Table

| Criterion | Shadcn/ui + Tailwind | Material-UI | Chakra UI | Nuxt UI (Vue) |
|-----------|---|---|---|---|
| **Component richness** | 50+ (copy-paste) | 60+ (npm) | 40+ (npm) | 50+ (copy-paste) |
| **Customization ease** | Excellent (own code) | Good (overrides) | Excellent (sx prop) | Excellent (own code) |
| **Bundle size (typical)** | 40–50 KB | 80–120 KB | 60–80 KB | 40–50 KB |
| **Design system lock-in** | None | High | Medium | None |
| **DataTable component** | TanStack Table (excellent) | MUI DataGrid (good) | Community (adequate) | Community (adequate) |
| **Ecosystem size** | Largest (React) | Large (React) | Large (React) | Medium (Vue) |

---

## Architectural Constraint: Large Collection Performance

The catalog may grow to 10,000+ items. Shadcn/ui's `DataTable` wraps **TanStack Table**, which implements virtual scrolling and pagination natively — the DOM only renders visible rows (~20–50) regardless of total dataset size. Naive `.map()` rendering with other libraries causes UI lockup at this scale.

---

## Architectural Constraint: Mobile-First Context

The iOS app is the primary field-use tool (barcode scanning, photo capture, ML identification). The web SPA is secondary — focus on desktop-centric features:

- Catalog browsing, reporting, bulk operations
- Don't over-invest in web feature parity with iOS
- Web barcode scanning (jsQR/quagga2) is a fallback only

---

## Consequences

**Positive:**
- Zero framework lock-in — components are owned source code, not npm dependencies
- Small bundle size (~40–50 KB gzipped for 10–15 components)
- Full TypeScript support throughout the stack
- TanStack Table handles 10,000+ item collections without performance issues

**Negative:**
- Shadcn/ui components require manual updates (no `npm update` — must re-copy from upstream)
- Tailwind utility classes can make JSX verbose for complex layouts

**Trade-off accepted:** Choosing copy-paste components over npm packages trades automatic updates for full customization control. For a long-lived collector tool, ownership outweighs convenience.

---

## Summary

| Decision | Why |
|----------|-----|
| React 19 (not Vue) | Largest ecosystem, most third-party tool maturity |
| Shadcn/ui (not Material-UI) | No lock-in; copy-paste components you own |
| Tailwind (not CSS-in-JS) | 60–70% faster layout iteration |
| TanStack Query (not Apollo/SWR) | Best server-state management for data-heavy catalog |
| Vite (not CRA) | 10–100x faster builds; CRA is deprecated |
