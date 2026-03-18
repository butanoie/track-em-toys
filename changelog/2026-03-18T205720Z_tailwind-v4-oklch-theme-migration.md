# Fix — Migrate CSS Theme to Tailwind v4 oklch Format

**Date:** 2026-03-18
**Time:** 20:57:20 UTC
**Type:** Bug Fix
**Phase:** 1.5b (User Roles & Admin UI)

## Summary

Fixed transparent dropdown flyouts on the admin users page caused by a Tailwind v3/v4 CSS variable format mismatch. Migrated all semantic color variables from raw HSL channel values to complete `oklch()` colors and added the `@theme inline` block required by Tailwind CSS v4.

---

## Changes Implemented

### 1. CSS Theme Migration (`web/src/index.css`)

**Root cause:** CSS variables used Tailwind v3-style raw HSL channels (e.g., `--popover: 0 0% 100%`). Tailwind v4 passes these through `var()` directly, producing invalid CSS like `background-color: 0 0% 100%` — browsers render this as transparent.

**Changes:**

- Converted all 19 semantic color variables (light + dark) from raw HSL channels to `oklch()` values
- Added `@theme inline` block mapping `--color-*` tokens to `var(--*)` for Tailwind utility class generation
- Added `@custom-variant dark (&:is(.dark *))` for class-based dark mode
- Added radius token mappings (`--radius-sm` through `--radius-2xl`)
- Updated base styles to use `@apply bg-background text-foreground` instead of `hsl(var(--...))` wrapping
- Moved `:root` / `.dark` blocks out of `@layer base` (Tailwind v4 convention)

### 2. Documentation (`web/CLAUDE.md`)

- Added "Tailwind CSS 4 Theming" section documenting the oklch + `@theme inline` pattern
- Added note to Shadcn/ui CLI section: convert CLI-generated HSL values to oklch after installation

**Modified:**

- `web/src/index.css` — Full rewrite
- `web/CLAUDE.md` — Added theming section

---

## Technical Details

### Before (Tailwind v3 format — broken in v4)

```css
@layer base {
  :root {
    --popover: 0 0% 100%; /* raw HSL channels */
  }
}
/* Tailwind v4 generates: background-color: var(--popover) → "0 0% 100%" → INVALID */
```

### After (Tailwind v4 format)

```css
@theme inline {
  --color-popover: var(--popover); /* registers bg-popover utility */
}
:root {
  --popover: oklch(1 0 0); /* complete color value */
}
/* Tailwind v4 generates: background-color: var(--color-popover) → oklch(1 0 0) → VALID */
```

### Color Conversion

All HSL values were programmatically converted to oklch using the standard HSL → sRGB → linear sRGB → XYZ D65 → OKLab → OKLCH pipeline to ensure exact visual fidelity.

---

## Validation & Testing

- ✅ `npm run build` — Clean build, no warnings
- ✅ `npm test` — 175/175 tests pass
- ✅ `npm run lint` — No ESLint errors
- ✅ `npm run typecheck` — No TypeScript errors
- ✅ Code review: all 8 Shadcn component files verified — every semantic color utility maps to a registered `@theme inline` token
- ✅ Code simplification: no changes recommended

---

## Impact Assessment

- **Fixes** transparent dropdown flyouts on the admin users page (and any other Shadcn portaled component)
- **Prevents** the same issue for all future Shadcn components added via CLI
- **Establishes** the correct Tailwind v4 theming convention documented in `web/CLAUDE.md`
- **No visual changes** — oklch values were computed from the exact same HSL source colors

---

## Status

✅ COMPLETE
