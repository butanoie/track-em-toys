# CLAUDE.md — Track'em Toys Project

## NEVER EVER DO

These rules are ABSOLUTE:

### NEVER Publish Sensitive Data
- NEVER publish passwords, API keys, tokens to git/npm/docker
- Before ANY commit: verify no secrets included

### NEVER Commit .env Files
- NEVER commit `.env` to git
- ALWAYS verify `.env` is in `.gitignore`

### NEVER Modify these ios project files
- NEVER modify ios/**/*.pbxproj
- NEVER modify ios/**/*.xcworkspace

### NEVER App Store and DB migrations
- NEVER Submit to App Store (requires human)
- NEVER Modify provisioning profiles or entitlements GUIs
- NEVER Run database migrations on production without explicit instruction


## Security Guidelines for Documentation

When documenting configuration and setup:

### DO Document ###
- How to obtain tokens (links to official sources)
- `.env.example` file locations and structure
- Configuration file format and options
- Error messages and troubleshooting
- Security best practices

### NEVER Document ###
- Actual token values
- API keys or secrets
- Hardcoded credentials
- Private authentication details

## Project Structure
Monorepo. Four active components: ios/, packages/TrackEmToysDataKit/, api/, web/

## CRITICAL RULES
- New Swift files go in ios/track-em-toys/ — Xcode uses folder references (blue folders), 
  auto-detected, no .pbxproj edit needed

## iOS / Swift
- Swift 6, strict concurrency
- SwiftUI only (no UIKit/AppKit unless forced by a framework)
- SwiftData for persistence, async/await throughout, SF Symbols for icons
- Minimum deployment: iOS 17, macOS 14

## Build Commands
- iOS: xcodebuild -scheme track-em-toys -destination 'platform=iOS Simulator,name=iPhone 16'
- API: cd api && npm run dev
- Web: cd web && npm run dev

## API
- [Node.js/FastAPI — fill in once decided]
- All DB changes via migration files in api/migrations/, never direct schema edits

## Commit Standards
- Write clear, descriptive commit messages
- Follow conventional commits format
- Reference issue numbers when applicable
- Keep commits atomic and focused

Create a changelog entry for:
- **Phase Completions** - When a major phase of work is completed
- **Infrastructure Changes** - New tools, frameworks, or development setup
- **Feature Additions** - New functionality or components
- **Breaking Changes** - Changes that affect existing functionality
- **Configuration Updates** - Major changes to build, lint, or test configuration
- **Documentation Standards** - New standards or enforcement mechanisms

### Changelog File Format

**Location:** `changelog/` directory at project root

**Filename Format:** `YYYY-MM-DDTHHMMSS_descriptive-name.md`

**Example:** `2026-01-27T082828_testing-infrastructure-setup.md`

**Generate Timestamp:**
```bash
date '+%Y-%m-%dT%H%M%S'
```

### Required Sections

Every changelog entry must include:

#### Header Metadata
```markdown
# Title - Brief Description

**Date:** YYYY-MM-DD
**Time:** HH:MM:SS TZ
**Type:** [Phase Completion | Infrastructure | Feature | Configuration | etc.]
**Phase:** [If applicable]
**Version:** vX.Y.Z
```

#### Core Sections
1. **Summary** - Brief overview of what was accomplished (2-3 sentences)
2. **Changes Implemented** - Detailed breakdown of all changes
3. **Technical Details** - Configuration, code snippets, technical specifics
4. **Validation & Testing** - Proof that changes work (test results, quality checks)
5. **Impact Assessment** - How this affects development, team, or project
6. **Related Files** - List of created/modified/deleted files
7. **Status** - ✅ COMPLETE or current status

#### Optional Sections (Use When Relevant)
- **Documentation Benefits** - How this improves documentation
- **Next Steps** - What can be done after this change
- **Future Enhancements** - Recommended improvements
- **References** - Links to documentation, guides, or external resources
- **Summary Statistics** - Numbers (files changed, tests added, coverage %, etc.)
- **Comparison** - Before/after comparisons or tool comparisons
- **Bug Fixes** - Issues resolved during implementation

### Changelog Best Practices

**Level of Detail:**
- Be comprehensive - changelogs are historical records
- Include specific file paths, line counts, and metrics
- Show verification results (test output, lint results, build success)
- Document configuration changes with code examples
- Explain WHY changes were made, not just WHAT changed

**Writing Style:**
- Use clear headings and subsections
- Include code blocks for examples
- Use checkmarks (✅) for completed items
- Use tables for structured data
- Include command examples with output
- Link to related documentation files

**Examples to Follow:**
- See `changelog/2026-01-25T231357_phase1-completion.md` for phase completion example
- See `changelog/2026-01-25T233843_static-analysis-documentation-enforcement.md` for infrastructure example
- See `changelog/2026-01-27T082828_testing-infrastructure-setup.md` for detailed technical example

### Changelog Template Structure

```markdown
# Title - Brief Description

**Date:** YYYY-MM-DD
**Time:** HH:MM:SS TZ
**Type:** [Type]
**Version:** vX.Y.Z

## Summary

[2-3 sentence overview]

---

## Changes Implemented

### 1. [Category]

[Detailed description]

**Created:**
- File paths and purposes

**Modified:**
- File paths and changes

---

## Technical Details

### [Subsection]

[Code examples, configuration details]

---