import Foundation
import Testing

@testable import track_em_toys

struct AuthManagerTests {

    // MARK: - JWT Helpers

    @Test func extractExpirationFromValidJWT() {
        // Create a JWT with exp = 1700000000 (2023-11-14T22:13:20Z)
        let payload = #"{"sub":"user1","exp":1700000000}"#
        let jwt = makeJWT(payload: payload)

        let date = AuthManager.extractExpiration(from: jwt)
        #expect(date != nil)
        #expect(date == Date(timeIntervalSince1970: 1_700_000_000))
    }

    @Test func extractExpirationFromInvalidJWT() {
        #expect(AuthManager.extractExpiration(from: "not.a.jwt") == nil)
        #expect(AuthManager.extractExpiration(from: "only-one-part") == nil)
        #expect(AuthManager.extractExpiration(from: "") == nil)
    }

    @Test func extractExpirationFromJWTWithoutExp() {
        let payload = #"{"sub":"user1"}"#
        let jwt = makeJWT(payload: payload)
        #expect(AuthManager.extractExpiration(from: jwt) == nil)
    }

    @Test func isTokenExpiredReturnsTrueForPastToken() {
        let pastExp = Date().timeIntervalSince1970 - 100
        let payload = #"{"exp":\#(Int(pastExp))}"#
        let jwt = makeJWT(payload: payload)
        #expect(AuthManager.isTokenExpired(jwt) == true)
    }

    @Test func isTokenExpiredReturnsFalseForFutureToken() {
        let futureExp = Date().timeIntervalSince1970 + 3600
        let payload = #"{"exp":\#(Int(futureExp))}"#
        let jwt = makeJWT(payload: payload)
        #expect(AuthManager.isTokenExpired(jwt) == false)
    }

    @Test func isTokenExpiredReturnsTrueForGarbage() {
        #expect(AuthManager.isTokenExpired("garbage") == true)
    }

    // MARK: - Base64URL Decode

    @Test func base64URLDecodeStandardPadding() {
        let original = "hello world"
        let encoded = Data(original.utf8).base64EncodedString()
        let decoded = AuthManager.base64URLDecode(encoded)
        #expect(decoded != nil)
        #expect(String(data: decoded!, encoding: .utf8) == original)
    }

    @Test func base64URLDecodeWithURLSafeChars() {
        // Base64url: replace + with -, / with _, remove padding
        let original = "subjects?_d"
        let standardBase64 = Data(original.utf8).base64EncodedString()
        let urlSafe = standardBase64
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .trimmingCharacters(in: CharacterSet(charactersIn: "="))

        let decoded = AuthManager.base64URLDecode(urlSafe)
        #expect(decoded != nil)
        #expect(String(data: decoded!, encoding: .utf8) == original)
    }

    @Test func base64URLDecodeNoPadding() {
        // "a" → base64 "YQ==" → base64url "YQ"
        let decoded = AuthManager.base64URLDecode("YQ")
        #expect(decoded != nil)
        #expect(String(data: decoded!, encoding: .utf8) == "a")
    }

    // MARK: - Initial State

    @Test @MainActor func initialStateIsLoading() {
        let manager = AuthManager()
        #expect(manager.isLoading == true)
        #expect(manager.currentUser == nil)
        #expect(manager.isAuthenticated == false)
    }

    // MARK: - Initialize Without Token

    @Test @MainActor func initializeWithNoTokenShowsAuthView() async {
        KeychainService.clearAll()
        let manager = AuthManager()
        await manager.initialize()

        #expect(manager.isLoading == false)
        #expect(manager.isAuthenticated == false)
        #expect(manager.currentUser == nil)
    }

    // MARK: - isAuthenticated

    @Test @MainActor func isAuthenticatedReflectsCurrentUser() {
        let manager = AuthManager()
        #expect(manager.isAuthenticated == false)
        // currentUser is private(set), so we test via the public initialize/signIn flows
    }

    // MARK: - fetchMe

    @Test @MainActor func fetchMeReturnsResponse() async throws {
        let mockClient = MockAPIClient()
        let meResponse = MeResponse(
            id: "u1",
            email: "test@example.com",
            displayName: "Test",
            avatarUrl: nil,
            linkedAccounts: [LinkedAccount(provider: "google", email: "test@example.com")]
        )
        await mockClient.setResponseToReturn(meResponse)

        let manager = AuthManager(apiClient: APIClient(baseURL: URL(string: "https://localhost")!))
        // We test via AuthEndpoints directly since fetchMe delegates to it
        let response = try await AuthEndpoints.me(using: mockClient)
        #expect(response.id == "u1")
        #expect(response.linkedAccounts.count == 1)

        // Suppress unused variable warning
        _ = manager
    }

    // MARK: - Helpers

    /// Constructs a minimal JWT from a payload JSON string.
    private func makeJWT(payload: String) -> String {
        let header = #"{"alg":"ES256","typ":"JWT"}"#
        let headerB64 = Data(header.utf8).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        let payloadB64 = Data(payload.utf8).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        return "\(headerB64).\(payloadB64).fakesignature"
    }
}
