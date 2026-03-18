# iOS Authentication Architecture Blueprint

**Date:** 2026-02-27
**Status:** Swift source files created, Xcode project configured — see iOS Xcode Project Setup Guide
**Phase:** 4 — iOS Native Client Auth
**Depends on:** Phase 1.2 (API Auth) ✅, Phase 1.3 (Web SPA Auth) ✅

## Context

The API already fully supports native iOS client authentication. This blueprint designs the iOS authentication layer from scratch, mirroring the web auth patterns adapted for Swift 6, SwiftUI, and Apple platform idioms.

**Key API Facts (no API changes required):**

- `APPLE_BUNDLE_ID` is already required in `api/src/config.ts:125` and in the audience list at `api/src/auth/apple.ts:16`
- `GOOGLE_IOS_CLIENT_ID` is already required in `api/src/config.ts:134` and in the audience list at `api/src/auth/google.ts:16`
- `client_type = 'native'` is derived from the `aud` claim — causes the API to return `refresh_token` in the JSON body (`api/src/auth/routes.ts:534-539`)
- `/auth/refresh` and `/auth/logout` accept `refresh_token` in the request body (`api/src/auth/schemas.ts:73-137`)
- `user_info.name` is accepted in `/auth/signin` (`api/src/auth/schemas.ts:20-27`)

---

## Architecture Decision

**Chosen approach: Coordinator pattern with @Observable AuthManager**

The iOS auth layer mirrors the web's `AuthProvider` + `authStore` split, adapted for Swift 6 and Apple platform idioms:

| Component                 | iOS                                               | Web Equivalent                      |
| ------------------------- | ------------------------------------------------- | ----------------------------------- |
| `AuthManager`             | `@MainActor @Observable` — single source of truth | `AuthProvider.tsx`                  |
| `APIClient`               | Swift `actor` — in-memory token + refresh mutex   | `api-client.ts`                     |
| `KeychainService`         | Secure durable storage for refresh token          | `auth-store.ts` (localStorage flag) |
| `AppleSignInCoordinator`  | `ASAuthorizationController` delegate bridge       | `apple-auth.ts`                     |
| `GoogleSignInCoordinator` | `GIDSignIn` async wrapper                         | `google-auth.ts`                    |
| `NetworkModels`           | `Codable` structs                                 | Zod schemas                         |

**Trade-off rationale**: A single `AuthManager` owned at the app level (injected via the SwiftUI environment) gives SwiftUI views a single, observable source of truth without requiring TanStack Query equivalents for auth state. All network calls are async/await, matching the mandatory project convention.

---

## Project Structure

All new files go into `ios/track-em-toys/`. Xcode's blue folder references auto-detect them — no `.pbxproj` edits required.

```
ios/track-em-toys/
  App/
    TrackEmToysApp.swift          ← MODIFY: inject AuthManager, switch root view
  Auth/
    AuthManager.swift             ← NEW: @MainActor @Observable — session lifecycle
    KeychainService.swift         ← NEW: refresh token + Apple name Keychain CRUD
    AppleSignInCoordinator.swift  ← NEW: ASAuthorizationController delegate
    GoogleSignInCoordinator.swift ← NEW: GIDSignIn wrapper
    AuthView.swift                ← NEW: login screen (Apple + Google buttons)
  Networking/
    APIClient.swift               ← NEW: Swift actor — base HTTP, auth headers, 401 retry
    AuthEndpoints.swift           ← NEW: typed functions for signin/refresh/logout
    NetworkModels.swift           ← NEW: Codable structs for auth request/response bodies
```

Test files (in the existing Xcode test target):

```
ios/track-em-toysTests/
  Auth/
    AuthManagerTests.swift
    KeychainServiceTests.swift
    AppleSignInCoordinatorTests.swift
  Networking/
    APIClientTests.swift
```

---

## Component Design

### 1. `APIClient.swift`

**Responsibility**: The Swift equivalent of `web/src/lib/api-client.ts`. Owns the in-memory access token and a refresh mutex. Provides a single `request(_:)` method that handles auth header injection, 401 interception, token refresh, and retry.

**Type**: `actor APIClient` (actor for Sendable conformance and safe concurrent access to the in-memory token and mutex)

**Core interface**:

