#if os(iOS)
import GoogleSignIn
import UIKit

/// Abstracts the Google Sign-In SDK for testability.
/// Returns the raw ID token string, or nil when the sign-in succeeds but no token is available.
/// Throws `AuthError.providerSignInCancelled` when the user dismisses the sign-in sheet.
protocol GoogleSignInProviding: Sendable {
    func signInForIDToken(presenting viewController: UIViewController) async throws -> String?
}

extension GIDSignIn: GoogleSignInProviding {
    func signInForIDToken(presenting viewController: UIViewController) async throws -> String? {
        let result: GIDSignInResult
        do {
            result = try await signIn(withPresenting: viewController)
        } catch let error as GIDSignInError where error.code == .canceled {
            throw AuthError.providerSignInCancelled
        }
        return result.user.idToken?.tokenString
    }
}

final class GoogleSignInCoordinator: Sendable {

    private let provider: GoogleSignInProviding

    init(provider: GoogleSignInProviding = GIDSignIn.sharedInstance) {
        self.provider = provider
    }

    /// Presents the Google Sign-In flow and returns the ID token string.
    func signIn(presenting viewController: UIViewController) async throws -> String {
        let idToken = try await provider.signInForIDToken(presenting: viewController)

        guard let idToken else {
            throw GoogleSignInError.missingToken
        }

        return idToken
    }
}
#endif
