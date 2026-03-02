import Foundation

enum AuthEndpoints {

    /// POST /auth/signin — Exchange provider ID token for app session.
    static func signIn(
        provider: OAuthProvider,
        idToken: String,
        nonce: String?,
        userInfo: UserInfoBody?,
        using client: APIClientProtocol
    ) async throws -> AuthResponse {
        let body = SigninRequestBody(
            provider: provider.rawValue,
            idToken: idToken,
            nonce: nonce,
            userInfo: userInfo
        )

        let endpoint = Endpoint(
            path: "/auth/signin",
            method: .post,
            body: body,
            requiresAuth: false
        )

        return try await client.request(endpoint)
    }

    /// POST /auth/refresh — Rotate refresh token and get new access token.
    static func refreshToken(
        refreshToken: String,
        using client: APIClientProtocol
    ) async throws -> TokenResponse {
        let body = RefreshRequestBody(refreshToken: refreshToken)

        let endpoint = Endpoint(
            path: "/auth/refresh",
            method: .post,
            body: body,
            requiresAuth: false
        )

        return try await client.request(endpoint)
    }

    /// POST /auth/logout — Revoke refresh token (best-effort, requires auth).
    static func logout(
        refreshToken: String,
        using client: APIClientProtocol
    ) async throws {
        let body = LogoutRequestBody(refreshToken: refreshToken)

        let endpoint = Endpoint(
            path: "/auth/logout",
            method: .post,
            body: body,
            requiresAuth: true
        )

        try await client.requestVoid(endpoint)
    }
}
