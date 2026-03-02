import CryptoKit
import Foundation
import Testing

@testable import track_em_toys

struct AppleSignInCoordinatorTests {

    // MARK: - Nonce Generation

    @Test func generateNonceReturns64HexChars() {
        let (raw, _) = AppleSignInCoordinator.generateNonce()
        #expect(raw.count == 64, "Raw nonce should be 64 hex characters (32 bytes)")
    }

    @Test func generateNonceHashMatchesSHA256() {
        let (raw, hashed) = AppleSignInCoordinator.generateNonce()

        // Manually hash the raw nonce to verify
        let data = Data(raw.utf8)
        let digest = SHA256.hash(data: data)
        let expectedHash = digest.compactMap { String(format: "%02x", $0) }.joined()

        #expect(hashed == expectedHash)
    }

    @Test func generateNonceIsHexOnly() {
        let (raw, hashed) = AppleSignInCoordinator.generateNonce()
        let hexCharset = CharacterSet(charactersIn: "0123456789abcdef")

        #expect(
            raw.unicodeScalars.allSatisfy { hexCharset.contains($0) },
            "Raw nonce should only contain hex characters"
        )
        #expect(
            hashed.unicodeScalars.allSatisfy { hexCharset.contains($0) },
            "Hashed nonce should only contain hex characters"
        )
    }

    @Test func generateNonceIsUnique() {
        let (raw1, _) = AppleSignInCoordinator.generateNonce()
        let (raw2, _) = AppleSignInCoordinator.generateNonce()
        #expect(raw1 != raw2, "Two consecutive nonces should differ")
    }

    @Test func hashedNonceIs64Chars() {
        let (_, hashed) = AppleSignInCoordinator.generateNonce()
        #expect(hashed.count == 64, "SHA-256 hex digest should be 64 characters")
    }

    // MARK: - randomHexString

    @Test func randomHexStringLength() {
        let hex = AppleSignInCoordinator.randomHexString(byteCount: 16)
        #expect(hex.count == 32, "16 bytes → 32 hex characters")
    }

    @Test func randomHexStringWithZeroBytes() {
        let hex = AppleSignInCoordinator.randomHexString(byteCount: 0)
        #expect(hex.isEmpty)
    }

    // MARK: - sha256Hex

    @Test func sha256HexKnownVector() {
        // SHA-256 of empty string is well-known
        let hash = AppleSignInCoordinator.sha256Hex("")
        #expect(hash == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
    }

    @Test func sha256HexOfHello() {
        let hash = AppleSignInCoordinator.sha256Hex("hello")
        #expect(hash == "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824")
    }
}
