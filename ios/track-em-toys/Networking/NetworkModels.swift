import Foundation

// MARK: - HTTP

nonisolated enum HTTPMethod: String, Sendable {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case patch = "PATCH"
    case delete = "DELETE"
}

nonisolated struct Endpoint: Sendable {
    let path: String
    let method: HTTPMethod
    let body: (any Encodable & Sendable)?
    let requiresAuth: Bool

    init(path: String, method: HTTPMethod = .get, body: (any Encodable & Sendable)? = nil, requiresAuth: Bool = true) {
        self.path = path
        self.method = method
        self.body = body
        self.requiresAuth = requiresAuth
    }
}

// MARK: - OAuth

nonisolated enum OAuthProvider: String, Encodable, Sendable {
    case apple
    case google
}

// MARK: - Request Bodies

nonisolated struct SigninRequestBody: Encodable, Sendable {
    let provider: String
    let idToken: String
    let nonce: String?
    let userInfo: UserInfoBody?
}

nonisolated struct UserInfoBody: Encodable, Sendable {
    let name: String?
}

nonisolated struct RefreshRequestBody: Encodable, Sendable {
    let refreshToken: String
}

nonisolated struct LogoutRequestBody: Encodable, Sendable {
    let refreshToken: String
}

// MARK: - Response Bodies

nonisolated struct AuthResponse: Decodable, Sendable {
    let accessToken: String
    let refreshToken: String
    let user: UserResponse
}

nonisolated struct TokenResponse: Decodable, Sendable {
    let accessToken: String
    let refreshToken: String
}

nonisolated struct UserResponse: Codable, Equatable, Sendable {
    let id: String
    let email: String?
    let displayName: String?
    let avatarUrl: String?
}

nonisolated struct APIErrorResponse: Decodable, Sendable {
    let error: String
}

// MARK: - Errors

nonisolated enum APIError: Error, Equatable, Sendable {
    case invalidURL
    case httpError(statusCode: Int, message: String)
    case decodingError
    case networkError(String)
    case sessionExpired
    case serverUnavailable
}

nonisolated enum KeychainError: Error, Equatable, Sendable {
    case saveFailed(OSStatus)
    case readFailed(OSStatus)
    case deleteFailed(OSStatus)
    case encodingFailed
    case decodingFailed
}

nonisolated enum AuthError: LocalizedError, Equatable, Sendable {
    case providerSignInCancelled
    case providerSignInFailed(String)
    case networkError(String)
    case serverError(Int, String)
    case sessionExpired
    case keychainError(KeychainError)

    var errorDescription: String? {
        switch self {
        case .providerSignInCancelled:
            return "Sign-in was cancelled."
        case .providerSignInFailed(let message):
            return "Sign-in failed: \(message)"
        case .networkError(let message):
            return "Network error: \(message)"
        case .serverError(let code, let message):
            return "Server error (\(code)): \(message)"
        case .sessionExpired:
            return "Your session has expired. Please sign in again."
        case .keychainError(let error):
            return "Keychain error: \(error)"
        }
    }
}

nonisolated enum GoogleSignInError: Error, Sendable {
    case missingToken
    case presentingViewControllerUnavailable
}
