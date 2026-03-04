import Foundation
import Testing

@testable import track_em_toys

// MARK: - Mock API Client

actor MockAPIClient: APIClientProtocol {
    var lastEndpoint: Endpoint?
    var lastEncodedBody: Data?
    var responseToReturn: Any?
    var errorToThrow: (any Error)?
    var setTokenCalled = false
    var clearedToken = false
    private var _accessToken: String?

    func setAccessToken(_ token: String) {
        _accessToken = token
        setTokenCalled = true
    }

    func clearAccessToken() {
        _accessToken = nil
        clearedToken = true
    }

    func getAccessToken() -> String? {
        _accessToken
    }

    func request<T: Decodable>(_ endpoint: Endpoint) async throws -> T {
        lastEndpoint = endpoint

        // Capture the encoded body for assertion
        if let body = endpoint.body {
            let encoder = JSONEncoder()
            encoder.keyEncodingStrategy = .convertToSnakeCase
            lastEncodedBody = try? encoder.encode(body)
        }

        if let error = errorToThrow {
            throw error
        }

        guard let response = responseToReturn as? T else {
            throw APIError.decodingError
        }
        return response
    }

    func requestVoid(_ endpoint: Endpoint) async throws {
        lastEndpoint = endpoint

        if let body = endpoint.body {
            let encoder = JSONEncoder()
            encoder.keyEncodingStrategy = .convertToSnakeCase
            lastEncodedBody = try? encoder.encode(body)
        }

        if let error = errorToThrow {
            throw error
        }
    }
}

// MARK: - Tests

struct AuthEndpointsTests {

    // MARK: - signIn

    @Test func signInSendsCorrectEndpoint() async throws {
        let mock = MockAPIClient()
        let authResponse = AuthResponse(
            accessToken: "at_test",
            refreshToken: "rt_test",
            user: UserResponse(id: "u1", email: "e@t.com", displayName: "Test", avatarUrl: nil)
        )
        await mock.setResponseToReturn(authResponse)

        let response = try await AuthEndpoints.signIn(
            provider: .apple,
            idToken: "apple_token",
            nonce: "raw_nonce_123",
            userInfo: UserInfoBody(name: "Jane"),
            using: mock
        )

        let endpoint = await mock.lastEndpoint
        #expect(endpoint?.path == "/auth/signin")
        #expect(endpoint?.method == .post)
        #expect(endpoint?.requiresAuth == false)

        // Verify body
        let bodyData = await mock.lastEncodedBody
        let body = bodyData.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        #expect(body?["provider"] as? String == "apple")
        #expect(body?["id_token"] as? String == "apple_token")
        #expect(body?["nonce"] as? String == "raw_nonce_123")
        let userInfo = body?["user_info"] as? [String: Any]
        #expect(userInfo?["name"] as? String == "Jane")

        #expect(response.accessToken == "at_test")
    }

    @Test func signInWithGoogleHasNoNonce() async throws {
        let mock = MockAPIClient()
        let authResponse = AuthResponse(
            accessToken: "at_g",
            refreshToken: "rt_g",
            user: UserResponse(id: "u2", email: nil, displayName: nil, avatarUrl: nil)
        )
        await mock.setResponseToReturn(authResponse)

        _ = try await AuthEndpoints.signIn(
            provider: .google,
            idToken: "google_token",
            nonce: nil,
            userInfo: nil,
            using: mock
        )

        let bodyData = await mock.lastEncodedBody
        let body = bodyData.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        #expect(body?["provider"] as? String == "google")
        #expect(body?["nonce"] == nil)
        #expect(body?["user_info"] == nil)
    }

    // MARK: - refreshToken

    @Test func refreshTokenSendsCorrectEndpoint() async throws {
        let mock = MockAPIClient()
        let tokenResponse = TokenResponse(accessToken: "new_at", refreshToken: "new_rt")
        await mock.setResponseToReturn(tokenResponse)

        let response = try await AuthEndpoints.refreshToken(
            refreshToken: "old_rt",
            using: mock
        )

        let endpoint = await mock.lastEndpoint
        #expect(endpoint?.path == "/auth/refresh")
        #expect(endpoint?.method == .post)
        #expect(endpoint?.requiresAuth == false)

        let bodyData = await mock.lastEncodedBody
        let body = bodyData.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        #expect(body?["refresh_token"] as? String == "old_rt")

        #expect(response.accessToken == "new_at")
        #expect(response.refreshToken == "new_rt")
    }