```swift
actor APIClient {
    private var accessToken: String?
    private var refreshTask: Task<Bool, Never>?

    func setAccessToken(_ token: String)
    func clearAccessToken()
    func getAccessToken() -> String?

    func request<T: Decodable>(_ endpoint: Endpoint) async throws -> T
    func requestVoid(_ endpoint: Endpoint) async throws

    // Internal
    private func attemptRefresh() async -> Bool
    private func buildRequest(for endpoint: Endpoint, token: String?) -> URLRequest
}
```

**Key behaviors**:

- Access token is stored in an actor-isolated `var accessToken: String?` (in-memory only, never persisted).
- `refreshTask` is the Swift equivalent of the web's `refreshPromise` mutex. When multiple concurrent requests get 401, all await the same `Task<Bool, Never>` — only one actual refresh call is made.
- After a successful refresh, retry the original request once. If refresh fails, throw `APIError.sessionExpired` so `AuthManager` can clear state and navigate to `AuthView`.

**Endpoint model**:

```swift
struct Endpoint {
    let path: String
    let method: HTTPMethod
    let body: (any Encodable)?
    let requiresAuth: Bool
}
```

**Dependencies**: `KeychainService` (for refresh token retrieval during refresh cycle), `AuthEndpoints` (for building the refresh request).

**Testability**: Define `APIClientProtocol` for mock injection in tests.

---

### 2. `AuthEndpoints.swift`

**Responsibility**: Typed Swift functions for each API auth call. No logic — only request construction and response decoding.

**Functions**:

```swift
func signIn(provider: OAuthProvider, idToken: String, nonce: String?,
            userInfo: UserInfo?, using client: APIClient) async throws -> AuthResponse

func refreshToken(refreshToken: String, using client: APIClient) async throws -> TokenResponse

func logout(refreshToken: String, using client: APIClient) async throws
```

**Key details**:

- `POST /auth/signin` body: `{ provider, id_token, nonce?, user_info? }` — matches `api/src/types/index.ts:65-72`
- `POST /auth/refresh` body: `{ refresh_token }` — native clients send in body
- `POST /auth/logout` body: `{ refresh_token }` — requires `Authorization: Bearer` header (handled by `APIClient`)
- JSON field names use `snake_case` via `JSONEncoder.keyEncodingStrategy = .convertToSnakeCase`

---

### 3. `NetworkModels.swift`

**Responsibility**: `Codable` structs that exactly mirror the API request/response types from `api/src/types/index.ts`.

```swift
struct SigninRequestBody: Encodable {
    let provider: String          // "apple" | "google"
    let idToken: String           // → id_token
    let nonce: String?
    let userInfo: UserInfoBody?   // → user_info
}

struct UserInfoBody: Encodable {
    let name: String?
}

struct RefreshRequestBody: Encodable {
    let refreshToken: String      // → refresh_token
}

struct LogoutRequestBody: Encodable {
    let refreshToken: String
}

struct AuthResponse: Decodable {
    let accessToken: String       // ← access_token
    let refreshToken: String      // ← refresh_token (non-null for native)
    let user: UserResponse
}

struct TokenResponse: Decodable {
    let accessToken: String
    let refreshToken: String      // non-null for native
}

struct UserResponse: Decodable, Codable {
    let id: UUID
    let email: String?
    let displayName: String?
    let avatarUrl: URL?
}

struct APIErrorResponse: Decodable {
    let error: String
}
```

**Critical note**: `AuthResponse.refreshToken` is `String` (not optional) for native clients. The API returns the raw token in the body when `client_type = 'native'`.

---

### 4. `KeychainService.swift`

**Responsibility**: Durable storage for the refresh token, user profile, and Apple pending display name.

**Type**: `enum KeychainService` (namespace of static functions — no state, all calls go to the OS)

**Keys**:

```swift
private static let refreshTokenKey = "com.trackem.toys.refreshToken"
private static let userProfileKey = "com.trackem.toys.userProfile"
private static let appleDisplayNameKey = "com.trackem.toys.appleDisplayName"
```

**Interface**:

