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

function optional(name: string, fallback: string): string {
  const value = process.env[name]
  return value !== undefined && value !== '' ? value : fallback
}

function optionalOrUndefined(name: string): string | undefined {
  const value = process.env[name]
  return value !== undefined && value !== '' ? value : undefined
}

function loadCorsOrigin(): string {
  const origin = optional('CORS_ORIGIN', 'http://localhost:5173')
  if (origin === '*') {
    throw new Error('CORS_ORIGIN=* is not permitted when credentials are enabled')
  }
  return origin
}

export const config = {
  port: parseInt(optional('PORT', '3000'), 10),
  corsOrigin: loadCorsOrigin(),
  trustProxy: optional('TRUST_PROXY', 'false') === 'true',

  database: {
    url: required('DATABASE_URL'),
  },

  jwt: {
    privateKey: requiredPem('JWT_PRIVATE_KEY'),
    publicKey: requiredPem('JWT_PUBLIC_KEY'),
    keyId: required('JWT_KEY_ID'),
    issuer: optional('JWT_ISSUER', 'track-em-toys'),
    audience: 'track-em-toys-api',
    accessTokenExpiry: '15m',
  },

  apple: {
    teamId: optionalOrUndefined('APPLE_TEAM_ID'),
    keyId: optionalOrUndefined('APPLE_KEY_ID'),
    privateKey: optionalOrUndefined('APPLE_PRIVATE_KEY'),
    bundleId: optionalOrUndefined('APPLE_BUNDLE_ID'),
    servicesId: optionalOrUndefined('APPLE_SERVICES_ID'),
  },

  google: {
    webClientId: optionalOrUndefined('GOOGLE_WEB_CLIENT_ID'),
    iosClientId: optionalOrUndefined('GOOGLE_IOS_CLIENT_ID'),
  },
} as const
