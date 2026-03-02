#if os(iOS)
import GoogleSignIn
import UIKit

final class GoogleSignInCoordinator: Sendable {

    /// Presents the Google Sign-In flow and returns the ID token string.
    func signIn(presenting viewController: UIViewController) async throws -> String {
        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: viewController)

        guard let idToken = result.user.idToken?.tokenString else {
            throw GoogleSignInError.missingToken
        }

        return idToken
    }
}
#endif
