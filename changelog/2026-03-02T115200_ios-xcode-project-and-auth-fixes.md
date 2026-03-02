# iOS Xcode Project Setup & Native Auth Fixes

**Date:** 2026-03-02
**Time:** 11:52:00 AEDT
**Type:** Feature Addition
**Phase:** Phase 4 — iOS Native Client
**Version:** v0.4.0

## Summary

Added the complete iOS/macOS Xcode project with multiplatform support (iPhone + Mac), wired up existing Swift auth and networking source files, and fixed three critical issues preventing native Apple Sign-In from working: missing network entitlement, incorrect API port, and nonce hash mismatch. Also added comprehensive TLS/mkcert documentation for local development.

---

## Changes Implemented

### 1. iOS Xcode Project

Complete Xcode project setup for the multiplatform iOS/macOS app, referencing existing Swift source files created in a prior phase.

**Created:**
- `ios/track-em-toys.xcodeproj/` — Xcode project with iOS + macOS destinations, Swift 6, SwiftUI
- `ios/track-em-toys/Assets.xcassets/` — Asset catalog (app icon, accent color)
- `ios/track-em-toys/Info.plist.example` — Template for Google Sign-In URL scheme config

**Source files staged (written in prior phase, first time committed):**
- `ios/track-em-toys/App/TrackEmToysApp.swift` — App entry point
- `ios/track-em-toys/Auth/` — AuthManager, AuthView, AppleSignInCoordinator, GoogleSignInCoordinator, KeychainService
- `ios/track-em-toys/Networking/` — APIClient, AuthEndpoints, NetworkModels
- `ios/track-em-toysTests/Auth/` — AuthManagerTests, AppleSignInCoordinatorTests, KeychainServiceTests
- `ios/track-em-toysTests/Networking/` — APIClientTests, AuthEndpointsTests, NetworkModelsTests

### 2. Native Auth Bug Fixes

Three issues preventing Apple Sign-In on the native macOS and iOS clients:

**a) Missing network entitlement (macOS App Sandbox)**
- Added `com.apple.security.network.client = true` to `track-em-toys.entitlements`
- Without this, macOS sandbox blocks all outgoing network connections (`NSURLErrorDomain -1003`)

**b) Incorrect API port and hostname**
- Changed debug base URL from `https://localhost:3000` to `https://127.0.0.1:3010`
- Port 3010 matches the actual Fastify server configuration
- `127.0.0.1` avoids IPv6 loopback issues (macOS resolves `localhost` to `::1` first, but Fastify binds to `0.0.0.0` IPv4-only)

**c) Nonce hash mismatch**
- Changed `AuthManager.signInWithApple()` to send `SHA256(rawNonce)` instead of `rawNonce`
- The `apple-signin-auth` library compares the nonce parameter directly against Apple's ID token claim, which contains the hashed nonce
- Fixed: `nonce: AppleSignInCoordinator.sha256Hex(result.rawNonce)`

### 3. TLS / mkcert Documentation

**Modified:**
- `api/README.md` — Added TLS section: env vars, mkcert cert generation, iOS Simulator CA trust, cert regeneration instructions. Fixed Apple Sign-In nonce docs (was "raw nonce", now "SHA-256 hex hash").

### 4. iOS Setup Guide

**Created:**
- `docs/iOS_Xcode_Project_Setup_Guide.md` — Step-by-step guide covering project creation, file wiring, build settings, SPM dependencies, Google OAuth plist, signing & capabilities (including network entitlement), TLS cert setup, iOS Simulator CA injection, and troubleshooting table

### 5. iOS Auth Architecture Blueprint

**Created:**
- `docs/iOS_Authentication_Architecture_Blueprint.md` — Architecture document for the iOS auth layer design decisions

### 6. Miscellaneous Updates

**Modified:**
- `.gitignore` — Added `ios/track-em-toys/Info.plist` and `*.apps.googleusercontent.com.plist` (developer-specific OAuth config)
- `CLAUDE.md` — Updated minimum deployment targets from iOS 17/macOS 14 to iOS 26.2/macOS 26.2
- `docs/Toy_Collection_Catalog_Requirements_v1_0.md` — Updated device baselines (iPhone 15 Pro+) and iOS minimum (26.2+)

---

## Technical Details

### TLS Certificate Setup (mkcert)

```bash
# One-time CA installation
mkcert -install

# Generate shared cert (from repo root)
mkdir -p .certs
cd .certs
mkcert -cert-file cert.pem -key-file key.pem localhost 127.0.0.1 dev.track-em-toys.com
```

SANs required:
| Hostname | Purpose |
|----------|---------|
| `localhost` | Web dev server (Vite) |
| `127.0.0.1` | iOS/macOS native client (avoids IPv6 issues) |
| `dev.track-em-toys.com` | Optional custom domain for cookie scoping |

### iOS Simulator CA Trust

```bash
xcrun simctl keychain booted add-root-cert "$(mkcert -CAROOT)/rootCA.pem"
```

Must be repeated after erasing a simulator or using a new instance.

### Nonce Flow (Apple Sign-In)

1. Client generates `rawNonce`, computes `hashedNonce = SHA256(rawNonce)`
2. Client sends `hashedNonce` to Apple in the ASAuthorization request
3. Apple stores `hashedNonce` in the ID token's `nonce` claim
4. Client sends `hashedNonce` to the API (not `rawNonce`)
5. `apple-signin-auth` compares the parameter directly against the token claim

---

## Validation & Testing

- ✅ macOS app: Apple Sign-In flow completes successfully
- ✅ iOS Simulator: Apple Sign-In flow completes successfully
- ✅ API receives and processes native sign-in requests (client_type: native)
- ✅ TLS certificates trusted on both macOS and iOS Simulator
- ✅ 6 test files in `track-em-toysTests/` included (12 tests total)

---

## Impact Assessment

- **iOS/macOS native client** is now functional for Apple Sign-In end-to-end
- **Google Sign-In** works on iOS only (SDK not available on macOS) — `#if os(iOS)` guards in place
- **Developer onboarding** improved with comprehensive Xcode setup guide and TLS documentation
- **API documentation** now accurately describes the nonce parameter format

---

## Related Files

**Created (33 files):**
- `ios/track-em-toys.xcodeproj/` (project, workspace, package resolved, scheme management)
- `ios/track-em-toys/` (app source, auth, networking, assets, entitlements)
- `ios/track-em-toysTests/` (auth tests, networking tests)
- `docs/iOS_Xcode_Project_Setup_Guide.md`
- `docs/iOS_Authentication_Architecture_Blueprint.md`

**Modified (4 files):**
- `.gitignore` — iOS-specific ignores
- `CLAUDE.md` — deployment target update
- `api/README.md` — TLS docs, nonce docs
- `docs/Toy_Collection_Catalog_Requirements_v1_0.md` — device baseline updates

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Files created | 29 |
| Files modified | 4 |
| Total lines added | ~4,055 |
| Swift source files | 9 |
| Swift test files | 6 |
| Documentation files | 2 |
| Bug fixes | 3 (entitlement, port, nonce) |

---

## Status

✅ COMPLETE
