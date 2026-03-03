#if os(iOS)
import Foundation
import Testing
import UIKit

@testable import track_em_toys

// MARK: - Mock Provider

private final class MockGoogleSignInProvider: GoogleSignInProviding, @unchecked Sendable {
    var idTokenToReturn: String?
    var errorToThrow: (any Error)?

    func signInForIDToken(presenting viewController: UIViewController) async throws -> String? {
        if let errorToThrow {
            throw errorToThrow
        }
        return idTokenToReturn
    }
}

// MARK: - Tests

struct GoogleSignInCoordinatorTests {

    /// Dummy view controller required by the coordinator's API (never presented in tests).
    @MainActor private static let dummyVC = UIViewController()

    // MARK: - Success

    @Test @MainActor
    func signInReturnsIDToken() async throws {
        let mock = MockGoogleSignInProvider()
        mock.idTokenToReturn = "valid-id-token"

        let coordinator = GoogleSignInCoordinator(provider: mock)
        let token = try await coordinator.signIn(presenting: Self.dummyVC)

        #expect(token == "valid-id-token")
    }

    // MARK: - Missing Token

    @Test @MainActor
    func signInThrowsMissingTokenWhenNil() async {
        let mock = MockGoogleSignInProvider()
        mock.idTokenToReturn = nil

        let coordinator = GoogleSignInCoordinator(provider: mock)

        await #expect(throws: GoogleSignInError.missingToken) {
            try await coordinator.signIn(presenting: Self.dummyVC)
        }
    }

    // MARK: - User Cancellation

    @Test @MainActor
    func signInThrowsCancelledOnUserDismiss() async {
        let mock = MockGoogleSignInProvider()
        mock.errorToThrow = AuthError.providerSignInCancelled

        let coordinator = GoogleSignInCoordinator(provider: mock)

        await #expect(throws: AuthError.providerSignInCancelled) {
            try await coordinator.signIn(presenting: Self.dummyVC)
        }
    }

    // MARK: - Other Errors Propagate

    @Test @MainActor
    func signInPropagatesOtherErrors() async {
        let mock = MockGoogleSignInProvider()
        let underlyingError = NSError(domain: "TestDomain", code: 42)
        mock.errorToThrow = underlyingError

        let coordinator = GoogleSignInCoordinator(provider: mock)

        await #expect(throws: (any Error).self) {
            try await coordinator.signIn(presenting: Self.dummyVC)
        }
    }
}
#endif
