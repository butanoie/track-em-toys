import crypto from 'node:crypto';
import { exportJWK } from 'jose';
import { config } from '../config.js';

interface KeyEntry {
  kid: string;
  privateKey: crypto.KeyObject;
  publicKey: crypto.KeyObject;
  /** Pre-computed SPKI PEM of the public key, cached at init to avoid re-exporting on every call. */
  publicKeyPem: string;
}

/** Public JWK key shape returned in the JWKS endpoint. */
export interface JwkKey {
  kty: string;
  crv: string;
  x: string;
  y: string;
  kid: string;
  alg: string;
  use: string;
}

const keys = new Map<string, KeyEntry>();
/** currentKid is undefined until initKeyStore() is called. */
let currentKid: string | undefined;
/** Cached JWKS response; populated once during initKeyStore(). */
let cachedJwks: JwkKey[] = [];

/**
 * Load the JWT signing key pair from config into the in-memory key store.
 * Also pre-computes and caches the JWKS response so getJwks() is O(1).
 * Throws an Error with a descriptive message if the PEMs are invalid.
 */
async function loadKey(): Promise<void> {
  // Clear all previous keys so re-initialisation starts from a clean state.
  // This ensures stale key IDs never remain accessible after a key rotation.
  keys.clear();
  try {
    const kid = config.jwt.keyId;
    const privateKey = crypto.createPrivateKey(config.jwt.privateKey);
    const publicKey = crypto.createPublicKey(config.jwt.publicKey);
    const exported = publicKey.export({ type: 'spki', format: 'pem' });
    const publicKeyPem = typeof exported === 'string' ? exported : exported.toString('utf-8');

    // Compute JWK before mutating any shared state — keeps all assignments atomic
    const jwk = await exportJWK(publicKey);
    if (!jwk.kty || !jwk.crv || !jwk.x || !jwk.y) {
      throw new Error('Exported JWK is missing required EC fields (kty, crv, x, y)');
    }

    // All three state mutations happen synchronously after the async work is done
    keys.set(kid, { kid, privateKey, publicKey, publicKeyPem });
    currentKid = kid;
    cachedJwks = [
      {
        kty: jwk.kty,
        crv: jwk.crv,
        x: jwk.x,
        y: jwk.y,
        kid,
        alg: 'ES256',
        use: 'sig',
      },
    ];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load JWT signing keys — check JWT_PRIVATE_KEY and JWT_PUBLIC_KEY: ${message}`, {
      cause: err,
    });
  }
}

/**
 * Initialize the key store by loading the configured signing key pair and
 * pre-computing the JWKS cache. Must be called explicitly from buildServer()
 * before route registration. Calling it more than once replaces all previous
 * keys — the key map is cleared before the new key is inserted, so stale
 * entries from a prior kid are never retained.
 */
export async function initKeyStore(): Promise<void> {
  await loadKey();
}

/**
 * Get the key ID used to sign new tokens.
 * Throws if the key store has not been initialized via initKeyStore().
 */
export function getCurrentKid(): string {
  if (!currentKid) {
    throw new Error('Key store not initialized — call initKeyStore() before using JWT operations');
  }
  return currentKid;
}

/**
 * Get a public key PEM by its key ID, for JWT verification.
 *
 * @param kid - The key identifier from the JWT header
 */
export function getPublicKeyPem(kid: string): string | null {
  const entry = keys.get(kid);
  if (!entry) return null;
  return entry.publicKeyPem;
}

/**
 * Return the cached JWKS response containing all active public keys.
 * The cache is populated once during initKeyStore() so this is O(1).
 */
export function getJwks(): { keys: JwkKey[] } {
  // Map with object spread to deep-clone each JWK entry, preventing callers
  // from mutating the cached key objects through the returned references.
  return { keys: cachedJwks.map((k) => ({ ...k })) };
}
