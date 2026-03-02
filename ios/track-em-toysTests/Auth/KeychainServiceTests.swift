import Foundation
import Testing

@testable import track_em_toys

struct KeychainServiceTests {

    // Clean up before each test to avoid cross-contamination
    init() {
        KeychainService.clearAll()
    }

    // MARK: - Refresh Token

    @Test func saveAndReadRefreshToken() throws {
        try KeychainService.saveRefreshToken("rt_test_token_123")
        let token = try KeychainService.readRefreshToken()
        #expect(token == "rt_test_token_123")
    }

    @Test func readRefreshTokenWhenNoneExists() throws {
        let token = try KeychainService.readRefreshToken()
        #expect(token == nil)
    }

    @Test func deleteRefreshToken() throws {
        try KeychainService.saveRefreshToken("rt_to_delete")
        try KeychainService.deleteRefreshToken()
        let token = try KeychainService.readRefreshToken()
        #expect(token == nil)
    }

    @Test func saveRefreshTokenOverwritesExisting() throws {
        try KeychainService.saveRefreshToken("rt_original")
        try KeychainService.saveRefreshToken("rt_updated")
        let token = try KeychainService.readRefreshToken()
        #expect(token == "rt_updated")
    }

    @Test func deleteRefreshTokenWhenNoneExists() throws {
        // Should not throw
        try KeychainService.deleteRefreshToken()
    }

    // MARK: - User Profile

    @Test func saveAndReadUserProfile() throws {
        let user = UserResponse(
            id: "user-123",
            email: "test@example.com",
            displayName: "Test User",
            avatarUrl: "https://example.com/avatar.jpg"
        )
        try KeychainService.saveUserProfile(user)
        let restored = KeychainService.readUserProfile()
        #expect(restored == user)
    }

    @Test func readUserProfileWhenNoneExists() {
        let profile = KeychainService.readUserProfile()
        #expect(profile == nil)
    }

    @Test func deleteUserProfile() throws {
        let user = UserResponse(id: "user-456", email: nil, displayName: nil, avatarUrl: nil)
        try KeychainService.saveUserProfile(user)
        KeychainService.deleteUserProfile()
        let profile = KeychainService.readUserProfile()
        #expect(profile == nil)
    }

    @Test func userProfileWithNullableFields() throws {
        let user = UserResponse(id: "user-789", email: nil, displayName: nil, avatarUrl: nil)
        try KeychainService.saveUserProfile(user)
        let restored = KeychainService.readUserProfile()
        #expect(restored == user)
        #expect(restored?.email == nil)
        #expect(restored?.displayName == nil)
        #expect(restored?.avatarUrl == nil)
    }

    // MARK: - Apple Display Name

    @Test func saveAndReadAppleDisplayName() throws {
        try KeychainService.saveAppleDisplayName("Jane Doe")
        let name = KeychainService.readAppleDisplayName()
        #expect(name == "Jane Doe")
    }

    @Test func readAppleDisplayNameWhenNoneExists() {
        let name = KeychainService.readAppleDisplayName()
        #expect(name == nil)
    }

    @Test func deleteAppleDisplayName() throws {
        try KeychainService.saveAppleDisplayName("To Delete")
        KeychainService.deleteAppleDisplayName()
        let name = KeychainService.readAppleDisplayName()
        #expect(name == nil)
    }

    // MARK: - Clear All

    @Test func clearAllDeletesEverything() throws {
        try KeychainService.saveRefreshToken("rt_clear")
        try KeychainService.saveUserProfile(
            UserResponse(id: "clear-user", email: "e", displayName: "d", avatarUrl: nil)
        )
        try KeychainService.saveAppleDisplayName("Clear Name")

        KeychainService.clearAll()

        #expect(try KeychainService.readRefreshToken() == nil)
        #expect(KeychainService.readUserProfile() == nil)
        #expect(KeychainService.readAppleDisplayName() == nil)
    }
}
