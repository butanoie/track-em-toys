import Foundation
import Observation

@MainActor
@Observable
final class AuthManager {
    private(set) var currentUser: UserResponse?
    private(set) var isLoading: Bool = true

    var isAuthenticated: Bool { currentUser != nil }

    let apiClient: APIClient
    private var refreshTimer: Task<Void, Never>?

    init(apiClient: APIClient? = nil) {
        self.apiClient = apiClient ?? APIClient(
            baseURL: URL(string: Self.apiBaseURL)!
        )
    }

    // MARK: - Configuration

    private static var apiBaseURL: String {
        #if DEBUG
        "https://127.0.0.1:3010"
        #else
        "https://api.trackem.toys"
        #endif
    }

    // MARK: - Initialization

    /// Attempts to restore a previous session from the Keychain.
    func initialize() async {
        defer { isLoading = false }

        guard let refreshToken = try? KeychainService.readRefreshToken() else {
            return
        }

        do {
            let tokenResponse = try await AuthEndpoints.refreshToken(
                refreshToken: refreshToken,
                using: apiClient
            )

            await apiClient.setAccessToken(tokenResponse.accessToken)
            try? KeychainService.saveRefreshToken(tokenResponse.refreshToken)

            // Restore user profile from Keychain
            currentUser = KeychainService.readUserProfile()
            scheduleRefreshTimer(accessToken: tokenResponse.accessToken)
        } catch {
            // Refresh failed (token expired, revoked, or network error) — clean slate
            KeychainService.clearAll()
        }
    }

    // MARK: - Sign In with Apple

    func signInWithApple(_ result: AppleSignInResult) async throws {
        // Build user_info with display name if available
        let displayName: String?
        if let fullName = result.fullName {
            let formatter = PersonNameComponentsFormatter()
            let name = formatter.string(from: fullName).trimmingCharacters(in: .whitespaces)
            displayName = name.isEmpty ? nil : name
        } else {
            // Fall back to Keychain-persisted name from a previous attempt
            displayName = KeychainService.readAppleDisplayName()
        }

        let userInfo = displayName.map { UserInfoBody(name: $0) }

        let response = try await AuthEndpoints.signIn(
            provider: .apple,
            idToken: result.idToken,
            nonce: AppleSignInCoordinator.sha256Hex(result.rawNonce),
            userInfo: userInfo,
            using: apiClient
        )

        await completeSignIn(with: response)

        // If the API accepted the name, we no longer need the Keychain backup
        if response.user.displayName != nil {
            KeychainService.deleteAppleDisplayName()
        }
    }

    // MARK: - Sign In with Google

    func signInWithGoogle(_ idToken: String) async throws {
        let response = try await AuthEndpoints.signIn(
            provider: .google,
            idToken: idToken,
            nonce: nil,
            userInfo: nil,
            using: apiClient
        )

        await completeSignIn(with: response)
    }

    // MARK: - Token Refresh

    /// Attempts to refresh the access token. Returns true on success.
    func refreshAccessToken() async -> Bool {
        guard let refreshToken = try? KeychainService.readRefreshToken() else {
            return false
        }

        do {
            let tokenResponse = try await AuthEndpoints.refreshToken(
                refreshToken: refreshToken,
                using: apiClient
            )

            await apiClient.setAccessToken(tokenResponse.accessToken)
            try? KeychainService.saveRefreshToken(tokenResponse.refreshToken)
            scheduleRefreshTimer(accessToken: tokenResponse.accessToken)
            return true
        } catch {
            await signOut()
            return false
        }
    }

    // MARK: - Sign Out

    func signOut() async {
        refreshTimer?.cancel()
        refreshTimer = nil

        // Best-effort server-side logout
        if let refreshToken = try? KeychainService.readRefreshToken() {
            try? await AuthEndpoints.logout(
                refreshToken: refreshToken,
                using: apiClient
            )
        }

        KeychainService.clearAll()
        await apiClient.clearAccessToken()
        currentUser = nil
    }

    // MARK: - Foreground Resume

    /// Called when the app returns to the foreground (ScenePhase.active).
    func onForeground() async {
        guard isAuthenticated else { return }

        // Check if the current access token is expired
        if let token = await apiClient.getAccessToken(), Self.isTokenExpired(token) {
            _ = await refreshAccessToken()
        }
    }

    // MARK: - Private Helpers

    private func completeSignIn(with response: AuthResponse) async {
        await apiClient.setAccessToken(response.accessToken)
        try? KeychainService.saveRefreshToken(response.refreshToken)
        try? KeychainService.saveUserProfile(response.user)
        currentUser = response.user
        scheduleRefreshTimer(accessToken: response.accessToken)
    }

    // MARK: - Proactive Refresh Timer

    private func scheduleRefreshTimer(accessToken: String) {
        refreshTimer?.cancel()

        guard let expiresAt = Self.extractExpiration(from: accessToken) else { return }

        // Refresh 60 seconds before expiration
        let refreshAt = expiresAt.addingTimeInterval(-60)
        let delay = refreshAt.timeIntervalSinceNow

        guard delay > 0 else {
            // Already past the refresh window — refresh immediately
            refreshTimer = Task { [weak self] in
                _ = await self?.refreshAccessToken()
            }
            return
        }

        refreshTimer = Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled else { return }
            _ = await self?.refreshAccessToken()
        }
    }

    // MARK: - JWT Helpers

    /// Extracts the `exp` claim from a JWT's payload (base64url-decoded).
    nonisolated static func extractExpiration(from jwt: String) -> Date? {
        let parts = jwt.split(separator: ".")
        guard parts.count == 3 else { return nil }

        let payload = String(parts[1])
        guard let data = base64URLDecode(payload) else { return nil }

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let exp = json["exp"] as? TimeInterval else {
            return nil
        }

        return Date(timeIntervalSince1970: exp)
    }

    /// Checks if a JWT's `exp` claim is in the past (or within 5 seconds of now).
    nonisolated static func isTokenExpired(_ jwt: String) -> Bool {
        guard let expiresAt = extractExpiration(from: jwt) else {
            return true // If we can't decode it, treat as expired
        }
        return expiresAt.timeIntervalSinceNow < 5
    }

    /// Base64url-encodes data (no padding), per RFC 4648 §5.
    nonisolated static func base64URLEncode(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    /// Decodes a base64url-encoded string (no padding required).
    nonisolated static func base64URLDecode(_ string: String) -> Data? {
        var base64 = string
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")

        // Pad to multiple of 4
        let remainder = base64.count % 4
        if remainder > 0 {
            base64.append(contentsOf: String(repeating: "=", count: 4 - remainder))
        }

        return Data(base64Encoded: base64)
    }
}
