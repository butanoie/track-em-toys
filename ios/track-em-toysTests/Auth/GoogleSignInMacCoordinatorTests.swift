import AuthenticationServices
import CryptoKit
import Foundation
import Testing

@testable import track_em_toys

// MARK: - Test Credentials

/// Shared test credentials used across all coordinator tests.
private let testCredentials = GoogleDesktopCredentials(
    clientID: "test-desktop-id.apps.googleusercontent.com",
    clientSecret: "test-desktop-secret"
)

// MARK: - PKCE Helper Tests

/// PKCE helpers are static and nonisolated — test on all platforms without @MainActor.
struct PKCEHelperTests {

    @Test func codeVerifierHasExpectedLength() {
        let verifier = GoogleSignInMacCoordinator.generateCodeVerifier()
        // 32 random bytes → 43 base64url characters (no padding)
        #expect(verifier.count == 43)
    }

    @Test func codeVerifierContainsOnlyURLSafeCharacters() {
        let verifier = GoogleSignInMacCoordinator.generateCodeVerifier()
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
        let verifierCharacters = CharacterSet(charactersIn: verifier)
        #expect(allowed.isSuperset(of: verifierCharacters))
    }

    @Test func codeVerifierIsUnique() {
        let v1 = GoogleSignInMacCoordinator.generateCodeVerifier()
        let v2 = GoogleSignInMacCoordinator.generateCodeVerifier()
        #expect(v1 != v2)
    }

    @Test func codeChallengeMatchesManualSHA256() {
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
        let challenge = GoogleSignInMacCoordinator.codeChallenge(for: verifier)

        // Manually compute expected challenge
        let hash = SHA256.hash(data: Data(verifier.utf8))
        let expected = Data(hash).base64URLEncodedString()

        #expect(challenge == expected)
    }

    @Test func codeChallengeIsDeterministic() {
        let verifier = "test_verifier_string"
        let c1 = GoogleSignInMacCoordinator.codeChallenge(for: verifier)
        let c2 = GoogleSignInMacCoordinator.codeChallenge(for: verifier)
        #expect(c1 == c2)
    }

    @Test func base64URLEncodeProducesNoPadding() {
        let data = Data([0x00, 0x01, 0x02])
        let encoded = data.base64URLEncodedString()
        #expect(!encoded.contains("="))
        #expect(!encoded.contains("+"))
        #expect(!encoded.contains("/"))
    }

    @Test func base64URLEncodeKnownValue() {
        // "Hello" → base64 "SGVsbG8=" → base64url "SGVsbG8"
        let data = Data("Hello".utf8)
        let encoded = data.base64URLEncodedString()
        #expect(encoded == "SGVsbG8")
    }
}

// MARK: - GoogleDesktopCredentials Tests

struct GoogleDesktopCredentialsTests {

    @Test @MainActor
    func callbackURLSchemeIsReversedClientID() {
        let creds = GoogleDesktopCredentials(
            clientID: "123456.apps.googleusercontent.com",
            clientSecret: "secret"
        )
        #expect(creds.callbackURLScheme == "com.googleusercontent.apps.123456")
    }

    @Test @MainActor
    func callbackURLSchemeMatchesExpectedFormat() {
        #expect(testCredentials.callbackURLScheme == "com.googleusercontent.apps.test-desktop-id")
    }
}

// MARK: - Callback URL Parsing Tests

/// extractAuthCode is nonisolated static — no @MainActor needed.
struct CallbackURLParsingTests {

    /// Compute scheme from known test client ID to avoid @MainActor inference.
    private static let scheme = "com.googleusercontent.apps.test-desktop-id"

    @Test func extractsAuthCodeFromCallbackURL() throws {
        let url = URL(string: "\(Self.scheme):/oauth2callback?code=4/test_auth_code_123")!
        let code = try GoogleSignInMacCoordinator.extractAuthCode(from: url)
        #expect(code == "4/test_auth_code_123")
    }

