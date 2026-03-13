# iOS Xcode Project Setup Guide

**Date:** 2026-02-28
**Xcode Version:** 26.2
**Targets:** iOS 26.2, macOS 26.2 (Multiplatform)
**Prerequisite:** Phase 4 Swift source files already exist in `ios/track-em-toys/` and `ios/track-em-toysTests/`

---

## Overview

This guide walks through creating and configuring the Xcode project for Track'em Toys. The Swift source files (auth layer, networking, tests) were created in a prior phase and live in:

```
ios/
  track-em-toys/
    App/TrackEmToysApp.swift
    Auth/AuthManager.swift, AuthView.swift, AppleSignInCoordinator.swift,
          GoogleSignInCoordinator.swift, KeychainService.swift
    Networking/APIClient.swift, AuthEndpoints.swift, NetworkModels.swift
  track-em-toysTests/
    Auth/AuthManagerTests.swift, AppleSignInCoordinatorTests.swift, KeychainServiceTests.swift
    Networking/APIClientTests.swift, AuthEndpointsTests.swift, NetworkModelsTests.swift
```

The goal is to create the `.xcodeproj`, wire up these existing files, add dependencies, and configure signing and capabilities.

---

## Phase 1 — Create the Xcode Project

### Step 1.1 — Create a new project in a temporary location

Xcode's "New Project" wizard cannot merge into an existing directory. We create the project in a temp location, then move the `.xcodeproj` into place.

1. Open **Xcode 26.2**
2. **File → New → Project…** (or ⇧⌘N)
3. Select **Multiplatform → App** at the top, then click **Next**
4. Fill in the project details:

| Field | Value |
|-------|-------|
| **Product Name** | `track-em-toys` |
| **Team** | Your Apple Developer team |
| **Organization Identifier** | Your reverse-domain org ID (e.g. `com.yourcompany`) — the resulting Bundle ID must match `APPLE_BUNDLE_ID` in your API `.env` |
| **Interface** | SwiftUI |
| **Language** | Swift |
| **Storage** | None |
| **Host in CloudKit** | Unchecked |
| **Testing System** | Swift Testing |
| **Include UI Tests** | Unchecked |

5. Click **Next**
6. **Save to a temporary location** — e.g. your Desktop or `/tmp`
7. Click **Create**

### Step 1.2 — Move the .xcodeproj into the repo

Open Terminal and run:

```bash
# Adjust the source path to wherever you saved the project
mv ~/Desktop/track-em-toys/track-em-toys.xcodeproj ~/Repos/track-em-toys/ios/

# Clean up the temp project folder (it has stub files we don't need)
rm -rf ~/Desktop/track-em-toys
```

### Step 1.3 — Open the project from its new location

```bash
open ~/Repos/track-em-toys/ios/track-em-toys.xcodeproj
```

Xcode will open. The Project Navigator will show the `track-em-toys` folder, but it will be pointing at the temp location (which no longer exists). The files will appear in red. This is expected — we'll fix it in the next phase.

---

## Phase 2 — Wire Up Existing Source Files

### Step 2.1 — Remove the broken file references

In the Project Navigator sidebar:

1. Expand the **`track-em-toys`** source folder (blue folder icon)
2. Select all red/missing files that Xcode generated (typically `ContentView.swift`, `track_em_toysApp.swift`, `Assets.xcassets`, `Preview Content`)
3. Right-click → **Delete** → **Remove Reference** (NOT "Move to Trash" — the files are already gone)
4. Do the same for the **`track-em-toysTests`** folder — remove the generated `track_em_toysTests.swift` reference

### Step 2.2 — Add the existing source folders to the main target

1. Right-click the **`track-em-toys`** folder in the Project Navigator
2. Select **Add Files to "track-em-toys"…**
3. Navigate to `ios/track-em-toys/`
4. Select all three folders: **`App`**, **`Auth`**, **`Networking`**
5. In the options dialog:
   - **Destination:** "Copy items if needed" → **Unchecked** (files are already in place)
   - **Added folders:** "Create folder references" (the default in Xcode 26 — folders mirror the filesystem)
   - **Add to targets:** Check **`track-em-toys`** only
6. Click **Add**

### Step 2.3 — Add an Assets catalog