```swift
enum KeychainService {
    // Refresh token
    static func saveRefreshToken(_ token: String) throws
    static func readRefreshToken() throws -> String?
    static func deleteRefreshToken() throws

    // User profile (JSON-encoded UserResponse)
    static func saveUserProfile(_ user: UserResponse) throws
    static func readUserProfile() -> UserResponse?
    static func deleteUserProfile()

    // Apple display name (first-login persistence)
    static func saveAppleDisplayName(_ name: String) throws
    static func readAppleDisplayName() -> String?
    static func deleteAppleDisplayName()
}
```

**Security**:

- Refresh token + user profile: `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` — allows background refresh, does not sync to iCloud Keychain
- Apple display name: `kSecAttrAccessibleWhenUnlocked` — only needed during active sign-in
- `kSecAttrSynchronizable` is **never** set to `true` — each device has its own session
- Uses `Security` framework (`SecItemAdd`, `SecItemCopyMatching`, `SecItemUpdate`, `SecItemDelete`)
- Throws typed `KeychainError` wrapping `OSStatus`

---

### 5. `AuthManager.swift`

**Responsibility**: Central auth session coordinator. Owned at app root, injected into the SwiftUI environment. Drives root view switching.

**Type**: `@MainActor @Observable final class AuthManager`

**State**:

```swift
@MainActor
@Observable
final class AuthManager {
    private(set) var currentUser: UserResponse?
    private(set) var isLoading: Bool = true
    var isAuthenticated: Bool { currentUser != nil }

    private let apiClient: APIClient
    private var refreshTimer: Task<Void, Never>?
}
```

**Interface**:

```swift
func initialize() async
func signInWithApple(_ result: AppleSignInResult) async throws
func signInWithGoogle(_ idToken: String) async throws
func refreshAccessToken() async -> Bool
func signOut() async
func onForeground() async  // called on ScenePhase.active
```

**Initialization flow**:

1. Check for refresh token in Keychain
2. If none: `isLoading = false`, show `AuthView`
3. If found: call `POST /auth/refresh`
4. On success: store new access token in `APIClient`, store new refresh token in Keychain, restore `currentUser` from Keychain profile, schedule refresh timer
5. On failure (401/network): delete Keychain entries, show `AuthView`

**Proactive refresh timer**:

- Decode JWT `exp` claim (base64url decode payload)
- Schedule `Task` that sleeps until 60 seconds before expiry
- On app foreground resume: check if token expired, refresh immediately if needed

**Error type**:

```swift
enum AuthError: LocalizedError {
    case providerSignInCancelled
    case providerSignInFailed(Error)
    case networkError(Error)
    case serverError(Int, String)
    case sessionExpired
    case keychainError(KeychainError)
}
```

---

### 6. `AppleSignInCoordinator.swift`

**Responsibility**: Owns `ASAuthorizationController` and its delegate, handles nonce generation, delivers typed result to `AuthManager`.

**Type**: `final class AppleSignInCoordinator: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding`

**Result type**:

```swift
struct AppleSignInResult {
    let idToken: String
    let rawNonce: String
    let fullName: PersonNameComponents?
    let email: String?
}
```

**Nonce generation** (must match API contract):

1. Generate 32 random bytes using `SecRandomCopyBytes`
2. Hex-encode → `rawNonce` (64 hex characters)
3. SHA-256 hash using `CryptoKit.SHA256.hash(data:)` → hex-encode → `hashedNonce`
4. Set `hashedNonce` on `ASAuthorizationAppleIDRequest.nonce`
5. Pass `rawNonce` to `POST /auth/signin` (API re-hashes and compares)

**Interface**:

```swift
func performSignIn(in window: UIWindow) async throws -> AppleSignInResult
```

Uses `withCheckedThrowingContinuation` to bridge delegate callbacks into async/await.

**Name persistence**: Immediately upon receiving `ASAuthorizationAppleIDCredential`, if `fullName` is non-nil, save to Keychain **before** the API call (Apple only provides the name once).

---

### 7. `GoogleSignInCoordinator.swift`

**Responsibility**: Wraps `GIDSignIn.sharedInstance.signIn(withPresenting:)` into an async function.

**Type**: `final class GoogleSignInCoordinator`

**Interface**:

```swift
func signIn(presenting viewController: UIViewController) async throws -> String
```

Extracts `result.user.idToken?.tokenString`. Throws `GoogleSignInError.missingToken` if nil.

**Configuration**: iOS client ID set in `GoogleService-Info.plist` (standard setup, not hardcoded in source).

---

### 8. `AuthView.swift`

