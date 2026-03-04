import AuthenticationServices
import CryptoKit
import Foundation

/// Credentials for the Google OAuth "Desktop" client type.
/// Desktop clients require a `client_secret` in the token exchange (unlike iOS public clients).
/// Values are read from Info.plist at runtime — never hardcoded in source.
struct GoogleDesktopCredentials: Sendable {
    let clientID: String
    let clientSecret: String

    /// The reversed-client-ID URL scheme used for the OAuth callback.
    var callbackURLScheme: String {
        clientID.split(separator: ".").reversed().joined(separator: ".")
    }

    /// Lazily reads credentials from Info.plist once and caches them for the process lifetime.
    static let shared: GoogleDesktopCredentials = fromInfoPlist()

    /// Reads `GIDDesktopClientID` and `GIDDesktopClientSecret` from the main bundle's Info.plist.
    private static func fromInfoPlist() -> GoogleDesktopCredentials {
        guard let id = Bundle.main.infoDictionary?["GIDDesktopClientID"] as? String,
            !id.isEmpty
        else {
            fatalError("Missing GIDDesktopClientID in Info.plist")
        }
        guard let secret = Bundle.main.infoDictionary?["GIDDesktopClientSecret"] as? String,
            !secret.isEmpty
        else {
            fatalError("Missing GIDDesktopClientSecret in Info.plist")
        }
        return GoogleDesktopCredentials(clientID: id, clientSecret: secret)
    }
}

/// Abstracts a web-based authentication session for testability.
@MainActor
protocol WebAuthSessionProviding: Sendable {
    func authenticate(
        url: URL,
        callbackURLScheme: String
    ) async throws -> URL
}

@MainActor
final class GoogleSignInMacCoordinator: Sendable {

    // MARK: - Configuration

    let credentials: GoogleDesktopCredentials

    nonisolated(unsafe) private static let authorizationEndpoint = URL(string: "https://accounts.google.com/o/oauth2/v2/auth")!
    nonisolated(unsafe) private static let tokenEndpoint = URL(string: "https://oauth2.googleapis.com/token")!

    // MARK: - Init

    init(credentials: GoogleDesktopCredentials = .shared) {
        self.credentials = credentials
    }

    // MARK: - PKCE Helpers (static, nonisolated — pure functions, testable independently)

    /// Generates a cryptographically random code verifier (43-128 URL-safe characters).
    nonisolated static func generateCodeVerifier() -> String {
        // 32 random bytes → 43 base64url characters (without padding)
        var bytes = [UInt8](repeating: 0, count: 32)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        precondition(status == errSecSuccess, "Failed to generate random bytes")
        return AuthManager.base64URLEncode(Data(bytes))
    }

    /// Computes the S256 code challenge for a given code verifier.
    nonisolated static func codeChallenge(for verifier: String) -> String {
        let hash = SHA256.hash(data: Data(verifier.utf8))
        return AuthManager.base64URLEncode(Data(hash))
    }

    // MARK: - Sign In

    /// Runs the full PKCE OAuth flow: generate verifier → build URL → authenticate → exchange code.
    /// The `authenticate` closure handles the platform-specific step of presenting the auth URL
    /// and returning the callback URL.
    private func performOAuthFlow(
        redirectURI: String,
        authenticate: (URL) async throws -> URL
    ) async throws -> String {
        let codeVerifier = Self.generateCodeVerifier()
        let challenge = Self.codeChallenge(for: codeVerifier)
        let authURL = buildAuthorizationURL(codeChallenge: challenge, redirectURI: redirectURI)
        let callbackURL = try await authenticate(authURL)
        let code = try Self.extractAuthCode(from: callbackURL)
        return try await exchangeCodeForIDToken(
            code: code, codeVerifier: codeVerifier, redirectURI: redirectURI)
    }

    #if os(macOS)
    /// Presents the Google Sign-In flow via loopback OAuth and returns the ID token.
    ///
    /// Google's Desktop client type requires loopback redirects (`http://127.0.0.1`).
    /// This method starts a one-shot local HTTP server, opens the auth URL in the
    /// system browser, captures the callback, and exchanges the code for an ID token.
    func signIn(in window: NSWindow) async throws -> String {
        let server = try LoopbackAuthServer()
        return try await performOAuthFlow(redirectURI: server.redirectURI) { authURL in
            NSWorkspace.shared.open(authURL)
            return try await server.waitForCallback()
        }
    }
    #endif

