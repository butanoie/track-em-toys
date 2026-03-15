# Track'em Toys iOS / macOS

SwiftUI multiplatform app for the Track'em Toys collector catalog. Currently implements authentication (Apple Sign-In, Google Sign-In) and account settings. Catalog browsing and collection management are planned.

## Prerequisites

- **Xcode 26.2**
- **Apple Developer account** (paid, $99/year — required for Sign in with Apple)
- **Local HTTPS certificates** — see root README for mkcert setup
- **API server running** — the app connects to the API for authentication

## Getting Started

### 1. Open the project

```
open ios/track-em-toys.xcodeproj
```

### 2. Configure signing

In Xcode, select the `track-em-toys` target → **Signing & Capabilities**:
- Set your **Team**
- Set the **Bundle Identifier** to match `APPLE_BUNDLE_ID` in your API `.env`

### 3. Google Sign-In setup

The Google Sign-In SDK requires a reversed client ID in `Info.plist`. Copy and fill in the template:

```bash
cp ios/track-em-toys/Info.plist.example ios/track-em-toys/Info.plist
```

The `Info.plist` is gitignored to avoid committing credentials.

### 4. Trust the mkcert CA in the Simulator

The iOS Simulator has its own trust store. After generating certs (see root README), inject the CA:

```bash
xcrun simctl keychain booted add-root-cert "$(mkcert -CAROOT)/rootCA.pem"
```

Repeat after erasing a simulator or using a new simulator instance.

### 5. Build and run

Select the **track-em-toys** scheme and an iPhone 16 simulator (or your Mac for macOS), then **Product → Run** (⌘R).

From the command line:

```bash
xcodebuild -scheme track-em-toys -destination 'platform=iOS Simulator,name=iPhone 16' build
```

### 6. Run tests

```bash
xcodebuild -scheme track-em-toys -destination 'platform=iOS Simulator,name=iPhone 16' test
```

## Deployment Targets

- iOS 26.2
- macOS 26.2

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | Swift 6 (strict concurrency) |
| UI | SwiftUI (no UIKit/AppKit) |
| Persistence | SwiftData + CloudKit sync |
| Auth | Apple Sign-In (ASAuthorization), Google Sign-In SDK |
| Networking | URLSession (async/await) |
| Keychain | Security framework (refresh token storage) |
| Icons | SF Symbols |
| Testing | Swift Testing / XCTest |

## Project Structure

```
ios/
├── track-em-toys/
│   ├── App/
│   │   └── TrackEmToysApp.swift              # App entry point, AuthManager injection
│   ├── Auth/
│   │   ├── AuthManager.swift                 # @MainActor @Observable — session lifecycle
│   │   ├── AuthView.swift                    # Login screen (Apple + Google buttons)
│   │   ├── AppleSignInCoordinator.swift      # ASAuthorizationController delegate
│   │   ├── GoogleSignInCoordinator.swift     # Google Sign-In SDK wrapper (iOS)
│   │   ├── GoogleSignInMacCoordinator.swift  # ASWebAuthenticationSession + PKCE (macOS)
│   │   └── KeychainService.swift             # Refresh token Keychain CRUD
│   ├── Networking/
│   │   ├── APIClient.swift                   # Swift actor — HTTP client, auth headers, 401 retry
│   │   ├── AuthEndpoints.swift               # Typed functions for signin/refresh/logout
│   │   └── NetworkModels.swift               # Codable request/response structs
│   ├── Settings/
│   │   └── AccountSettingsView.swift         # Account settings and provider linking
│   ├── Assets.xcassets
│   ├── Info.plist                            # Gitignored — contains Google reversed client ID
│   ├── Info.plist.example                    # Template for Info.plist
│   └── track-em-toys.entitlements            # Sign in with Apple, CloudKit capabilities
├── track-em-toysTests/
│   ├── Auth/                                 # AuthManager, AppleSignIn, Keychain tests
│   └── Networking/                           # APIClient, AuthEndpoints, NetworkModels tests
└── track-em-toys.xcodeproj/
```

## Key Conventions

- **SwiftUI only** — no UIKit or AppKit unless required by a third-party framework
- **async/await everywhere** — no completion handlers in new code
- **@MainActor on @Observable classes** — all view model state mutations on the main thread
- **SF Symbols for icons** — no custom image assets for standard icons
- **CloudKit + SwiftData** — all model attributes must be optional (CloudKit requirement); unique constraints handled at the application level

## macOS Google Sign-In

macOS does not support the Google Sign-In SDK. Instead, the app uses `ASWebAuthenticationSession` with a loopback OAuth flow and PKCE. This requires a "Desktop app" OAuth client ID in Google Cloud Console. The client secret is stored in `Info.plist` (gitignored). See `GoogleSignInMacCoordinator.swift` for the implementation.

## Design Documents

- [iOS Authentication Architecture Blueprint](../docs/plans/iOS_Authentication_Architecture_Blueprint.md)
- [iOS Xcode Project Setup Guide](../docs/guides/iOS_Xcode_Project_Setup_Guide.md)