**Responsibility**: Login screen with Apple Sign-In and Google Sign-In buttons.

**Type**: `struct AuthView: View`

**Layout**: Centered logo + app name + two sign-in buttons stacked vertically.

**Buttons**:

- Apple: `SignInWithAppleButton` from `AuthenticationServices` (required by Apple HIG)
- Google: Custom `Button` with Google "G" branding or `GIDSignInButton`

**Error handling**: `@State var errorMessage: String?` displayed via `Alert`.

---

### 9. `TrackEmToysApp.swift` (modify)

**Pattern**:

```swift
@main
struct TrackEmToysApp: App {
    @State private var authManager = AuthManager()

    var body: some Scene {
        WindowGroup {
            Group {
                if authManager.isLoading {
                    ProgressView()
                } else if authManager.isAuthenticated {
                    MainTabView()
                        .environment(authManager)
                } else {
                    AuthView()
                        .environment(authManager)
                }
            }
            .task {
                await authManager.initialize()
            }
        }
    }
}
```

---

## Data Flows

### Sign-In with Apple

```
AuthView (tap button)
  └── AppleSignInCoordinator.performSignIn(in: window)
        ├── CryptoKit: generate rawNonce, hashedNonce
        ├── ASAuthorizationAppleIDProvider → request.nonce = hashedNonce
        ├── ASAuthorizationController.performRequests()
        └── delegate: didCompleteWithAuthorization
              ├── KeychainService.saveAppleDisplayName() ← BEFORE API call
              └── return AppleSignInResult { idToken, rawNonce, fullName, email }
  └── AuthManager.signInWithApple(result)
        └── AuthEndpoints.signIn(provider: .apple, idToken, nonce: rawNonce, userInfo: { name })
              POST /auth/signin → { access_token, refresh_token, user }
        ├── APIClient.setAccessToken(response.accessToken)
        ├── KeychainService.saveRefreshToken(response.refreshToken)
        ├── KeychainService.saveUserProfile(response.user)
        ├── if response.user.displayName != nil: KeychainService.deleteAppleDisplayName()
        ├── AuthManager.currentUser = response.user
        └── scheduleRefreshTimer(accessToken: response.accessToken)
```

### Sign-In with Google

```
AuthView (tap button)
  └── GoogleSignInCoordinator.signIn(presenting: rootVC)
        └── GIDSignIn.sharedInstance.signIn(withPresenting:) → idToken
  └── AuthManager.signInWithGoogle(idToken)
        └── AuthEndpoints.signIn(provider: .google, idToken, nonce: nil, userInfo: nil)
              POST /auth/signin → { access_token, refresh_token, user }
        ├── APIClient.setAccessToken(response.accessToken)
        ├── KeychainService.saveRefreshToken(response.refreshToken)
        ├── KeychainService.saveUserProfile(response.user)
        ├── AuthManager.currentUser = response.user
        └── scheduleRefreshTimer(accessToken: response.accessToken)
```

### App Launch (Silent Restore)

```
TrackEmToysApp.task { await authManager.initialize() }
  └── KeychainService.readRefreshToken()
        ├── nil → isLoading = false, show AuthView
        └── token → AuthEndpoints.refreshToken(token, using: apiClient)
                      POST /auth/refresh { refresh_token: token }
                      → { access_token, refresh_token }
              ├── success:
              │     APIClient.setAccessToken(response.accessToken)
              │     KeychainService.saveRefreshToken(response.refreshToken)  ← rotation
              │     currentUser = KeychainService.readUserProfile()
              │     scheduleRefreshTimer(accessToken: response.accessToken)
              │     isLoading = false
              └── failure (401/network):
                    KeychainService.deleteRefreshToken()
                    KeychainService.deleteUserProfile()
                    isLoading = false  → show AuthView
```

### Proactive Token Refresh

```
refreshTimer Task wakes up 60s before access token exp
  └── AuthManager.refreshAccessToken()
        └── KeychainService.readRefreshToken()
              └── AuthEndpoints.refreshToken(...) → { access_token, refresh_token }
                    ├── success: update Keychain + APIClient, reschedule timer
                    └── failure: signOut() → navigate to AuthView
```

### Reactive Token Refresh (401 Interceptor)

