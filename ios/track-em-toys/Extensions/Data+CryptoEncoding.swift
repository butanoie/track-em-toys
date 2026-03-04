import Foundation
import Security

extension Data {

    // MARK: - Base64url Encoding (RFC 4648 §5)

    /// Base64url-encodes data (no padding), per RFC 4648 §5.
    /// Single-pass character mapping avoids intermediate string allocations.
    nonisolated func base64URLEncodedString() -> String {
        let base64 = self.base64EncodedString()
        var result = ""
        result.reserveCapacity(base64.count)
        for ch in base64 {
            switch ch {
            case "+": result.append("-")
            case "/": result.append("_")
            case "=": break
            default: result.append(ch)
            }
        }
        return result
    }

    /// Decodes a base64url-encoded string (no padding required).
    nonisolated init?(base64URLEncoded string: String) {
        var base64 = string
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")

        // Pad to multiple of 4
        let remainder = base64.count % 4
        if remainder > 0 {
            base64.append(contentsOf: String(repeating: "=", count: 4 - remainder))
        }

        guard let data = Data(base64Encoded: base64) else { return nil }
        self = data
    }

    // MARK: - Cryptographic Random Bytes

    /// Generates `count` cryptographically secure random bytes using `SecRandomCopyBytes`.
    nonisolated static func cryptoRandom(count: Int) -> Data {
        var bytes = [UInt8](repeating: 0, count: count)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        precondition(status == errSecSuccess, "SecRandomCopyBytes failed with status \(status)")
        return Data(bytes)
    }
}
