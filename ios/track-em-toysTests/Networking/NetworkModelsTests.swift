import Foundation
import Testing

@testable import track_em_toys

struct NetworkModelsTests {

    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.outputFormatting = .sortedKeys
        return encoder
    }()

    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }()

    // MARK: - SigninRequestBody Encoding

    @Test func signinRequestBodyEncodesWithAllFields() throws {
        let body = SigninRequestBody(
            provider: "apple",
            idToken: "token123",
            nonce: "nonce456",
            userInfo: UserInfoBody(name: "Test User")
        )
        let json = try encoder.encode(body)
        let dict = try JSONSerialization.jsonObject(with: json) as! [String: Any]

        #expect(dict["provider"] as? String == "apple")
        #expect(dict["id_token"] as? String == "token123")
        #expect(dict["nonce"] as? String == "nonce456")
        let userInfo = dict["user_info"] as? [String: Any]
        #expect(userInfo?["name"] as? String == "Test User")
    }

    @Test func signinRequestBodyEncodesWithNilOptionals() throws {
        let body = SigninRequestBody(
            provider: "google",
            idToken: "gtoken",
            nonce: nil,
            userInfo: nil
        )
        let json = try encoder.encode(body)
        let dict = try JSONSerialization.jsonObject(with: json) as! [String: Any]

        #expect(dict["provider"] as? String == "google")
        #expect(dict["id_token"] as? String == "gtoken")
        #expect(dict["nonce"] == nil)
        #expect(dict["user_info"] == nil)
    }

    // MARK: - RefreshRequestBody Encoding

    @Test func refreshRequestBodyEncodes() throws {
        let body = RefreshRequestBody(refreshToken: "rt_abc123")
        let json = try encoder.encode(body)
        let dict = try JSONSerialization.jsonObject(with: json) as! [String: Any]

        #expect(dict["refresh_token"] as? String == "rt_abc123")
    }

    // MARK: - LogoutRequestBody Encoding

    @Test func logoutRequestBodyEncodes() throws {
        let body = LogoutRequestBody(refreshToken: "rt_xyz789")
        let json = try encoder.encode(body)
        let dict = try JSONSerialization.jsonObject(with: json) as! [String: Any]

        #expect(dict["refresh_token"] as? String == "rt_xyz789")
    }

    // MARK: - AuthResponse Decoding

    @Test func authResponseDecodes() throws {
        let json = """
        {
            "access_token": "at_123",
            "refresh_token": "rt_456",
            "user": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "email": "test@example.com",
                "display_name": "Test User",
                "avatar_url": "https://example.com/avatar.jpg"
            }
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(AuthResponse.self, from: json)
        #expect(response.accessToken == "at_123")
        #expect(response.refreshToken == "rt_456")
        #expect(response.user.id == "550e8400-e29b-41d4-a716-446655440000")
        #expect(response.user.email == "test@example.com")
        #expect(response.user.displayName == "Test User")
        #expect(response.user.avatarUrl == "https://example.com/avatar.jpg")
    }

    @Test func authResponseDecodesWithNullOptionals() throws {
        let json = """
        {
            "access_token": "at_123",
            "refresh_token": "rt_456",
            "user": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "email": null,
                "display_name": null,
                "avatar_url": null
            }
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(AuthResponse.self, from: json)
        #expect(response.user.email == nil)
        #expect(response.user.displayName == nil)
        #expect(response.user.avatarUrl == nil)
    }

    // MARK: - TokenResponse Decoding

    @Test func tokenResponseDecodes() throws {
        let json = """
        {
            "access_token": "new_at",
            "refresh_token": "new_rt"
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(TokenResponse.self, from: json)
        #expect(response.accessToken == "new_at")
        #expect(response.refreshToken == "new_rt")
    }

    // MARK: - UserResponse Round-Trip

    @Test func userResponseRoundTrip() throws {
        let user = UserResponse(
            id: "test-id",
            email: "user@example.com",
            displayName: "Jane Doe",
            avatarUrl: "https://example.com/photo.jpg"
        )

        let data = try encoder.encode(user)
        let decoded = try decoder.decode(UserResponse.self, from: data)

        #expect(decoded == user)
    }

    @Test func userResponseRoundTripWithNulls() throws {
        let user = UserResponse(id: "test-id", email: nil, displayName: nil, avatarUrl: nil)
        let data = try encoder.encode(user)
        let decoded = try decoder.decode(UserResponse.self, from: data)

        #expect(decoded == user)
    }

    // MARK: - LinkedAccount Round-Trip

    @Test func linkedAccountRoundTrip() throws {
        let account = LinkedAccount(provider: "google", email: "test@gmail.com")
        let data = try encoder.encode(account)
        let decoded = try decoder.decode(LinkedAccount.self, from: data)

        #expect(decoded == account)
    }

    @Test func linkedAccountRoundTripWithNullEmail() throws {
        let account = LinkedAccount(provider: "apple", email: nil)
        let data = try encoder.encode(account)
        let decoded = try decoder.decode(LinkedAccount.self, from: data)

        #expect(decoded == account)
    }

    // MARK: - MeResponse Decoding

    @Test func meResponseDecodes() throws {
        let json = """
        {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "email": "test@example.com",
            "display_name": "Test User",
            "avatar_url": "https://example.com/avatar.jpg",
            "linked_accounts": [
                {"provider": "google", "email": "test@gmail.com"},
                {"provider": "apple", "email": null}
            ]
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(MeResponse.self, from: json)
        #expect(response.id == "550e8400-e29b-41d4-a716-446655440000")
        #expect(response.email == "test@example.com")
        #expect(response.displayName == "Test User")
        #expect(response.avatarUrl == "https://example.com/avatar.jpg")
        #expect(response.linkedAccounts.count == 2)
        #expect(response.linkedAccounts[0].provider == "google")
        #expect(response.linkedAccounts[0].email == "test@gmail.com")
        #expect(response.linkedAccounts[1].provider == "apple")
        #expect(response.linkedAccounts[1].email == nil)
    }

    @Test func meResponseDecodesWithEmptyAccounts() throws {
        let json = """
        {
            "id": "u1",
            "email": null,
            "display_name": null,
            "avatar_url": null,
            "linked_accounts": []
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(MeResponse.self, from: json)
        #expect(response.email == nil)
        #expect(response.displayName == nil)
        #expect(response.linkedAccounts.isEmpty)
    }

    // MARK: - LinkAccountRequestBody Encoding

    @Test func linkAccountRequestBodyEncodes() throws {
        let body = LinkAccountRequestBody(
            provider: "apple",
            idToken: "apple-id-token",
            nonce: "hashed-nonce"
        )
        let json = try encoder.encode(body)
        let dict = try JSONSerialization.jsonObject(with: json) as! [String: Any]

        #expect(dict["provider"] as? String == "apple")
        #expect(dict["id_token"] as? String == "apple-id-token")
        #expect(dict["nonce"] as? String == "hashed-nonce")
    }

    @Test func linkAccountRequestBodyEncodesWithNilNonce() throws {
        let body = LinkAccountRequestBody(
            provider: "google",
            idToken: "google-id-token",
            nonce: nil
        )
        let json = try encoder.encode(body)
        let dict = try JSONSerialization.jsonObject(with: json) as! [String: Any]

        #expect(dict["provider"] as? String == "google")
        #expect(dict["id_token"] as? String == "google-id-token")
        #expect(dict["nonce"] == nil)
    }

    // MARK: - APIErrorResponse Decoding

    @Test func apiErrorResponseDecodes() throws {
        let json = """
        {"error": "Token reuse detected"}
        """.data(using: .utf8)!

        let response = try decoder.decode(APIErrorResponse.self, from: json)
        #expect(response.error == "Token reuse detected")
    }

    // MARK: - OAuthProvider

    @Test func oauthProviderRawValues() {
        #expect(OAuthProvider.apple.rawValue == "apple")
        #expect(OAuthProvider.google.rawValue == "google")
    }

    // MARK: - HTTPMethod

    @Test func httpMethodRawValues() {
        #expect(HTTPMethod.get.rawValue == "GET")
        #expect(HTTPMethod.post.rawValue == "POST")
        #expect(HTTPMethod.put.rawValue == "PUT")
        #expect(HTTPMethod.patch.rawValue == "PATCH")
        #expect(HTTPMethod.delete.rawValue == "DELETE")
    }

    // MARK: - Endpoint Defaults

    @Test func endpointDefaults() {
        let endpoint = Endpoint(path: "/test")
        #expect(endpoint.method == .get)
        #expect(endpoint.body == nil)
        #expect(endpoint.requiresAuth == true)
    }

    @Test func endpointCustomValues() {
        let body = RefreshRequestBody(refreshToken: "rt")
        let endpoint = Endpoint(path: "/auth/refresh", method: .post, body: body, requiresAuth: false)
        #expect(endpoint.path == "/auth/refresh")
        #expect(endpoint.method == .post)
        #expect(endpoint.body != nil)
        #expect(endpoint.requiresAuth == false)
    }

    // MARK: - Error Descriptions

    @Test func authErrorDescriptions() {
        #expect(AuthError.providerSignInCancelled.errorDescription == "Sign-in was cancelled.")
        #expect(AuthError.sessionExpired.errorDescription == "Your session has expired. Please sign in again.")
        #expect(AuthError.serverError(401, "Unauthorized").errorDescription == "Server error (401): Unauthorized")
    }
}
