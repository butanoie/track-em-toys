import crypto from 'node:crypto'
import { exportJWK } from 'jose'
import { config } from '../config.js'

interface KeyEntry {
  kid: string
  privateKey: crypto.KeyObject
  publicKey: crypto.KeyObject
}

const keys = new Map<string, KeyEntry>()
let currentKid: string

function loadKey(): void {
  const kid = config.jwt.keyId
  const privateKey = crypto.createPrivateKey(config.jwt.privateKey)
  const publicKey = crypto.createPublicKey(config.jwt.publicKey)

  keys.set(kid, { kid, privateKey, publicKey })
  currentKid = kid
}

loadKey()

/** Get the key ID used to sign new tokens. */
export function getCurrentKid(): string {
  return currentKid
}

/** Get the current signing key as a PEM string. */
export function getPrivateKeyPem(): string {
  return config.jwt.privateKey
}

/**
 * Get a public key PEM by its key ID, for JWT verification.
 *
 * @param kid - The key identifier from the JWT header
 */
export function getPublicKeyPem(kid: string): string | null {
  const entry = keys.get(kid)
  if (!entry) return null
  return entry.publicKey.export({ type: 'spki', format: 'pem' }) as string
}

/**
 * Get a public KeyObject by its key ID.
 *
 * @param kid - The key identifier
 */
export function getPublicKeyObject(kid: string): crypto.KeyObject | null {
  const entry = keys.get(kid)
  return entry?.publicKey ?? null
}

/** Build the JWKS response containing all active public keys. */
export async function getJwks(): Promise<{ keys: object[] }> {
  const jwks: object[] = []
  for (const [kid, entry] of keys) {
    const jwk = await exportJWK(entry.publicKey)
    jwks.push({ ...jwk, kid, alg: 'ES256', use: 'sig' })
  }
  return { keys: jwks }
}
