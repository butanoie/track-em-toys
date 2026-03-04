import 'dotenv/config'

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function requiredPem(name: string): string {
  return required(name).replace(/\\n/g, '\n')
}

function requiredMinLength(name: string, minLength: number): string {
  const value = required(name)
  if (value.length < minLength) {
    throw new Error(`Environment variable ${name} must be at least ${minLength} characters`)
  }
  return value
}

function optional(name: string, fallback: string): string {
  const value = process.env[name]
  return value !== undefined && value !== '' ? value : fallback
}

/**
 * Read an optional environment variable, returning `undefined` when unset.
 * NOTE: empty-string values (e.g. `APPLE_BUNDLE_ID=`) are treated as unset
 * and return `undefined`. This is intentional — an empty string is not a valid
 * value for any of the optional provider config fields.
 *
 * @param name - Environment variable name
 */
function optionalOrUndefined(name: string): string | undefined {
  const value = process.env[name]
  return value !== undefined && value !== '' ? value : undefined
}

/**
 * Read an optional PEM-encoded environment variable, replacing literal `\n`
 * escape sequences with actual newlines (matching the behaviour of
 * {@link requiredPem}). Returns `undefined` when unset or empty.
 *
 * @param name - Environment variable name
 */
function optionalPem(name: string): string | undefined {
  const value = optionalOrUndefined(name)
  return value !== undefined ? value.replace(/\\n/g, '\n') : undefined
}

type NodeEnv = 'development' | 'test' | 'staging' | 'production'
const VALID_NODE_ENVS: readonly NodeEnv[] = ['development', 'test', 'staging', 'production']

function nodeEnv(): NodeEnv {
  const value = optional('NODE_ENV', 'development')
  // Cast is safe: TypeScript cannot narrow string to NodeEnv for Array<NodeEnv>.includes(); the check itself is the validation guard
  if (!VALID_NODE_ENVS.includes(value as NodeEnv)) {
    throw new Error(`Invalid NODE_ENV: "${value}". Must be one of: ${VALID_NODE_ENVS.join(', ')}`)
  }
  // Safe: VALID_NODE_ENVS.includes() check above guarantees the value is a valid NodeEnv
  return value as NodeEnv
}

function optionalBool(name: string, fallback: boolean): boolean {
  const value = process.env[name]
  if (value === undefined || value === '') return fallback
  return value === 'true'
}

function optionalInt(name: string, fallback: number, min: number, max: number): number {
  const raw = optional(name, String(fallback))
  const n = parseInt(raw, 10)
  if (isNaN(n) || n < min || n > max) {
    throw new Error(`${name} must be a number between ${min} and ${max}, got: ${raw}`)
  }
  return n
}

function loadCorsOrigin(): string {
  const origin = optional('CORS_ORIGIN', 'http://localhost:5173')
  if (origin === '*') {
    throw new Error('CORS_ORIGIN=* is not permitted when credentials are enabled')
  }
  return origin
}

/**
 * Access token lifetime. Keep short — access tokens are not revocable.
 * See also REFRESH_TOKEN_EXPIRY_DAYS in src/auth/tokens.ts for the refresh token lifetime.
 */
const ACCESS_TOKEN_EXPIRY = '15m' as const

/** Application configuration loaded from environment variables. */
const parsedPort = optionalInt('PORT', 3000, 1, 65535)

export const config = {
  port: parsedPort,
  nodeEnv: nodeEnv(),
  logLevel: optional('LOG_LEVEL', 'info'),
  corsOrigin: loadCorsOrigin(),
  trustProxy: optionalBool('TRUST_PROXY', false),
  // SECURE_COOKIES env var overrides the NODE_ENV default, so staging envs can
  // set NODE_ENV=staging and still opt in via SECURE_COOKIES=true.
  secureCookies: optionalBool('SECURE_COOKIES', process.env.NODE_ENV === 'production'),
  cookieSecret: requiredMinLength('COOKIE_SECRET', 32),

  database: {
    url: required('DATABASE_URL'),
    sslCa: optionalPem('DATABASE_SSL_CA'),
    poolMax: optionalInt('DB_POOL_MAX', 20, 1, 1000),
  },

  jwt: {
    privateKey: requiredPem('JWT_PRIVATE_KEY'),
    publicKey: requiredPem('JWT_PUBLIC_KEY'),
    keyId: required('JWT_KEY_ID'),
    issuer: optional('JWT_ISSUER', 'track-em-toys'),
    audience: optional('JWT_AUDIENCE', 'track-em-toys-api'),
    accessTokenExpiry: ACCESS_TOKEN_EXPIRY,
  },

  apple: {
    teamId: required('APPLE_TEAM_ID'),
    keyId: required('APPLE_KEY_ID'),
    privateKey: requiredPem('APPLE_PRIVATE_KEY'),
    bundleId: required('APPLE_BUNDLE_ID'),
    servicesId: required('APPLE_SERVICES_ID'),
  },

  google: {
    webClientId: required('GOOGLE_WEB_CLIENT_ID'),
    iosClientId: required('GOOGLE_IOS_CLIENT_ID'),
    desktopClientId: optionalOrUndefined('GOOGLE_DESKTOP_CLIENT_ID'),
  },

  tls: {
    certFile: optionalOrUndefined('TLS_CERT_FILE'),
    keyFile: optionalOrUndefined('TLS_KEY_FILE'),
  },
} as const

// Startup validation: TLS requires both cert and key, or neither.
if ((config.tls.certFile != null) !== (config.tls.keyFile != null)) {
  throw new Error('TLS_CERT_FILE and TLS_KEY_FILE must both be set or both be unset')
}
