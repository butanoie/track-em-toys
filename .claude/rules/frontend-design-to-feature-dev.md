When `/frontend-design` completes its design work (component designs, layouts, styling decisions, mockup code), do NOT proceed directly to implementation.

Instead, hand off to `/feature-dev:feature-dev` for the actual development phase. This ensures:

1. The design output feeds into the feature-dev architecture/planning phase
2. Documentation gates, verification gates, and review gates are applied
3. Tests are planned and written alongside the implementation
4. The implementation follows the project's standard feature development workflow

## Handoff procedure

1. **Summarize the design** — Present the design decisions, component structure, and any mockup code to the user
2. **Confirm readiness** — Ask the user if they're ready to proceed to implementation
3. **Invoke `/feature-dev:feature-dev`** — Pass the design context (components, layouts, data requirements, interactions) as input so the feature-dev workflow can incorporate it into its architecture phase

## What NOT to do

- Do NOT write production implementation code during `/frontend-design` — keep it to design exploration and prototyping
- Do NOT skip `/feature-dev:feature-dev` and go straight to coding after design is approved
- Do NOT treat design approval as permission to commit — commit discipline still applies
