import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Generate key pair with vi.hoisted() so it runs before vi.mock() hoisting ─
// Must use require() inside vi.hoisted() because ESM imports are not yet resolved.
const { testPrivatePem, testPublicPem } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required inside vi.hoisted
  const nodeCrypto = require('node:crypto') as typeof import('node:crypto');
  const { privateKey, publicKey } = nodeCrypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  return {
    // format: 'pem' guarantees string at runtime; TS types KeyObject.export() as string | Buffer
    testPrivatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    testPublicPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
  };
});

vi.mock('../config.js', () => ({
  config: {
    jwt: {
      keyId: 'test-kid-1',
      privateKey: testPrivatePem,
      publicKey: testPublicPem,
      issuer: 'track-em-toys-test',
      audience: 'track-em-toys-api-test',
      accessTokenExpiry: '15m',
    },
    secureCookies: false,
    cookieSecret: 'test-secret',
  },
}));

import { initKeyStore, getCurrentKid, getPublicKeyPem, getJwks } from './key-store.js';

describe('key-store', () => {
  beforeEach(async () => {
    // Re-initialize before each test to reset state
    await initKeyStore();
  });

  describe('initKeyStore', () => {
    it('should load the key pair without throwing', async () => {
      await expect(initKeyStore()).resolves.not.toThrow();
    });

    it('should make getCurrentKid() return the configured key ID', async () => {
      await initKeyStore();
      expect(getCurrentKid()).toBe('test-kid-1');
    });

    it('should populate the JWKS cache so getJwks() returns a non-empty keys array', async () => {
      await initKeyStore();
      const jwks = getJwks();
      expect(jwks.keys.length).toBeGreaterThan(0);
    });

    it('getCurrentKid() and getJwks() are consistent after initKeyStore() resolves', async () => {
      await initKeyStore();
      const kid = getCurrentKid();
      const jwks = getJwks();
      // The kid returned by getCurrentKid() must appear in the JWKS cache —
      // verifying that all three state mutations (keys.set, currentKid, cachedJwks)
      // happened atomically before any caller could observe a partial update.
      const matchingKey = jwks.keys.find((k) => k.kid === kid);
      expect(matchingKey).toBeDefined();
      expect(matchingKey?.kid).toBe(kid);
    });
  });

  describe('getCurrentKid', () => {
    it('should return the key ID after initialization', () => {
      expect(getCurrentKid()).toBe('test-kid-1');
    });
  });

  describe('getPublicKeyPem', () => {
    it('should return a PEM string for a known kid', () => {
      const pem = getPublicKeyPem('test-kid-1');
      expect(pem).not.toBeNull();
      expect(pem).toContain('BEGIN PUBLIC KEY');
    });

    it('should return null for an unknown kid', () => {
      const pem = getPublicKeyPem('unknown-kid');
      expect(pem).toBeNull();
    });
  });

  describe('getJwks', () => {
    it('should return an object with a keys array', () => {
      const jwks = getJwks();
      expect(jwks).toHaveProperty('keys');
      expect(Array.isArray(jwks.keys)).toBe(true);
      expect(jwks.keys.length).toBeGreaterThan(0);
    });

    it('should return the cached value populated during initKeyStore()', () => {
      // Call twice — both invocations must return identical objects (cached)
      const first = getJwks();
      const second = getJwks();
      expect(first).toEqual(second);
    });

    it('should include exactly the whitelisted JWK fields', () => {
      const jwks = getJwks();
      const key = jwks.keys[0];
      expect(key).toBeDefined();

      expect(key!).toHaveProperty('kty');
      expect(key).toHaveProperty('crv');
      expect(key).toHaveProperty('x');
      expect(key).toHaveProperty('y');
      expect(key).toHaveProperty('kid', 'test-kid-1');
      expect(key).toHaveProperty('alg', 'ES256');
      expect(key).toHaveProperty('use', 'sig');

      // Ensure no extra private-key fields leak through
      expect(key).not.toHaveProperty('d');
    });

    it('should set alg to ES256 and use to sig regardless of jose output', () => {
      const jwks = getJwks();
      const key = jwks.keys[0];
      expect(key).toBeDefined();

      expect(key!.alg).toBe('ES256');
      expect(key!.use).toBe('sig');
    });

    it('key.kty should be EC for prime256v1 keys', () => {
      const jwks = getJwks();
      expect(jwks.keys[0]?.kty).toBe('EC');
    });

    it('should return deep-cloned JWK objects so mutating the result does not affect the cache', () => {
      const result1 = getJwks();
      expect(result1.keys[0]).toBeDefined();
      result1.keys[0]!.kid = 'mutated';
      const result2 = getJwks();
      expect(result2.keys[0]).toBeDefined();
      expect(result2.keys[0]!.kid).not.toBe('mutated');
    });
  });

  describe('invalid PEM handling', () => {
    it('should throw a descriptive error when initKeyStore() is called with an invalid PEM', async () => {
      // Temporarily override the config mock with an invalid private key PEM so that
      // initKeyStore() exercises the error-handling path inside loadKey().
      const { config: configMock } = await import('../config.js');
      const originalPrivateKey = configMock.jwt.privateKey;
      try {
        (configMock.jwt as { privateKey: string }).privateKey = 'not-a-valid-pem';
        await expect(initKeyStore()).rejects.toThrow('Failed to load JWT signing keys');
      } finally {
        // Restore the valid PEM so subsequent tests are not affected
        (configMock.jwt as { privateKey: string }).privateKey = originalPrivateKey;
        await initKeyStore();
      }
    });
  });

  // [TCOV-5] getCurrentKid() before initKeyStore() throws 'Key store not initialized'
  describe('getCurrentKid before initialization', () => {
    afterEach(() => {
      // Reset modules is scoped to this describe block — restore module registry
      vi.resetModules();
    });

    it('should throw "Key store not initialized" when getCurrentKid() is called before initKeyStore()', async () => {
      // Reset module registry so we get a fresh key-store instance with no initialized state
      vi.resetModules();

      // Re-register the config mock for the fresh module context
      vi.doMock('../config.js', () => ({
        config: {
          jwt: {
            keyId: 'test-kid-fresh',
            privateKey: testPrivatePem,
            publicKey: testPublicPem,
            issuer: 'track-em-toys-test',
            audience: 'track-em-toys-api-test',
            accessTokenExpiry: '15m',
          },
          secureCookies: false,
          cookieSecret: 'test-secret',
        },
      }));

      // Dynamically import a fresh key-store module — getCurrentKid has not been initialized
      const { getCurrentKid: freshGetCurrentKid } = await import('./key-store.js');

      expect(() => freshGetCurrentKid()).toThrow('Key store not initialized');
    });
  });
});
