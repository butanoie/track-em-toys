import AuthenticationServices
import CryptoKit
import Foundation

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

struct AppleSignInResult: Sendable {
    let idToken: String
    let rawNonce: String
    let fullName: PersonNameComponents?
    let email: String?
}

final class AppleSignInCoordinator: NSObject, ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding, @unchecked Sendable
{
    private var continuation: CheckedContinuation<AppleSignInResult, any Error>?
    private var currentNonce: String?
    private var presentationWindow: ASPresentationAnchor?

    func performSignIn(in window: ASPresentationAnchor) async throws -> AppleSignInResult {
        let (rawNonce, hashedNonce) = Self.generateNonce()
        currentNonce = rawNonce
        presentationWindow = window

        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = hashedNonce

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self

        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            controller.performRequests()
        }
    }

    // MARK: - ASAuthorizationControllerDelegate

    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let idToken = String(data: tokenData, encoding: .utf8),
              let rawNonce = currentNonce
        else {
            continuation?.resume(throwing: AuthError.providerSignInFailed("Missing Apple ID credential or token"))
            continuation = nil
            return
        }

        // Save display name to Keychain BEFORE the API call — Apple only provides it once
        if let fullName = credential.fullName {
            let formatter = PersonNameComponentsFormatter()
            let displayName = formatter.string(from: fullName).trimmingCharacters(in: .whitespaces)
            if !displayName.isEmpty {
                try? KeychainService.saveAppleDisplayName(displayName)
            }
        }

        let result = AppleSignInResult(
            idToken: idToken,
            rawNonce: rawNonce,
            fullName: credential.fullName,
            email: credential.email
        )

        continuation?.resume(returning: result)
        continuation = nil
    }

    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: any Error
    ) {
        let asError = error as? ASAuthorizationError
        if asError?.code == .canceled {
            continuation?.resume(throwing: AuthError.providerSignInCancelled)
        } else {
            continuation?.resume(throwing: AuthError.providerSignInFailed(error.localizedDescription))
        }
        continuation = nil
    }

    // MARK: - ASAuthorizationControllerPresentationContextProviding

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        if let window = presentationWindow { return window }
        #if os(iOS)
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first else {
            preconditionFailure("No active UIWindowScene available for Apple Sign-In presentation")
        }
        return UIWindow(windowScene: scene)
        #elseif os(macOS)
        guard let window = NSApplication.shared.keyWindow else {
            preconditionFailure("No active NSWindow available for Apple Sign-In presentation")
        }
        return window
        #endif
    }

    // MARK: - Nonce Generation

    /// Generates a cryptographically random nonce pair.
    /// Returns (rawNonce: 64 hex chars, hashedNonce: SHA-256 hex of rawNonce).
    nonisolated static func generateNonce() -> (raw: String, hashed: String) {
        let rawNonce = randomHexString(byteCount: 32)
        let hashedNonce = sha256Hex(rawNonce)
        return (rawNonce, hashedNonce)
    }

    /// Generates a hex-encoded string from `byteCount` random bytes.
    nonisolated static func randomHexString(byteCount: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: byteCount)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        precondition(status == errSecSuccess, "SecRandomCopyBytes failed with status \(status)")
        return bytes.map { String(format: "%02x", $0) }.joined()
    }

    /// Returns the lowercase hex-encoded SHA-256 hash of the input string.
    nonisolated static func sha256Hex(_ input: String) -> String {
        let data = Data(input.utf8)
        let hash = SHA256.hash(data: data)
        return hash.compactMap { String(format: "%02x", $0) }.joined()
    }
}
