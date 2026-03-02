import SwiftUI

@main
struct TrackEmToysApp: App {
    @State private var authManager = AuthManager()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            Group {
                if authManager.isLoading {
                    ProgressView("Loading...")
                } else if authManager.isAuthenticated {
                    MainTabView()
                        .environment(authManager)
                } else {
                    AuthView()
                        .environment(authManager)
                }
            }
            .task {
                await authManager.initialize()
            }
            .onChange(of: scenePhase) { _, newPhase in
                if newPhase == .active {
                    Task {
                        await authManager.onForeground()
                    }
                }
            }
        }
    }
}

/// Placeholder for the authenticated main content.
struct MainTabView: View {
    @Environment(AuthManager.self) private var authManager

    var body: some View {
        TabView {
            Tab("Collection", systemImage: "cube.box.fill") {
                NavigationStack {
                    Text("My Collection")
                        .navigationTitle("Collection")
                        .toolbar {
                            ToolbarItem(placement: .automatic) {
                                Button("Sign Out", systemImage: "rectangle.portrait.and.arrow.right") {
                                    Task { await authManager.signOut() }
                                }
                            }
                        }
                }
            }
        }
    }
}

#Preview("Authenticated") {
    MainTabView()
        .environment(AuthManager())
}
