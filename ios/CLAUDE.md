# iOS — Domain-Specific Rules

> Supplements the root `CLAUDE.md`. Rules here are additive — the root file's iOS section still applies.

## Before Writing New Code

Read the nearest existing file for patterns before writing anything new:
- New view → read an existing view in the same feature area
- New @Observable model → read an existing @Observable class
- New SwiftData model → read `packages/TrackEmToysDataKit/` for shared model structures
- New ML integration → read existing VNCoreMLRequest usage in the app

Match existing patterns exactly. Do not introduce new conventions.

## File Placement

New Swift files go in `ios/track-em-toys/`. Xcode uses folder references (blue folders) which are auto-detected -- no `.pbxproj` edit needed.

---

## Pre-Submission Checklist

Before reporting any task complete, run these verifications and fix all failures.

### 1. Build

```bash
xcodebuild -scheme track-em-toys -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | tail -10
```

Must succeed with zero errors and zero warnings about new code.

### 2. Tests

```bash
xcodebuild -scheme track-em-toys -destination 'platform=iOS Simulator,name=iPhone 16' test 2>&1 | tail -20
```

All tests must pass. New functionality must have corresponding tests.

### 3. No UIKit imports

```bash
grep -rn "import UIKit\|import AppKit" track-em-toys/ --include="*.swift" | grep -v "Preview"
```

Must return zero results unless UIKit is explicitly required by a third-party framework.

### 4. No completion handlers in new code

```bash
grep -rn "@escaping.*->.*Void\|completionHandler:" track-em-toys/ --include="*.swift"
```

Review every result. New code must use async/await. Existing code in untouched files is acceptable.

### 5. No force unwraps on user-facing data

```bash
grep -n "!\." track-em-toys/ --include="*.swift" -r
```

Review every result. Force unwraps on optionals from user data, network responses, or SwiftData
queries are not acceptable. Use `guard let`, `if let`, or `??` instead.

### 6. @MainActor on Observable classes

```bash
grep -n "@Observable" track-em-toys/ --include="*.swift" -r -A 1
```

Every `@Observable` class that reads or writes state used by SwiftUI views must be `@MainActor`.

### 7. New views have preview providers

Every new SwiftUI view must include a `#Preview` block so it renders in Xcode canvas.

---

## Key Patterns

### Observable view model
```swift
// CORRECT
@MainActor
@Observable
final class ToyListViewModel {
    var toys: [Toy] = []

    func loadToys() async {
        toys = await repository.fetchAll()
    }
}

// WRONG — missing @MainActor, state mutations on background threads
@Observable
final class ToyListViewModel {
    var toys: [Toy] = []
}
```

### async/await over completion handlers
```swift
// CORRECT
func fetchToy(id: UUID) async throws -> Toy {
    try await repository.find(id: id)
}

// WRONG
func fetchToy(id: UUID, completion: @escaping (Toy?) -> Void) {
    repository.find(id: id, completion: completion)
}
```

### SwiftData query
```swift
// CORRECT — use @Query in views, pass model to viewmodel
@Query(sort: \Toy.name) var toys: [Toy]

// WRONG — raw ModelContext.fetch in a view body
```