    @Test func throwsOnErrorParameter() {
        let url = URL(string: "\(Self.scheme):/oauth2callback?error=access_denied")!
        #expect(throws: AuthError.self) {
            try GoogleSignInMacCoordinator.extractAuthCode(from: url)
        }
    }

    @Test func throwsOnMissingCode() {
        let url = URL(string: "\(Self.scheme):/oauth2callback")!
        #expect(throws: AuthError.self) {
            try GoogleSignInMacCoordinator.extractAuthCode(from: url)
        }
    }

    @Test func throwsOnEmptyCode() {
        let url = URL(string: "\(Self.scheme):/oauth2callback?code=")!
        #expect(throws: AuthError.self) {
            try GoogleSignInMacCoordinator.extractAuthCode(from: url)
        }
    }
}

// MARK: - Authorization URL Tests

struct AuthorizationURLTests {

    @Test @MainActor
    func buildAuthorizationURLContainsRequiredParameters() {
        let coordinator = GoogleSignInMacCoordinator(credentials: testCredentials)
        let redirectURI = "http://127.0.0.1:12345"
        let url = coordinator.buildAuthorizationURL(
            codeChallenge: "test_challenge", redirectURI: redirectURI)
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        let params = Dictionary(
            uniqueKeysWithValues: components.queryItems!.map { ($0.name, $0.value!) })

        #expect(params["client_id"] == testCredentials.clientID)
        #expect(params["response_type"] == "code")
        #expect(params["scope"] == "openid email profile")
        #expect(params["code_challenge"] == "test_challenge")
        #expect(params["code_challenge_method"] == "S256")
        #expect(params["redirect_uri"] == redirectURI)
    }
}

// MARK: - Mock Web Auth Session

@MainActor
private final class MockWebAuthSessionProvider: WebAuthSessionProviding, @unchecked Sendable {
    var callbackURLToReturn: URL?
    var errorToThrow: (any Error)?

    func authenticate(url: URL, callbackURLScheme: String) async throws -> URL {
        if let errorToThrow {
            throw errorToThrow
        }
        guard let callbackURL = callbackURLToReturn else {
            throw AuthError.providerSignInFailed("No mock callback configured")
        }
        return callbackURL
    }
}

// MARK: - Mocked Sign-In Flow Tests

struct GoogleSignInMacFlowTests {

    /// Compute scheme from known test client ID to avoid @MainActor inference.
    private static let scheme = "com.googleusercontent.apps.test-desktop-id"

    @Test @MainActor
    func cancellationThrowsProviderSignInCancelled() async {
        let mockSession = MockWebAuthSessionProvider()
        let cancelError = ASWebAuthenticationSessionError(.canceledLogin)
        mockSession.errorToThrow = cancelError

        let coordinator = GoogleSignInMacCoordinator(credentials: testCredentials)
        await #expect(throws: AuthError.providerSignInCancelled) {
            try await coordinator.signIn(using: mockSession)
        }
    }

    @Test @MainActor
    func errorInCallbackThrowsProviderSignInFailed() async {
        let mockSession = MockWebAuthSessionProvider()
        mockSession.callbackURLToReturn = URL(
            string: "\(Self.scheme):/oauth2callback?error=access_denied")!

        let coordinator = GoogleSignInMacCoordinator(credentials: testCredentials)
        await #expect(throws: AuthError.self) {
            try await coordinator.signIn(using: mockSession)
        }
    }

    @Test @MainActor
    func missingCodeInCallbackThrowsError() async {
        let mockSession = MockWebAuthSessionProvider()
        mockSession.callbackURLToReturn = URL(
            string: "\(Self.scheme):/oauth2callback")!

        let coordinator = GoogleSignInMacCoordinator(credentials: testCredentials)
        await #expect(throws: AuthError.self) {
            try await coordinator.signIn(using: mockSession)
        }
    }

    @Test @MainActor
    func otherErrorsPropagateUnchanged() async {
        let mockSession = MockWebAuthSessionProvider()
        let networkError = NSError(domain: NSURLErrorDomain, code: NSURLErrorNotConnectedToInternet)
        mockSession.errorToThrow = networkError

        let coordinator = GoogleSignInMacCoordinator(credentials: testCredentials)
        await #expect(throws: (any Error).self) {
            try await coordinator.signIn(using: mockSession)
        }
    }
}
