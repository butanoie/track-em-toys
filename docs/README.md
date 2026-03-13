# Documentation Index

Architecture decisions, requirements, and implementation plans for Track'em Toys.

## Requirements

| Document | Description | Status |
|----------|-------------|--------|
| [Toy Collection Catalog Requirements v1.0](requirements/Toy_Collection_Catalog_Requirements_v1_0.md) | Full product requirements — features, data model, UI specs, non-functional requirements | Draft |

## Architecture Decisions

| Document | Date | Decision |
|----------|------|----------|
| [Architecture Research](decisions/Architecture_Research_for_Toy_Collection_Catalog_and_Pricing_App.md) | 2026-02-22 | PostgreSQL shared-catalog/private-collection model, OAuth2 auth, Railway deployment |
| [Frontend Framework Recommendation](decisions/Frontend_Framework_Recommendation_2026.md) | 2026-02-22 | React 19 + Shadcn/ui + Tailwind CSS over Vue/Chakra/Material |
| [Integration Testing Strategy](decisions/Integration_Testing_Strategy_2026.md) | 2026-02-26 | Plain Playwright over BDD/Gherkin for E2E testing |

## Implementation Plans

| Document | Phase | Status |
|----------|-------|--------|
| [User Authentication Implementation Plan](plans/User_Authentication_Implementation_Plan.md) | 1 — Foundation | Phases 1.1–1.3: Complete |
| [iOS Authentication Architecture Blueprint](plans/iOS_Authentication_Architecture_Blueprint.md) | 2 — iOS Native | In progress |

## Guides

| Document | Description |
|----------|-------------|
| [iOS Xcode Project Setup Guide](guides/iOS_Xcode_Project_Setup_Guide.md) | Step-by-step Xcode project creation, signing, capabilities, and dependency setup |

## Diagrams

| Document | Description | How to view |
|----------|-------------|-------------|
| [Database Diagrams (JSX)](diagrams/toy-catalog-database-diagrams.jsx) | Interactive React component showing PostgreSQL schema for web and iOS architectures | Render in any React environment — see comment at top of file |