    /// Internal entry point that accepts a `WebAuthSessionProviding` for testability.
    func signIn(using sessionProvider: WebAuthSessionProviding) async throws -> String {
        let redirectURI = "\(credentials.callbackURLScheme):/oauth2callback"
        return try await performOAuthFlow(redirectURI: redirectURI) { authURL in
            do {
                return try await sessionProvider.authenticate(
                    url: authURL,
                    callbackURLScheme: credentials.callbackURLScheme
                )
            } catch let error as ASWebAuthenticationSessionError
                where error.code == .canceledLogin
            {
                throw AuthError.providerSignInCancelled
            }
        }
    }

    // MARK: - URL Building

    func buildAuthorizationURL(codeChallenge: String, redirectURI: String) -> URL {
        var components = URLComponents(url: Self.authorizationEndpoint, resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: credentials.clientID),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: "openid email profile"),
            URLQueryItem(name: "code_challenge", value: codeChallenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
        ]
        return components.url!
    }

    // MARK: - Callback Parsing

    /// Extracts the authorization code from Google's callback URL.
    nonisolated static func extractAuthCode(from url: URL) throws -> String {
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let items = components?.queryItems ?? []

        if let errorParam = items.first(where: { $0.name == "error" })?.value {
            throw AuthError.providerSignInFailed("Google returned error: \(errorParam)")
        }

        guard let code = items.first(where: { $0.name == "code" })?.value, !code.isEmpty else {
            throw AuthError.providerSignInFailed("Missing authorization code in callback")
        }

        return code
    }

    // MARK: - Token Exchange

    /// Exchanges the authorization code for an ID token via Google's token endpoint.
    func exchangeCodeForIDToken(
        code: String,
        codeVerifier: String,
        redirectURI: String,
        urlSession: URLSession = .shared
    ) async throws -> String {
        var request = URLRequest(url: Self.tokenEndpoint)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        // Form-encode all values using RFC 3986 unreserved characters only.
        let encode: (String) -> String = {
            $0.addingPercentEncoding(withAllowedCharacters: .urlFormValueAllowed) ?? $0
        }

        let body =
            "code=\(encode(code))"
            + "&client_id=\(encode(credentials.clientID))"
            + "&client_secret=\(encode(credentials.clientSecret))"
            + "&redirect_uri=\(encode(redirectURI))"
            + "&grant_type=authorization_code"
            + "&code_verifier=\(codeVerifier)"
        request.httpBody = body.data(using: .utf8)

        let (data, response) = try await urlSession.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
            (200...299).contains(httpResponse.statusCode)
        else {
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            let responseBody = String(data: data, encoding: .utf8) ?? "unknown"
            throw AuthError.providerSignInFailed(
                "Token exchange failed (HTTP \(statusCode)): \(responseBody)")
        }

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let idToken = json["id_token"] as? String, !idToken.isEmpty
        else {
            throw AuthError.providerSignInFailed("Missing id_token in token exchange response")
        }

        return idToken
    }
}

// MARK: - Form-encoding character set

extension CharacterSet {
    /// Characters that do NOT need percent-encoding in `application/x-www-form-urlencoded` values.
    /// Per RFC 3986 §2.3: unreserved = ALPHA / DIGIT / "-" / "." / "_" / "~".
    fileprivate static let urlFormValueAllowed = CharacterSet(charactersIn:
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
}

// MARK: - Loopback OAuth Server (macOS only)

#if os(macOS)
/// A one-shot HTTP server on 127.0.0.1 that captures a single OAuth callback.
///
/// Google's Desktop OAuth client type requires loopback redirects — custom URI
/// schemes are not permitted. This server listens on an OS-assigned port,
/// captures the authorization code from the callback, responds with a
/// "sign-in complete" page, and shuts down.
final class LoopbackAuthServer: @unchecked Sendable {

    private let serverFD: Int32
    let port: UInt16

    var redirectURI: String { "http://127.0.0.1:\(port)" }