    // MARK: - me

    @Test func meSendsCorrectEndpoint() async throws {
        let mock = MockAPIClient()
        let meResponse = MeResponse(
            id: "u1",
            email: "e@t.com",
            displayName: "Test",
            avatarUrl: nil,
            linkedAccounts: [LinkedAccount(provider: "google", email: "e@t.com")]
        )
        await mock.setResponseToReturn(meResponse)

        let response = try await AuthEndpoints.me(using: mock)

        let endpoint = await mock.lastEndpoint
        #expect(endpoint?.path == "/auth/me")
        #expect(endpoint?.method == .get)
        #expect(endpoint?.requiresAuth == true)
        #expect(endpoint?.body == nil)
        #expect(response.linkedAccounts.count == 1)
    }

    // MARK: - linkAccount

    @Test func linkAccountSendsCorrectEndpoint() async throws {
        let mock = MockAPIClient()
        let meResponse = MeResponse(
            id: "u1",
            email: "e@t.com",
            displayName: "Test",
            avatarUrl: nil,
            linkedAccounts: [
                LinkedAccount(provider: "google", email: "e@t.com"),
                LinkedAccount(provider: "apple", email: "apple@example.com"),
            ]
        )
        await mock.setResponseToReturn(meResponse)

        let response = try await AuthEndpoints.linkAccount(
            provider: .apple,
            idToken: "apple-id-token",
            nonce: "hashed-nonce",
            using: mock
        )

        let endpoint = await mock.lastEndpoint
        #expect(endpoint?.path == "/auth/link-account")
        #expect(endpoint?.method == .post)
        #expect(endpoint?.requiresAuth == true)

        let bodyData = await mock.lastEncodedBody
        let body = bodyData.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        #expect(body?["provider"] as? String == "apple")
        #expect(body?["id_token"] as? String == "apple-id-token")
        #expect(body?["nonce"] as? String == "hashed-nonce")

        #expect(response.linkedAccounts.count == 2)
    }

    @Test func linkAccountWithGoogleHasNoNonce() async throws {
        let mock = MockAPIClient()
        let meResponse = MeResponse(
            id: "u1",
            email: "e@t.com",
            displayName: "Test",
            avatarUrl: nil,
            linkedAccounts: [LinkedAccount(provider: "google", email: "e@t.com")]
        )
        await mock.setResponseToReturn(meResponse)

        _ = try await AuthEndpoints.linkAccount(
            provider: .google,
            idToken: "google-token",
            nonce: nil,
            using: mock
        )

        let bodyData = await mock.lastEncodedBody
        let body = bodyData.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        #expect(body?["provider"] as? String == "google")
        #expect(body?["nonce"] == nil)
    }

    // MARK: - logout

    @Test func logoutSendsCorrectEndpoint() async throws {
        let mock = MockAPIClient()

        try await AuthEndpoints.logout(
            refreshToken: "rt_to_revoke",
            using: mock
        )

        let endpoint = await mock.lastEndpoint
        #expect(endpoint?.path == "/auth/logout")
        #expect(endpoint?.method == .post)
        #expect(endpoint?.requiresAuth == true) // Logout requires auth

        let bodyData = await mock.lastEncodedBody
        let body = bodyData.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        #expect(body?["refresh_token"] as? String == "rt_to_revoke")
    }

    @Test func signInPropagatesError() async {
        let mock = MockAPIClient()
        await mock.setErrorToThrow(APIError.httpError(statusCode: 401, message: "Invalid token"))

        do {
            _ = try await AuthEndpoints.signIn(
                provider: .apple,
                idToken: "bad",
                nonce: nil,
                userInfo: nil,
                using: mock
            )
            #expect(Bool(false), "Should have thrown")
        } catch let error as APIError {
            #expect(error == .httpError(statusCode: 401, message: "Invalid token"))
        } catch {
            #expect(Bool(false), "Unexpected error type")
        }
    }
}

// MARK: - MockAPIClient Helpers

extension MockAPIClient {
    func setResponseToReturn(_ response: Any) {
        responseToReturn = response
    }

    func setErrorToThrow(_ error: any Error) {
        errorToThrow = error
    }
}
