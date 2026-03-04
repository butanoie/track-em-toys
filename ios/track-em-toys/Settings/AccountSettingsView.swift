import AuthenticationServices
import SwiftUI

struct AccountSettingsView: View {
    @Environment(AuthManager.self) private var authManager

    @State private var meResponse: MeResponse?
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showError = false
    @State private var isLinking = false

    private let appleCoordinator = AppleSignInCoordinator()
    #if os(iOS)
    private let googleCoordinator = GoogleSignInCoordinator()
    #elseif os(macOS)
    private let googleCoordinator = GoogleSignInMacCoordinator()
    #endif

    private var linkedProviders: Set<String> {
        Set(meResponse?.linkedAccounts.map(\.provider) ?? [])
    }

    var body: some View {
        List {
            // Profile section
            Section("Profile") {
                LabeledContent("Name", value: authManager.currentUser?.displayName ?? "—")
                LabeledContent("Email", value: authManager.currentUser?.email ?? "—")
            }

            // Linked accounts section
            Section {
                if isLoading {
                    ProgressView("Loading accounts...")
                } else if let accounts = meResponse?.linkedAccounts {
                    ForEach(accounts, id: \.provider) { account in
                        HStack {
                            Label(
                                providerLabel(account.provider),
                                systemImage: providerIcon(account.provider)
                            )
                            Spacer()
                            if let email = account.email {
                                Text(email)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Text("Linked")
                                .font(.caption2)
                                .fontWeight(.semibold)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(.secondary.opacity(0.15))
                                .clipShape(Capsule())
                        }
                    }

                    // Link buttons for unlinked providers
                    if !linkedProviders.contains("apple") {
                        Button {
                            Task { await handleLinkApple() }
                        } label: {
                            Label("Link Apple Account", systemImage: "apple.logo")
                        }
                        .disabled(isLinking)
                    }

                    if !linkedProviders.contains("google") {
                        Button {
                            Task { await handleLinkGoogle() }
                        } label: {
                            Label("Link Google Account", systemImage: "g.circle.fill")
                        }
                        .disabled(isLinking)
                    }

                    if linkedProviders.contains("apple") && linkedProviders.contains("google") {
                        Text("All providers are linked.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            } header: {
                Text("Linked Accounts")
            } footer: {
                Text("Connect multiple sign-in providers so you can use either to access your account.")
            }

            // Sign out section
            Section {
                Button(role: .destructive) {
                    Task { await authManager.signOut() }
                } label: {
                    Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                }
            }
        }
        .navigationTitle("Account")
        .task {
            await loadMe()
        }
        .alert("Account Linking Error", isPresented: $showError) {
            Button("OK", role: .cancel) {}
        } message: {
            if let errorMessage {
                Text(errorMessage)
            }
        }
    }

    // MARK: - Data Loading

    private func loadMe() async {
        isLoading = true
        defer { isLoading = false }

        do {
            meResponse = try await authManager.fetchMe()
        } catch {
            errorMessage = "Failed to load account info."
            showError = true
        }
    }

    // MARK: - Link Handlers

    @MainActor
    private func handleLinkApple() async {
        isLinking = true
        defer { isLinking = false }

        do {
            guard let window = platformKeyWindow else {
                showLinkError("Unable to find the app window.")
                return
            }
            let result = try await appleCoordinator.performSignIn(in: window)
            meResponse = try await authManager.linkAppleAccount(result)
        } catch let error as AuthError where error == .providerSignInCancelled {
            // User cancelled — don't show an error
        } catch {
            showLinkError(linkErrorMessage(error))
        }
    }

    @MainActor
    private func handleLinkGoogle() async {
        isLinking = true
        defer { isLinking = false }

        do {
            #if os(iOS)
            guard let rootVC = platformKeyWindow?.rootViewController else {
                showLinkError("Unable to find the root view controller.")
                return
            }
            let idToken = try await googleCoordinator.signIn(presenting: rootVC)
            #elseif os(macOS)
            guard let window = platformKeyWindow else {
                showLinkError("Unable to find the app window.")
                return
            }
            let idToken = try await googleCoordinator.signIn(in: window)
            #endif
            meResponse = try await authManager.linkGoogleAccount(idToken)
        } catch let error as AuthError where error == .providerSignInCancelled {
            // User cancelled — don't show an error
        } catch {
            showLinkError(linkErrorMessage(error))
        }
    }

    private func showLinkError(_ message: String) {
        errorMessage = message
        showError = true
    }

    /// Extracts a user-facing message from a link error. For 409 conflicts, uses the server message.
    private func linkErrorMessage(_ error: any Error) -> String {
        if case .httpError(409, let message) = error as? APIError {
            return message
        }
        return error.localizedDescription
    }

    // MARK: - Helpers

    private func providerLabel(_ provider: String) -> String {
        provider == "google" ? "Google" : "Apple"
    }

    private func providerIcon(_ provider: String) -> String {
        provider == "google" ? "g.circle.fill" : "apple.logo"
    }

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
    NavigationStack {
        AccountSettingsView()
            .environment(AuthManager())
    }
}