The project needs an `Assets.xcassets` for the app icon and colors:

1. Select the **`track-em-toys`** folder in the Project Navigator
2. **File → New → File…** (or ⌘N)
3. Search for **"Asset Catalog"**
4. Name it `Assets` and save into `ios/track-em-toys/`
5. Ensure it's added to the **`track-em-toys`** target

### Step 2.4 — Add existing test files to the test target

1. Expand the **`track-em-toysTests`** folder in the Project Navigator
2. Right-click it → **Add Files to "track-em-toys"…**
3. Navigate to `ios/track-em-toysTests/`
4. Select both folders: **`Auth`**, **`Networking`**
5. In the options dialog:
   - **Destination:** "Copy items if needed" → **Unchecked**
   - **Added folders:** "Create folder references"
   - **Add to targets:** Check **`track-em-toysTests`** only (NOT the main target)
6. Click **Add**

### Step 2.5 — Verify file membership

Confirm the files landed in the correct targets:

1. Click any source file in `App/`, `Auth/`, or `Networking/`
2. Open the **File Inspector** (right sidebar, first tab or ⌥⌘1)
3. Under **Target Membership**, verify only **`track-em-toys`** is checked
4. Click any test file in `track-em-toysTests/`
5. Verify only **`track-em-toysTests`** is checked

---

## Phase 3 — Configure Build Settings

### Step 3.1 — Set deployment targets

1. In the Project Navigator, click the **`track-em-toys`** project (blue icon at the top)
2. Select the **`track-em-toys`** target (under TARGETS, not PROJECT)
3. Go to the **General** tab
4. Under **Supported Destinations**, confirm both **iPhone** and **Mac** are listed
   - If Mac is missing: click **+** → select **Mac (Designed for Mac)** or **Mac Catalyst** depending on your preference. "Designed for Mac" is recommended for a native macOS feel.
5. Under **Minimum Deployments**:
   - **iOS:** 26.0 (or your preferred minimum)
   - **macOS:** 26.0 (or your preferred minimum)

### Step 3.2 — Verify Swift language version

1. Stay on the **`track-em-toys`** target
2. Go to **Build Settings** tab
3. Search for **"Swift Language Version"**
4. Confirm it is set to **Swift 6** (should be the default in Xcode 26)

### Step 3.3 — Set the test target's host application

1. Select the **`track-em-toysTests`** target
2. Go to the **General** tab
3. Under **Host Application**, select **`track-em-toys`**
4. Ensure **Allow testing Host Application APIs** is checked (this enables `@testable import`)

---

## Phase 4 — Add SPM Dependencies

### Step 4.1 — Add GoogleSignIn-iOS

1. **File → Add Package Dependencies…** (or from Project Settings → Package Dependencies tab → **+**)
2. In the search field, paste: `https://github.com/google/GoogleSignIn-iOS`
3. Set **Dependency Rule** to **"Up to Next Major Version"** from `9.1.0`
4. Click **Add Package** and wait for resolution
5. When prompted to choose package products:
   - Check **`GoogleSignIn`**
   - Set "Add to Target" to **`track-em-toys`**
6. Click **Add Package**

> Note: GoogleSignIn-iOS only supports iOS. Xcode will automatically link it only for the iOS destination in a multiplatform target. The `#if os(iOS)` guards in `GoogleSignInCoordinator.swift` and `AuthView.swift` ensure the macOS build skips Google Sign-In code.

---

## Phase 5 — Add Google OAuth Client ID Plist

