import Foundation
import Security

nonisolated enum KeychainService {
    private static let refreshTokenKey = "com.trackem.toys.refreshToken"
    private static let userProfileKey = "com.trackem.toys.userProfile"
    private static let appleDisplayNameKey = "com.trackem.toys.appleDisplayName"

    // MARK: - Refresh Token

    static func saveRefreshToken(_ token: String) throws {
        guard let data = token.data(using: .utf8) else {
            throw KeychainError.encodingFailed
        }
        try save(data: data, forKey: refreshTokenKey, accessibility: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly)
    }

    static func readRefreshToken() throws -> String? {
        guard let data = try read(forKey: refreshTokenKey) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func deleteRefreshToken() throws {
        try delete(forKey: refreshTokenKey)
    }

    // MARK: - User Profile

    static func saveUserProfile(_ user: UserResponse) throws {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        guard let data = try? encoder.encode(user) else {
            throw KeychainError.encodingFailed
        }
        try save(data: data, forKey: userProfileKey, accessibility: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly)
    }

    static func readUserProfile() -> UserResponse? {
        guard let data = try? read(forKey: userProfileKey) else { return nil }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try? decoder.decode(UserResponse.self, from: data)
    }

    static func deleteUserProfile() {
        try? delete(forKey: userProfileKey)
    }

    // MARK: - Apple Display Name

    static func saveAppleDisplayName(_ name: String) throws {
        guard let data = name.data(using: .utf8) else {
            throw KeychainError.encodingFailed
        }
        try save(data: data, forKey: appleDisplayNameKey, accessibility: kSecAttrAccessibleWhenUnlocked)
    }

    static func readAppleDisplayName() -> String? {
        guard let data = try? read(forKey: appleDisplayNameKey) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func deleteAppleDisplayName() {
        try? delete(forKey: appleDisplayNameKey)
    }

    // MARK: - Clear All

    static func clearAll() {
        try? deleteRefreshToken()
        deleteUserProfile()
        deleteAppleDisplayName()
    }

    // MARK: - Generic Keychain Operations

    private static func save(data: Data, forKey key: String, accessibility: CFString) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrSynchronizable as String: kCFBooleanFalse!,
        ]

        // Delete existing item first
        SecItemDelete(query as CFDictionary)

        var addQuery = query
        addQuery[kSecValueData as String] = data
        addQuery[kSecAttrAccessible as String] = accessibility

        let status = SecItemAdd(addQuery as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.saveFailed(status)
        }
    }

    private static func read(forKey key: String) throws -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrSynchronizable as String: kCFBooleanFalse!,
            kSecReturnData as String: kCFBooleanTrue!,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        if status == errSecItemNotFound {
            return nil
        }

        guard status == errSecSuccess else {
            throw KeychainError.readFailed(status)
        }

        return result as? Data
    }

    private static func delete(forKey key: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrSynchronizable as String: kCFBooleanFalse!,
        ]

        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.deleteFailed(status)
        }
    }
}
