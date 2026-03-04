import AuthenticationServices
import SwiftUI

struct AuthView: View {
    @Environment(AuthManager.self) private var authManager

    @State private var errorMessage: String?
    @State private var showError = false
    @State private var isSigningIn = false

    private let appleCoordinator = AppleSignInCoordinator()
    #if os(iOS)
    private let googleCoordinator = GoogleSignInCoordinator()
    #elseif os(macOS)
    private let googleCoordinator = GoogleSignInMacCoordinator()
    #endif

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            // App branding
            VStack(spacing: 12) {
                Image(systemName: "cube.box.fill")
                    .font(.system(size: 72))
                    .foregroundStyle(.tint)

                Text("Track'em Toys")
                    .font(.largeTitle)
                    .fontWeight(.bold)

                Text("Your toy collection, cataloged & priced")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            // Sign-in buttons
            VStack(spacing: 16) {
                // Apple Sign-In — works on both iOS and macOS
                SignInWithAppleButton(.signIn) { request in
                    request.requestedScopes = [.fullName, .email]
                } onCompletion: { result in
                    // We use the coordinator for full nonce control;
                    // this button is here only for Apple HIG compliance on macOS
                }
                .signInWithAppleButtonStyle(.black)
                .frame(height: 50)
                .hidden()

                Button {
                    Task { await handleAppleSignIn() }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "apple.logo")
                            .font(.title3)
                        Text("Sign in with Apple")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(.black)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }

                // Google Sign-In — iOS uses native SDK, macOS uses ASWebAuthenticationSession
                Button {
                    Task { await handleGoogleSignIn() }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "g.circle.fill")
                            .font(.title3)
                        Text("Sign in with Google")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(.white)
                    .foregroundStyle(.black)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.gray.opacity(0.3), lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
            .disabled(isSigningIn)
            .opacity(isSigningIn ? 0.6 : 1.0)
            .padding(.horizontal, 24)

            if isSigningIn {
                ProgressView("Signing in...")
                    .padding(.top, 8)
            }

            Spacer()
                .frame(height: 48)
        }
        .padding()
        .alert("Sign-In Error", isPresented: $showError) {
            Button("OK", role: .cancel) {}
        } message: {
            if let errorMessage {
                Text(errorMessage)
            }
        }
    }

    // MARK: - Sign-In Handlers

    /// Wraps a provider sign-in action with loading state, cancellation handling, and error display.
    @MainActor
    private func performSignIn(_ action: @MainActor () async throws -> Void) async {
        isSigningIn = true
        defer { isSigningIn = false }

        do {
            try await action()
        } catch let error as AuthError where error == .providerSignInCancelled {
            // User cancelled — don't show an error
        } catch {
            showSignInError(error.localizedDescription)
        }
    }

    @MainActor
    private func handleAppleSignIn() async {
        await performSignIn {
            guard let window = platformKeyWindow else {
                showSignInError("Unable to find the app window.")
                return
            }
            let result = try await appleCoordinator.performSignIn(in: window)
            try await authManager.signInWithApple(result)
        }
    }

    @MainActor
    private func handleGoogleSignIn() async {
        await performSignIn {
            #if os(iOS)
            guard let rootVC = platformKeyWindow?.rootViewController else {
                showSignInError("Unable to find the root view controller.")
                return
            }
            let idToken = try await googleCoordinator.signIn(presenting: rootVC)
            #elseif os(macOS)
            guard let window = platformKeyWindow else {
                showSignInError("Unable to find the app window.")
                return
            }
            let idToken = try await googleCoordinator.signIn(in: window)
            #endif
            try await authManager.signInWithGoogle(idToken)
        }
    }

    private func showSignInError(_ message: String) {
        errorMessage = message
        showError = true
    }

    // MARK: - Platform Window Access

    /// Returns the key window for the current platform.
    @MainActor
    private var platformKeyWindow: ASPresentationAnchor? {
        #if os(iOS)
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)
        #elseif os(macOS)
        NSApplication.shared.keyWindow
        #endif
    }
}

#Preview {
    AuthView()
        .environment(AuthManager())
}