```
APIClient.request(_:) → 401 response
  └── if refreshTask == nil:
        refreshTask = Task { await attemptRefresh() }
  └── await refreshTask!.value
        ├── true: retry original request once with new token
        └── false: throw APIError.sessionExpired
              └── AuthManager catches → calls signOut()
```

### Logout

```
AuthManager.signOut()
  ├── refreshTimer?.cancel()
  ├── KeychainService.readRefreshToken()
  │     └── AuthEndpoints.logout(token, using: apiClient) [best-effort]
  ├── KeychainService.deleteRefreshToken()
  ├── KeychainService.deleteUserProfile()
  ├── KeychainService.deleteAppleDisplayName() [if present]
  ├── APIClient.clearAccessToken()
  └── currentUser = nil → root view switches to AuthView
```

---

## CloudKit Sync Considerations

Auth has **zero interaction** with CloudKit:

- Auth state lives exclusively in Keychain and in-memory — never in SwiftData
- CloudKit syncs SwiftData models representing the user's toy collection (future work)
- Sign-out does NOT clear SwiftData containers for this phase
- When collection models are introduced, all SwiftData attributes must be optional (CloudKit requirement)

---

## SPM Dependencies

| Package                  | Source                                       | Notes                            |
| ------------------------ | -------------------------------------------- | -------------------------------- |
| `GoogleSignIn-iOS`       | `https://github.com/google/GoogleSignIn-iOS` | Add via Xcode SPM package editor |
| `CryptoKit`              | Built-in SDK                                 | SHA-256 for Apple nonce          |
| `AuthenticationServices` | Built-in SDK                                 | Apple Sign-In                    |

---

## Security Considerations

- **Refresh token**: `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` — survives app restart, no iCloud sync
- **Access token**: Never written to disk — actor-isolated in-memory only
- **No `kSecAttrSynchronizable`**: Each device maintains its own session
- **Token reuse detection**: If app is force-killed mid-refresh, API returns 401 "Token reuse detected" and revokes all sessions — `initialize()` handles gracefully
- **`GOOGLE_IOS_CLIENT_ID`**: Embedded in `GoogleService-Info.plist` — public identifier, not a secret

---

## Build Sequence

### Phase A — Foundation Layer (no UI, no auth flow)

- [ ] A1. Create `NetworkModels.swift` — all `Codable` structs with `CodingKeys`. Write encoding/decoding round-trip tests.
- [ ] A2. Create `KeychainService.swift` — refresh token, user profile, Apple name CRUD. Write `KeychainServiceTests.swift`.
- [ ] A3. Create `APIClient.swift` — stub `attemptRefresh` initially. Write `APIClientTests.swift` covering auth header injection, 401 interception, refresh mutex deduplication.

### Phase B — Auth Coordinators

- [ ] B1. Create `AppleSignInCoordinator.swift`. Write tests for nonce generation (64 hex chars, SHA-256 match), delegate paths.
- [ ] B2. Create `GoogleSignInCoordinator.swift`. Write tests for nil token guard.
- [ ] B3. Create `AuthEndpoints.swift`. Write tests verifying request body construction.

### Phase C — Session Manager

- [ ] C1. Create `AuthManager.swift` — wire `APIClient` + `KeychainService`. Implement `initialize()`. Write tests for all restore paths.
- [ ] C2. Implement `signInWithApple` — tests for name Keychain persistence before API call.
- [ ] C3. Implement `signInWithGoogle` — tests for token forwarding.
- [ ] C4. Implement `signOut` — tests for Keychain cleanup and best-effort logout.
- [ ] C5. Implement `scheduleRefreshTimer` + `onForeground` — tests for timer scheduling and foreground resume.

### Phase D — UI Layer

- [ ] D1. Create `AuthView.swift` with `SignInWithAppleButton` + Google button. Add `#Preview`.
- [ ] D2. Modify `TrackEmToysApp.swift` — inject `AuthManager`, root view switch logic.

### Phase E — Validation

- [ ] E1. Run `xcodebuild test` — all unit tests must pass.
- [ ] E2. iOS pre-submission checklist: no UIKit imports, no completion handlers, no force unwraps, `@MainActor` on `AuthManager`, preview providers present.
- [ ] E3. Manual integration test against local API: Apple Sign-In (first + repeat login), Google Sign-In, app kill + relaunch (silent restore), logout.