    init() throws {
        let fd = Darwin.socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else {
            throw AuthError.providerSignInFailed("Failed to create loopback socket")
        }

        var reuseAddr: Int32 = 1
        Darwin.setsockopt(
            fd, SOL_SOCKET, SO_REUSEADDR, &reuseAddr,
            socklen_t(MemoryLayout<Int32>.size))

        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = 0
        addr.sin_addr = in_addr(s_addr: UInt32(INADDR_LOOPBACK).bigEndian)

        let bindResult = withUnsafePointer(to: &addr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockPtr in
                Darwin.bind(fd, sockPtr, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        guard bindResult == 0 else {
            Darwin.close(fd)
            throw AuthError.providerSignInFailed("Failed to bind loopback socket")
        }

        guard Darwin.listen(fd, 1) == 0 else {
            Darwin.close(fd)
            throw AuthError.providerSignInFailed("Failed to listen on loopback socket")
        }

        var boundAddr = sockaddr_in()
        var addrLen = socklen_t(MemoryLayout<sockaddr_in>.size)
        let nameResult = withUnsafeMutablePointer(to: &boundAddr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockPtr in
                Darwin.getsockname(fd, sockPtr, &addrLen)
            }
        }
        guard nameResult == 0 else {
            Darwin.close(fd)
            throw AuthError.providerSignInFailed("Failed to get loopback port")
        }

        self.serverFD = fd
        self.port = UInt16(bigEndian: boundAddr.sin_port)
    }

    /// Waits for a single HTTP request, responds with a "close window" page,
    /// and returns the request URL containing the authorization code.
    func waitForCallback() async throws -> URL {
        let fd = serverFD
        let serverPort = port

        return try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                defer { Darwin.close(fd) }

                // Wait up to 5 minutes for the browser redirect
                var pfd = pollfd(fd: fd, events: Int16(POLLIN), revents: 0)
                let ready = Darwin.poll(&pfd, 1, 300_000)
                guard ready > 0 else {
                    continuation.resume(
                        throwing: AuthError.providerSignInFailed(
                            ready == 0 ? "Sign-in timed out" : "Loopback server error"))
                    return
                }

                let clientFD = Darwin.accept(fd, nil, nil)
                guard clientFD >= 0 else {
                    continuation.resume(
                        throwing: AuthError.providerSignInFailed("Failed to accept callback"))
                    return
                }
                defer { Darwin.close(clientFD) }

                var buffer = [UInt8](repeating: 0, count: 8192)
                let bytesRead = Darwin.recv(clientFD, &buffer, buffer.count, 0)
                guard bytesRead > 0,
                    let request = String(bytes: buffer[0..<bytesRead], encoding: .utf8),
                    let firstLine = request.split(separator: "\r\n", maxSplits: 1).first
                else {
                    continuation.resume(
                        throwing: AuthError.providerSignInFailed("Failed to read callback"))
                    return
                }

                // Parse "GET /path?query HTTP/1.1"
                let parts = firstLine.split(separator: " ")
                guard parts.count >= 2 else {
                    continuation.resume(
                        throwing: AuthError.providerSignInFailed("Malformed callback request"))
                    return
                }

                let path = String(parts[1])

                // Respond with a success page
                let html =
                    "<html><body style=\"font-family:-apple-system,system-ui,sans-serif;"
                    + "text-align:center;padding:60px 20px\">"
                    + "<h2>Sign-in complete</h2>"
                    + "<p style=\"color:#666\">You can close this tab and return to "
                    + "Track\u{2019}em Toys.</p></body></html>"
                let httpResponse =
                    "HTTP/1.1 200 OK\r\n"
                    + "Content-Type: text/html; charset=utf-8\r\n"
                    + "Content-Length: \(html.utf8.count)\r\n"
                    + "Connection: close\r\n\r\n"
                    + html
                let responseBytes = Array(httpResponse.utf8)
                responseBytes.withUnsafeBufferPointer { buf in
                    _ = Darwin.send(clientFD, buf.baseAddress!, buf.count, 0)
                }

                guard let url = URL(string: "http://127.0.0.1:\(serverPort)\(path)") else {
                    continuation.resume(
                        throwing: AuthError.providerSignInFailed("Invalid callback URL"))
                    return
                }

                continuation.resume(returning: url)
            }
        }
    }
}
#endif
