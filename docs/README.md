# Documentation Index

Architecture decisions, requirements, and implementation plans for Track'em Toys.

## Requirements

| Document                                                                                             | Description                                                                             | Status |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------ |
| [Toy Collection Catalog Requirements v1.0](requirements/Toy_Collection_Catalog_Requirements_v1_0.md) | Full product requirements — features, data model, UI specs, non-functional requirements | Draft  |

## Architecture Decisions

| Document                                                                                               | Date       | Decision                                                                                |
| ------------------------------------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------- |
| [Architecture Research](decisions/Architecture_Research_for_Toy_Collection_Catalog_and_Pricing_App.md) | 2026-02-22 | PostgreSQL shared-catalog/private-collection model, OAuth2 auth, Railway deployment     |
| [ADR: Frontend Framework](decisions/ADR_Frontend_Framework.md)                                         | 2026-02-22 | React 19 + Shadcn/ui + Tailwind CSS over Vue/Chakra/Material                            |
| [ADR: Integration Testing Strategy](decisions/ADR_Integration_Testing_Strategy.md)                     | 2026-02-26 | Plain Playwright over BDD/Gherkin for E2E testing                                       |
| [Schema Design Rationale](decisions/Schema_Design_Rationale.md)                                        | 2026-03    | Slug-based FKs, enriched character model, continuity families                           |
| [Roadmap Session Decisions](decisions/2026-03-16_roadmap_session_decisions.md)                         | 2026-03-16 | ML-first strategy, photo privacy domains, OAuth-only, GDPR deletion, hybrid admin roles |

## Implementation Plans

| Document                                                                                        | Phase         | Status                                                                 |
| ----------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------- |
| [Development Roadmap v1.0](plans/Development_Roadmap_v1_0.md)                                   | All           | ML-accelerated roadmap, dependency graph, sprint plans, issue tracking |
| [User Authentication Implementation Plan](plans/User_Authentication_Implementation_Plan.md)     | 1.1–1.3       | ✅ Complete                                                            |
| [iOS Authentication Architecture Blueprint](plans/iOS_Authentication_Architecture_Blueprint.md) | 2.0 — iOS App | Deferred (post-ML)                                                     |

## Guides

| Document                                                                 | Description                                                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| [Documentation Gate Reference](guides/DOC_GATE_REFERENCE.md)             | Standalone checklists for post-architecture and post-review documentation gates       |
| [TSDoc Standards](guides/TSDOC_STANDARDS.md)                             | JSDoc/TSDoc templates and conventions for TypeScript code (API and Web)               |
| [Memory System](guides/MEMORY_SYSTEM.md)                                 | How Claude's persistent memory works — categories, formats, what to save vs. not save |
| [Scoped CLAUDE.md](guides/SCOPED_CLAUDE_MD.md)                           | When and how to create directory-scoped CLAUDE.md files                               |
| [Testing Scenarios](guides/TESTING_SCENARIOS.md)                         | Scenario-driven testing philosophy — Gherkin specs as documentation, not tooling      |
| [iOS Xcode Project Setup Guide](guides/iOS_Xcode_Project_Setup_Guide.md) | Step-by-step Xcode project creation, signing, capabilities, and dependency setup      |

## Test Scenarios

| Document                                         | Description                                       |
| ------------------------------------------------ | ------------------------------------------------- |
| [Test Scenarios Index](test-scenarios/README.md) | Scenario-to-spec mapping table and creation guide |

## Diagrams

| Document                                                              | Description                                                                         | How to view                                                  |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [Database Diagrams (JSX)](diagrams/toy-catalog-database-diagrams.jsx) | Interactive React component showing PostgreSQL schema for web and iOS architectures | Render in any React environment — see comment at top of file |
