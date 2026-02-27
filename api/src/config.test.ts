import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Minimal valid environment used as the base for all config tests.
// Tests override individual variables via vi.stubEnv before re-importing.
const BASE_ENV: Record<string, string> = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/test',
  JWT_PRIVATE_KEY: '-----BEGIN EC PRIVATE KEY-----\ntest\n-----END EC PRIVATE KEY-----',
  JWT_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----',
  JWT_KEY_ID: 'test-key-id',
  COOKIE_SECRET: 'a'.repeat(32), // exactly 32 characters — minimum valid length
  APPLE_TEAM_ID: 'ABCDE12345',
  APPLE_KEY_ID: 'FGHIJ67890',
  APPLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
  APPLE_BUNDLE_ID: 'com.example.trackemtoys',
  APPLE_SERVICES_ID: 'com.example.trackemtoys.web',
  GOOGLE_WEB_CLIENT_ID: 'test-web.apps.googleusercontent.com',
  GOOGLE_IOS_CLIENT_ID: 'test-ios.apps.googleusercontent.com',
}

describe('config', () => {
  beforeEach(() => {
    // Isolate env for each test — stub all base vars so the module can be
    // re-imported cleanly via vi.importFresh without hitting missing-var errors.
    for (const [key, value] of Object.entries(BASE_ENV)) {
      vi.stubEnv(key, value)
    }
    // Ensure optional vars that could bleed from a real .env are cleared
    vi.stubEnv('CORS_ORIGIN', 'http://localhost:5173')
    vi.stubEnv('SECURE_COOKIES', 'false')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  describe('requiredMinLength — COOKIE_SECRET', () => {
    it('accepts a COOKIE_SECRET of exactly 32 characters', async () => {
      vi.stubEnv('COOKIE_SECRET', 'a'.repeat(32))
      const { config } = await import('./config.js')
      expect(config.cookieSecret).toBe('a'.repeat(32))
    })

    it('accepts a COOKIE_SECRET longer than 32 characters', async () => {
      vi.stubEnv('COOKIE_SECRET', 'x'.repeat(64))
      const { config } = await import('./config.js')
      expect(config.cookieSecret).toBe('x'.repeat(64))
    })

    it('throws when COOKIE_SECRET is shorter than 32 characters', async () => {
      vi.stubEnv('COOKIE_SECRET', 'short')
      await expect(import('./config.js')).rejects.toThrow(
        'Environment variable COOKIE_SECRET must be at least 32 characters',
      )
    })

    it('throws when COOKIE_SECRET is exactly 31 characters', async () => {
      vi.stubEnv('COOKIE_SECRET', 'a'.repeat(31))
      await expect(import('./config.js')).rejects.toThrow(
        'Environment variable COOKIE_SECRET must be at least 32 characters',
      )
    })

    it('throws when COOKIE_SECRET is an empty string (treated as missing)', async () => {
      vi.stubEnv('COOKIE_SECRET', '')
      // Empty string is caught by the required() guard before the length check
      await expect(import('./config.js')).rejects.toThrow('Missing required environment variable: COOKIE_SECRET')
    })
  })

  describe('required — missing variables', () => {
    it('throws when DATABASE_URL is missing', async () => {
      vi.stubEnv('DATABASE_URL', '')
      await expect(import('./config.js')).rejects.toThrow('Missing required environment variable: DATABASE_URL')
    })
  })

  describe('CORS_ORIGIN wildcard guard', () => {
    it('throws when CORS_ORIGIN is set to *', async () => {
      vi.stubEnv('CORS_ORIGIN', '*')
      await expect(import('./config.js')).rejects.toThrow(
        'CORS_ORIGIN=* is not permitted when credentials are enabled',
      )
    })
  })

  describe('requiredPem — newline replacement', () => {
    it('replaces literal \\n sequences in JWT_PRIVATE_KEY with real newlines', async () => {
      // Simulate how the PEM is stored in environment variables: with literal \n
      const pemWithLiteralNewlines =
        '-----BEGIN EC PRIVATE KEY-----\\nABCDEFG\\n-----END EC PRIVATE KEY-----'
      vi.stubEnv('JWT_PRIVATE_KEY', pemWithLiteralNewlines)
      const { config } = await import('./config.js')
      // The loaded value should have real newline characters, not literal \n
      expect(config.jwt.privateKey).toContain('\n')
      expect(config.jwt.privateKey).not.toContain('\\n')
      expect(config.jwt.privateKey).toBe(
        '-----BEGIN EC PRIVATE KEY-----\nABCDEFG\n-----END EC PRIVATE KEY-----',
      )
    })

    it('leaves PEMs that already contain real newlines unchanged', async () => {
      const pemWithRealNewlines =
        '-----BEGIN EC PRIVATE KEY-----\nABCDEFG\n-----END EC PRIVATE KEY-----'
      vi.stubEnv('JWT_PRIVATE_KEY', pemWithRealNewlines)
      const { config } = await import('./config.js')
      expect(config.jwt.privateKey).toBe(pemWithRealNewlines)
    })
  })

  describe('optionalBool', () => {
    it("returns true when SECURE_COOKIES is 'true'", async () => {
      vi.stubEnv('SECURE_COOKIES', 'true')
      const { config } = await import('./config.js')
      expect(config.secureCookies).toBe(true)
    })

    it("returns false when SECURE_COOKIES is 'false'", async () => {
      vi.stubEnv('SECURE_COOKIES', 'false')
      const { config } = await import('./config.js')
      expect(config.secureCookies).toBe(false)
    })

    it('returns the default value when SECURE_COOKIES is not set', async () => {
      // NODE_ENV is not 'production' so the default is false
      vi.stubEnv('SECURE_COOKIES', '')
      vi.stubEnv('NODE_ENV', 'development')
      const { config } = await import('./config.js')
      expect(config.secureCookies).toBe(false)
    })

    it("returns false for unrecognised SECURE_COOKIES values (not 'true')", async () => {
      vi.stubEnv('SECURE_COOKIES', 'yes')
      const { config } = await import('./config.js')
      expect(config.secureCookies).toBe(false)
    })
  })

  describe('nodeEnv', () => {
    it("defaults to 'development' when NODE_ENV is not set", async () => {
      vi.stubEnv('NODE_ENV', '')
      const { config } = await import('./config.js')
      expect(config.nodeEnv).toBe('development')
    })

    it('reflects the NODE_ENV value when set', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      const { config } = await import('./config.js')
      expect(config.nodeEnv).toBe('production')
    })

    it("accepts 'test' as a valid NODE_ENV", async () => {
      vi.stubEnv('NODE_ENV', 'test')
      const { config } = await import('./config.js')
      expect(config.nodeEnv).toBe('test')
    })

    it("accepts 'staging' as a valid NODE_ENV", async () => {
      vi.stubEnv('NODE_ENV', 'staging')
      const { config } = await import('./config.js')
      expect(config.nodeEnv).toBe('staging')
    })

    it('throws when NODE_ENV is an invalid value', async () => {
      vi.stubEnv('NODE_ENV', 'invalid')
      await expect(import('./config.js')).rejects.toThrow(
        'Invalid NODE_ENV: "invalid". Must be one of: development, test, staging, production',
      )
    })
  })

  // [T6] PORT parsing edge cases
  describe('PORT parsing', () => {
    it('defaults port to 3000 when PORT is not set', async () => {
      vi.stubEnv('PORT', '')
      const { config } = await import('./config.js')
      expect(config.port).toBe(3000)
    })

    it('throws when PORT=abc is not a valid port number', async () => {
      vi.stubEnv('PORT', 'abc')
      await expect(import('./config.js')).rejects.toThrow(
        'PORT must be a number between 1 and 65535, got: abc',
      )
    })

    it('throws when PORT=0 is out of range', async () => {
      vi.stubEnv('PORT', '0')
      await expect(import('./config.js')).rejects.toThrow(
        'PORT must be a number between 1 and 65535, got: 0',
      )
    })

    it('throws when PORT=65536 exceeds max', async () => {
      vi.stubEnv('PORT', '65536')
      await expect(import('./config.js')).rejects.toThrow(
        'PORT must be a number between 1 and 65535, got: 65536',
      )
    })

    it('accepts PORT=8080 as a valid port number', async () => {
      vi.stubEnv('PORT', '8080')
      const { config } = await import('./config.js')
      expect(config.port).toBe(8080)
    })
  })

  // [TCOV-4] TRUST_PROXY parsing via optionalBool
  describe('TRUST_PROXY parsing', () => {
    it("returns true when TRUST_PROXY is 'true'", async () => {
      vi.stubEnv('TRUST_PROXY', 'true')
      const { config } = await import('./config.js')
      expect(config.trustProxy).toBe(true)
    })

    it("returns false when TRUST_PROXY is 'false'", async () => {
      vi.stubEnv('TRUST_PROXY', 'false')
      const { config } = await import('./config.js')
      expect(config.trustProxy).toBe(false)
    })

    it('defaults to false when TRUST_PROXY is not set', async () => {
      vi.stubEnv('TRUST_PROXY', '')
      const { config } = await import('./config.js')
      expect(config.trustProxy).toBe(false)
    })
  })

  // [T-POOLMAX] DB_POOL_MAX parsing
  describe('DB_POOL_MAX parsing', () => {
    it('defaults poolMax to 20 when DB_POOL_MAX is not set', async () => {
      vi.stubEnv('DB_POOL_MAX', '')
      const { config } = await import('./config.js')
      expect(config.database.poolMax).toBe(20)
    })

    it('parses a valid DB_POOL_MAX value', async () => {
      vi.stubEnv('DB_POOL_MAX', '50')
      const { config } = await import('./config.js')
      expect(config.database.poolMax).toBe(50)
    })

    it('throws when DB_POOL_MAX is not a number', async () => {
      vi.stubEnv('DB_POOL_MAX', 'abc')
      await expect(import('./config.js')).rejects.toThrow(
        'DB_POOL_MAX must be a number between 1 and 1000, got: abc',
      )
    })

    it('throws when DB_POOL_MAX is 0 (below minimum)', async () => {
      vi.stubEnv('DB_POOL_MAX', '0')
      await expect(import('./config.js')).rejects.toThrow(
        'DB_POOL_MAX must be a number between 1 and 1000, got: 0',
      )
    })

    it('throws when DB_POOL_MAX is 1001 (above maximum)', async () => {
      vi.stubEnv('DB_POOL_MAX', '1001')
      await expect(import('./config.js')).rejects.toThrow(
        'DB_POOL_MAX must be a number between 1 and 1000, got: 1001',
      )
    })

    it('accepts DB_POOL_MAX=1 (minimum valid value)', async () => {
      vi.stubEnv('DB_POOL_MAX', '1')
      const { config } = await import('./config.js')
      expect(config.database.poolMax).toBe(1)
    })

    it('accepts DB_POOL_MAX=1000 (maximum valid value)', async () => {
      vi.stubEnv('DB_POOL_MAX', '1000')
      const { config } = await import('./config.js')
      expect(config.database.poolMax).toBe(1000)
    })
  })

  describe('Apple Sign-In required variables', () => {
    it.each([
      'APPLE_TEAM_ID',
      'APPLE_KEY_ID',
      'APPLE_PRIVATE_KEY',
      'APPLE_BUNDLE_ID',
      'APPLE_SERVICES_ID',
    ])('throws when %s is missing', async (varName) => {
      vi.stubEnv(varName, '')
      await expect(import('./config.js')).rejects.toThrow(
        `Missing required environment variable: ${varName}`,
      )
    })

    it('replaces literal \\n sequences in APPLE_PRIVATE_KEY with real newlines', async () => {
      const pemWithLiteralNewlines =
        '-----BEGIN PRIVATE KEY-----\\nABCDEFG\\n-----END PRIVATE KEY-----'
      vi.stubEnv('APPLE_PRIVATE_KEY', pemWithLiteralNewlines)
      const { config } = await import('./config.js')
      expect(config.apple.privateKey).toContain('\n')
      expect(config.apple.privateKey).not.toContain('\\n')
      expect(config.apple.privateKey).toBe(
        '-----BEGIN PRIVATE KEY-----\nABCDEFG\n-----END PRIVATE KEY-----',
      )
    })

    it('resolves all Apple config values when present', async () => {
      const { config } = await import('./config.js')
      expect(config.apple.teamId).toBe('ABCDE12345')
      expect(config.apple.keyId).toBe('FGHIJ67890')
      expect(config.apple.bundleId).toBe('com.example.trackemtoys')
      expect(config.apple.servicesId).toBe('com.example.trackemtoys.web')
    })
  })

  describe('TLS config', () => {
    it('leaves tls fields undefined when neither var is set', async () => {
      vi.stubEnv('TLS_CERT_FILE', '')
      vi.stubEnv('TLS_KEY_FILE', '')
      const { config } = await import('./config.js')
      expect(config.tls.certFile).toBeUndefined()
      expect(config.tls.keyFile).toBeUndefined()
    })

    it('reads both TLS paths when both are set', async () => {
      vi.stubEnv('TLS_CERT_FILE', '/path/to/cert.pem')
      vi.stubEnv('TLS_KEY_FILE', '/path/to/key.pem')
      const { config } = await import('./config.js')
      expect(config.tls.certFile).toBe('/path/to/cert.pem')
      expect(config.tls.keyFile).toBe('/path/to/key.pem')
    })

    it('throws when TLS_CERT_FILE is set but TLS_KEY_FILE is not', async () => {
      vi.stubEnv('TLS_CERT_FILE', '/path/to/cert.pem')
      vi.stubEnv('TLS_KEY_FILE', '')
      await expect(import('./config.js')).rejects.toThrow(
        'TLS_CERT_FILE and TLS_KEY_FILE must both be set or both be unset',
      )
    })

    it('throws when TLS_KEY_FILE is set but TLS_CERT_FILE is not', async () => {
      vi.stubEnv('TLS_KEY_FILE', '/path/to/key.pem')
      vi.stubEnv('TLS_CERT_FILE', '')
      await expect(import('./config.js')).rejects.toThrow(
        'TLS_CERT_FILE and TLS_KEY_FILE must both be set or both be unset',
      )
    })
  })

  describe('Google Sign-In required variables', () => {
    it.each([
      'GOOGLE_WEB_CLIENT_ID',
      'GOOGLE_IOS_CLIENT_ID',
    ])('throws when %s is missing', async (varName) => {
      vi.stubEnv(varName, '')
      await expect(import('./config.js')).rejects.toThrow(
        `Missing required environment variable: ${varName}`,
      )
    })

    it('resolves all Google config values when present', async () => {
      const { config } = await import('./config.js')
      expect(config.google.webClientId).toBe('test-web.apps.googleusercontent.com')
      expect(config.google.iosClientId).toBe('test-ios.apps.googleusercontent.com')
    })
  })
})
