Test scenario documents (`docs/test-scenarios/*.md`) written before implementation MUST be verified against the current code before being trusted, and MUST be rewritten in place when the implementation has diverged.

**Why:** The project convention (`docs/guides/TESTING_SCENARIOS.md`) is to write Gherkin scenarios during the architecture phase, before test code. This produces useful design artifacts but creates a long-lived staleness risk: the implementation diverges during manual testing and refactors, and the pre-impl scenarios quietly become fiction. A future session that trusts the doc either (a) implements tests against scenarios that describe nonexistent behavior, or (b) writes a new supplementary doc next to the stale one, leaving two overlapping sources of truth. Phase 1.9b checkpoint 5b.5 hit this: `E2E_PHOTO_APPROVAL.md` was a 398-line pre-impl draft describing an R-R reject chord (removed in `e1e09e2`), Sonner success toasts (feature emits zero toasts), an undo flow (never built), and a "Back to Admin" empty-state link (never built). Five separate sections contradicted the shipped code.

**How to apply:**

1. Before using a `docs/test-scenarios/E2E_*.md` or `INT_*.md` doc as a specification to implement against, read the current source files it describes (locators, labels, behavior) and verify every in-scope scenario matches. Do not assume the doc is accurate just because it is checked into the repo.

2. When you find staleness, **rewrite the doc in place**, not alongside. Two overlapping scenarios docs for the same feature is strictly worse than one doc with tagged sections.

3. Use explicit status tags on each scenario to separate reality from intent:

   - `[implemented]` / `[<checkpoint-id>]` — covered by the current spec
   - `[deferred]` — real implemented behavior not yet covered by automated tests (keep as forward-looking documentation)
   - `[not-implemented]` — described behavior that was never built (keep as a disclaimer so future readers don't assume it is forthcoming)

4. Add an explicit "Not-implemented scenarios" section at the bottom for historical content that describes nonexistent code, with a brief explanation of what the original plan was and why it never landed. This is more valuable than deleting the content — it prevents someone from re-introducing the same idea and calling it new.

5. Include an S1..Sn test-ID mapping table in the doc that pins expected test titles to the 1:1 scenario contract. When the spec file uses Given/When/Then titles (per `docs/guides/TESTING_SCENARIOS.md`), the mapping table should contain the exact title strings so drift is caught by grep.

6. Update `docs/test-scenarios/README.md` mapping row in the same edit, pointing at the real spec filename and setting status to a truthful value (e.g. "Xb.Y subset implemented; remainder deferred" if only part of the doc is automated).

The working example from Phase 1.9b is `docs/test-scenarios/E2E_PHOTO_APPROVAL.md` — it was rewritten from a 398-line stale draft into a tagged doc where 8 scenarios are `[5b.5]`, several are `[deferred]`, and three stale sections are quarantined under `[not-implemented]` with explicit disclaimers.