The GoogleSignIn-iOS SDK (without Firebase) uses a plist file downloaded from the Google Cloud Console. This file has a long auto-generated name — **not** `GoogleService-Info.plist` (that's a Firebase-specific file).

### Step 5.1 — Obtain the plist

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Find your **iOS OAuth 2.0 Client ID** (the one whose bundle ID matches your app)
3. Click the download icon (⬇) to download the plist
4. The downloaded file will be named: `client_<numbers>-<alphanumeric>.apps.googleusercontent.com.plist`
   - Example: `client_10123456789012-4fcrokg80c5r7d8s00a2aqdeadbeef.apps.googleusercontent.com.plist`

### Step 5.2 — Verify the plist contents

Open the file in a text editor or Xcode to confirm it contains the expected keys:

```bash
# From the repo root — adjust the filename to match yours
plutil -p ios/track-em-toys/client_*.apps.googleusercontent.com.plist
```

You should see output similar to:

```
{
  "CLIENT_ID" => "<numbers>-<alphanumeric>.apps.googleusercontent.com"
  "REVERSED_CLIENT_ID" => "com.googleusercontent.apps.<numbers>-<alphanumeric>"
  "PLIST_VERSION" => "1"
  "BUNDLE_ID" => "<your-org-id>.track-em-toys"
}
```

**Verify these two things:**
- **`CLIENT_ID`** must match `GOOGLE_IOS_CLIENT_ID` in your API's `.env`
- **`BUNDLE_ID`** must match your Xcode target's Bundle Identifier and `APPLE_BUNDLE_ID` in your API's `.env`

### Step 5.3 — Add to project

1. Drag the `client_*.apps.googleusercontent.com.plist` file into the **`track-em-toys`** folder in Xcode's Project Navigator
2. In the dialog:
   - **Destination:** "Copy items if needed" → **Checked** (copies into `ios/track-em-toys/`)
   - **Add to targets:** Check **`track-em-toys`**
3. Click **Finish**

> The GoogleSignIn-iOS SDK auto-discovers this plist at runtime by scanning the app bundle for a file matching the `*.apps.googleusercontent.com.plist` naming pattern. Do **not** rename it.

### Step 5.4 — .gitignore and template

The Google OAuth plist and `Info.plist` (which contains your reversed client ID as a URL scheme) are `.gitignored` to keep developer-specific OAuth client IDs out of the repo. A template is provided at `ios/track-em-toys/Info.plist.example`.

When setting up for the first time, copy the template:

```bash
cp ios/track-em-toys/Info.plist.example ios/track-em-toys/Info.plist
```

You'll replace the `REVERSED_CLIENT_ID_FROM_GOOGLE_OAUTH_PLIST` placeholder in Phase 6.

---

## Phase 6 — Configure URL Schemes (Google Sign-In callback)

### Step 6.1 — Find your reversed client ID

1. Open the `client_*.apps.googleusercontent.com.plist` file (added in Step 5.3) in a text editor or run:

```bash
plutil -p ios/track-em-toys/client_*.apps.googleusercontent.com.plist | grep REVERSED
```

2. Copy the `REVERSED_CLIENT_ID` value (e.g. `com.googleusercontent.apps.123456789-abcdefghijk`)

### Step 6.2 — Update Info.plist

If you created `Info.plist` from the template in Step 5.4, replace the placeholder:

1. Open `ios/track-em-toys/Info.plist` in a text editor
2. Replace `REVERSED_CLIENT_ID_FROM_GOOGLE_OAUTH_PLIST` with the value from Step 6.1

Alternatively, you can configure this in Xcode's UI:

1. Select the **`track-em-toys`** target → **Info** tab
2. Expand **URL Types** — if you used the template, the entry already exists with the placeholder value
3. Update the **URL Schemes** field with your `REVERSED_CLIENT_ID` value from Step 6.1
4. Verify **Identifier** is `com.google.sign-in` and **Role** is `Editor`

---

## Phase 7 — Enable Signing & Capabilities

### Step 7.1 — Configure signing

1. Select the **`track-em-toys`** target → **Signing & Capabilities** tab
2. Under **Signing** (for each destination — "All" or individually for iOS and macOS):
   - **Team:** Select your Apple Developer team
   - **Bundle Identifier:** Must match `APPLE_BUNDLE_ID` in your API `.env` (`<your-org-id>.track-em-toys`)
   - **Signing Certificate:** "Sign to Run Locally" for development, or your distribution cert
3. Verify **Automatically manage signing** is checked

### Step 7.2 — Add Sign in with Apple capability

1. Stay on **Signing & Capabilities** tab
2. Click **+ Capability** (top-left of the tab)
3. Search for **"Sign in with Apple"**
4. Double-click to add it
5. Verify it appears in the capabilities list

> This adds the `com.apple.developer.applesignin` entitlement. No further configuration is needed — the default `[Default]` value works.

### Step 7.3 — Add Outgoing Network entitlement (required for macOS)

The macOS App Sandbox blocks all outgoing network connections by default. Without this entitlement, the app cannot reach the API server (`NSURLErrorDomain Code=-1003`).

1. Stay on **Signing & Capabilities** tab
2. Click **+ Capability**
3. Search for **"App Sandbox"** — it may already be present for macOS targets
4. Under **Network**, check **Outgoing Connections (Client)**

> This adds `com.apple.security.network.client = true` to the entitlements file. iOS does not require this (all iOS apps can make outgoing connections), but when running on macOS the sandbox enforces it.

### Step 7.4 — Add Keychain Sharing capability (recommended)

1. Click **+ Capability** again
2. Search for **"Keychain Sharing"**
3. Double-click to add it
4. In the Keychain Groups section, verify the default group is `<your-org-id>.track-em-toys` — it should match your Bundle Identifier (Xcode automatically prepends `$(AppIdentifierPrefix)` — you won't see it in the UI and should not try to add it manually)
5. This ensures Keychain items persist correctly across app updates

---

## Phase 8 — Build Verification

### Step 8.1 — Build for iOS Simulator

1. In the Xcode toolbar, select a simulator: **iPhone 16** (or any iOS 26 simulator)
2. Press **⌘B** to build
3. Fix any issues:
   - **Red errors in red files:** A file reference is broken — re-add via Step 2.2
   - **"No such module 'GoogleSignIn'":** Package resolution may still be running — wait for it or go to File → Packages → Resolve Package Versions
   - **Signing errors:** Verify your Team is selected in Step 7.1

### Step 8.2 — Build for macOS

1. In the Xcode toolbar, change the destination to **My Mac**
2. Press **⌘B** to build
3. The GoogleSignIn import is wrapped in `#if os(iOS)` so it won't cause errors on macOS

### Step 8.3 — Run tests

1. Set destination back to an **iOS Simulator**
2. Press **⌘U** to run all tests
3. Verify all 6 test files pass:
   - `NetworkModelsTests` — encoding/decoding round-trips
   - `KeychainServiceTests` — Keychain CRUD operations
   - `APIClientTests` — HTTP client with MockURLProtocol
   - `AuthEndpointsTests` — request body construction
   - `AppleSignInCoordinatorTests` — nonce generation and SHA-256
   - `AuthManagerTests` — JWT parsing and state management

---

## Phase 9 — Run the App

### Step 9.1 — Set up local TLS certificates

The API and web dev servers require HTTPS. Both share a single mkcert certificate. If you haven't generated it yet:

```bash
# One-time: install mkcert's root CA into the system trust store
mkcert -install

# Generate the shared cert (from repo root)
mkdir -p .certs
cd .certs
mkcert -cert-file cert.pem -key-file key.pem localhost 127.0.0.1 dev.track-em-toys.com
```

The cert must include **`127.0.0.1`** — the macOS native client connects to this address (not `localhost`) to avoid IPv6 loopback issues. macOS resolves `localhost` to `::1` (IPv6) first, but the API server binds to `0.0.0.0` (IPv4 only), causing "Connection refused" errors.

The mkcert root CA is installed in the macOS System keychain, so the macOS native client and browsers trust the self-signed certificate automatically. However, the **iOS Simulator has its own isolated trust store** — see Step 9.3 below.

### Step 9.2 — Start the API server

In a separate terminal:

```bash
cd ~/Repos/track-em-toys/api
npm run dev
```

Ensure your `.env` has `APPLE_BUNDLE_ID`, `GOOGLE_IOS_CLIENT_ID`, `TLS_CERT_FILE`, and `TLS_KEY_FILE` set.

### Step 9.3 — Install mkcert root CA in the iOS Simulator

The iOS Simulator does not inherit trusted certificates from the macOS System keychain. You must inject the mkcert root CA into the simulator's trust store:

```bash
# With the simulator already booted (running the app from Xcode boots it):
xcrun simctl keychain booted add-root-cert "$(mkcert -CAROOT)/rootCA.pem"
```

Without this step, the app will fail with `NSURLErrorDomain Code=-1202 "The certificate for this server is invalid"`.

> **Note:** You must repeat this after erasing a simulator (`Device → Erase All Content and Settings`) or when using a new simulator for the first time. The root CA persists across app reinstalls and Xcode restarts on the same simulator instance.

### Step 9.4 — Run on iOS Simulator

1. Select **iPhone 16** as the destination
2. Press **⌘R** to build and run
3. The app should show a loading spinner briefly, then the **AuthView** with:
   - "Sign in with Apple" button
   - "Sign in with Google" button

### Step 9.5 — Run on macOS

1. Select **My Mac** as the destination
2. Press **⌘R**
3. The app should show the **AuthView** with:
   - "Sign in with Apple" button only (Google is hidden on macOS)

### Step 9.6 — Test auth flows

- **Apple Sign-In:** Tap the button → Apple sign-in sheet appears → sign in → should redirect to `MainTabView`
- **Google Sign-In (iOS only):** Tap the button → Google sign-in sheet appears → sign in → should redirect to `MainTabView`
- **Silent restore:** Kill the app → relaunch → should auto-restore session (no login screen)
- **Sign out:** Tap "Sign Out" in toolbar → should return to `AuthView`

> Note: Apple Sign-In on Simulator requires a signed-in iCloud account in the simulator's Settings app.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `No such module 'GoogleSignIn'` | File → Packages → Resolve Package Versions, then ⌘B |
| `Signing requires a development team` | Target → Signing & Capabilities → select your Team |
| Bundle ID mismatch with API | Ensure target's Bundle Identifier matches `APPLE_BUNDLE_ID` in `api/.env` |
| Test target can't import app module | Step 3.3 — set Host Application and enable "Allow testing Host Application APIs" |
| Red file references after moving `.xcodeproj` | Remove broken references (Remove Reference, not Move to Trash), re-add via Step 2.2/2.4 |
| Apple Sign-In doesn't work on Simulator | Sign into an Apple ID in Simulator → Settings → Apple Account |
| `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` error in tests | Keychain tests may need the "Keychain Sharing" capability on the test target too |
| macOS build fails with UIKit references | All UIKit code should be wrapped in `#if os(iOS)` — check `GoogleSignInCoordinator.swift` and `AuthView.swift` |
| macOS: "A server with the specified hostname could not be found" (`NSURLErrorDomain -1003`) | Missing `com.apple.security.network.client` entitlement — see Step 7.3 |
| macOS: "Connection refused" on `::1` (IPv6) | The API binds to `0.0.0.0` (IPv4 only). Use `127.0.0.1` instead of `localhost` in the debug base URL to force IPv4 |
| TLS certificate error connecting to local API (macOS) | Regenerate certs with `mkcert` including all needed SANs: `mkcert -cert-file cert.pem -key-file key.pem localhost 127.0.0.1 dev.track-em-toys.com` — see Step 9.1 |
| iOS Simulator: "The certificate for this server is invalid" (`NSURLErrorDomain -1202`) | The simulator doesn't trust the mkcert CA — run `xcrun simctl keychain booted add-root-cert "$(mkcert -CAROOT)/rootCA.pem"` — see Step 9.3 |

---

## File Checklist

After setup, your `ios/` directory should contain:

```
ios/
  track-em-toys.xcodeproj/          ← Xcode project (from Phase 1)
  track-em-toys/
    App/
      TrackEmToysApp.swift           ← App entry point
    Auth/
      AuthManager.swift              ← Session coordinator
      AuthView.swift                 ← Login UI
      AppleSignInCoordinator.swift   ← Apple Sign-In bridge
      GoogleSignInCoordinator.swift  ← Google Sign-In wrapper (iOS only)
      KeychainService.swift          ← Secure storage
    Networking/
      APIClient.swift                ← HTTP client actor
      AuthEndpoints.swift            ← Typed API functions
      NetworkModels.swift            ← Codable structs + error types
    Assets.xcassets/                 ← App icon and colors (from Phase 2.3)
    GoogleService-Info.plist         ← Google iOS client ID (from Phase 5)
  track-em-toysTests/
    Auth/
      AuthManagerTests.swift
      AppleSignInCoordinatorTests.swift
      KeychainServiceTests.swift
    Networking/
      APIClientTests.swift
      AuthEndpointsTests.swift
      NetworkModelsTests.swift
  CLAUDE.md                          ← iOS domain rules
```
