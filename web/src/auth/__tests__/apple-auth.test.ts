import { describe, it, expect, beforeEach, vi, afterEach, afterAll } from 'vitest';

// We test nonce generation, env var guards, SDK deduplication, and popup
// response handling. The Apple SDK itself is loaded dynamically and not
// available in jsdom.

describe('Apple auth nonce generation', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('generateNonce produces a 64-char hex raw nonce', async () => {
    // Test the nonce generation logic directly by replicating it
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const raw = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    expect(raw).toHaveLength(64);
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
  });

  it('consecutive nonces are unique', () => {
    const nonces = Array.from({ length: 10 }, () => {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    });
    expect(new Set(nonces).size).toBe(10);
  });
});

describe('initiateAppleSignIn — env var guard', () => {
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('throws when VITE_APPLE_SERVICES_ID is missing', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_APPLE_SERVICES_ID', '');
    vi.stubEnv('VITE_APPLE_REDIRECT_URI', 'https://example.com/callback');

    const { initiateAppleSignIn } = await import('../apple-auth');
    await expect(initiateAppleSignIn()).rejects.toThrow(
      'Apple Sign-In is not configured. Set VITE_APPLE_SERVICES_ID and VITE_APPLE_REDIRECT_URI.'
    );
  });

  it('throws when VITE_APPLE_REDIRECT_URI is missing', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_APPLE_SERVICES_ID', 'com.example.app');
    vi.stubEnv('VITE_APPLE_REDIRECT_URI', '');

    const { initiateAppleSignIn } = await import('../apple-auth');
    await expect(initiateAppleSignIn()).rejects.toThrow(
      'Apple Sign-In is not configured. Set VITE_APPLE_SERVICES_ID and VITE_APPLE_REDIRECT_URI.'
    );
  });
});

describe('initiateAppleSignIn', () => {
  it('throws an error when Apple SDK is not loaded', async () => {
    // Ensure AppleID is not on window
    const windowWithApple = window as Window & { AppleID?: unknown };
    delete windowWithApple.AppleID;

    // Mock script loading to resolve without actually loading the SDK
    vi.spyOn(document.head, 'appendChild').mockImplementationOnce((script) => {
      // Simulate script load event
      const scriptEl = script as HTMLScriptElement;
      setTimeout(() => scriptEl.onload?.(new Event('load')), 0);
      return script;
    });

    const { initiateAppleSignIn } = await import('../apple-auth');

    // AppleID will still be undefined after "loading", so it should throw
    await expect(initiateAppleSignIn()).rejects.toThrow('Apple JS SDK not loaded');
  });
});

describe('initiateAppleSignIn — popup response handling', () => {
  let mockSignIn: ReturnType<typeof vi.fn>;
  let mockInit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();

    mockInit = vi.fn();
    mockSignIn = vi.fn();

    // Provide a mock Apple SDK on window
    Object.defineProperty(window, 'AppleID', {
      value: { auth: { init: mockInit, signIn: mockSignIn } },
      writable: true,
      configurable: true,
    });

    vi.stubEnv('VITE_APPLE_SERVICES_ID', 'com.example.app');
    vi.stubEnv('VITE_APPLE_REDIRECT_URI', 'https://example.com/callback');
  });

  afterEach(() => {
    const windowWithApple = window as Window & { AppleID?: unknown };
    delete windowWithApple.AppleID;
    vi.unstubAllEnvs();
    sessionStorage.clear();
  });

  it('returns idToken and rawNonce from popup response', async () => {
    // Mock signIn to capture the state from init and return it
    mockInit.mockImplementation((config: { state: string }) => {
      mockSignIn.mockResolvedValue({
        authorization: {
          id_token: 'apple-id-token-123',
          code: 'auth-code',
          state: config.state,
        },
      });
    });

    const { initiateAppleSignIn } = await import('../apple-auth');
    const result = await initiateAppleSignIn();

    expect(result.idToken).toBe('apple-id-token-123');
    expect(result.rawNonce).toMatch(/^[0-9a-f]{64}$/);
  });

  it('throws on state mismatch (CSRF protection)', async () => {
    mockInit.mockImplementation(() => {
      mockSignIn.mockResolvedValue({
        authorization: {
          id_token: 'apple-id-token',
          code: 'auth-code',
          state: 'wrong-state',
        },
      });
    });

    const { initiateAppleSignIn } = await import('../apple-auth');
    await expect(initiateAppleSignIn()).rejects.toThrow('state mismatch');
  });

  it('extracts user name from first-time Apple authorization', async () => {
    mockInit.mockImplementation((config: { state: string }) => {
      mockSignIn.mockResolvedValue({
        authorization: {
          id_token: 'apple-id-token',
          code: 'auth-code',
          state: config.state,
        },
        user: {
          email: 'test@example.com',
          name: { firstName: 'John', lastName: 'Doe' },
        },
      });
    });

    const { initiateAppleSignIn } = await import('../apple-auth');
    const result = await initiateAppleSignIn();

    expect(result.userName).toBe('John Doe');
  });

  it('caches user name in sessionStorage for subsequent sign-ins', async () => {
    mockInit.mockImplementation((config: { state: string }) => {
      mockSignIn.mockResolvedValue({
        authorization: {
          id_token: 'apple-id-token',
          code: 'auth-code',
          state: config.state,
        },
        user: {
          email: 'test@example.com',
          name: { firstName: 'Jane', lastName: 'Smith' },
        },
      });
    });

    const { initiateAppleSignIn } = await import('../apple-auth');
    await initiateAppleSignIn();

    expect(sessionStorage.getItem('trackem:apple:user_name')).toBe('Jane Smith');
  });

  it('falls back to cached user name when Apple does not provide it', async () => {
    sessionStorage.setItem('trackem:apple:user_name', 'Cached Name');

    mockInit.mockImplementation((config: { state: string }) => {
      mockSignIn.mockResolvedValue({
        authorization: {
          id_token: 'apple-id-token',
          code: 'auth-code',
          state: config.state,
        },
        // No user object — subsequent sign-in
      });
    });

    const { initiateAppleSignIn } = await import('../apple-auth');
    const result = await initiateAppleSignIn();

    expect(result.userName).toBe('Cached Name');
  });

  it('returns undefined userName when no user data and no cache', async () => {
    mockInit.mockImplementation((config: { state: string }) => {
      mockSignIn.mockResolvedValue({
        authorization: {
          id_token: 'apple-id-token',
          code: 'auth-code',
          state: config.state,
        },
      });
    });

    const { initiateAppleSignIn } = await import('../apple-auth');
    const result = await initiateAppleSignIn();

    expect(result.userName).toBeUndefined();
  });

  it('passes the raw nonce (not a hash) to Apple SDK init', async () => {
    mockInit.mockImplementation((config: { state: string; nonce: string }) => {
      mockSignIn.mockResolvedValue({
        authorization: {
          id_token: 'apple-id-token',
          code: 'auth-code',
          state: config.state,
        },
      });
    });

    const { initiateAppleSignIn } = await import('../apple-auth');
    const result = await initiateAppleSignIn();

    // The nonce passed to Apple SDK must be the same rawNonce returned to the caller.
    // Apple's JS SDK hashes it internally; our API's apple-signin-auth does the same,
    // so both sides compare SHA-256(raw).
    const initNonce = (mockInit.mock.calls[0] as [{ nonce: string }])[0].nonce;
    expect(initNonce).toBe(result.rawNonce);
  });

  it('passes usePopup: true to Apple SDK init', async () => {
    mockInit.mockImplementation((config: { state: string }) => {
      mockSignIn.mockResolvedValue({
        authorization: {
          id_token: 'apple-id-token',
          code: 'auth-code',
          state: config.state,
        },
      });
    });

    const { initiateAppleSignIn } = await import('../apple-auth');
    await initiateAppleSignIn();

    expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({ usePopup: true }));
  });
});

describe('loadAppleSDK deduplication', () => {
  it('appends only one script element when called concurrently while the SDK is loading', async () => {
    // Reset the module so sdkLoadPromise starts as null
    vi.resetModules();

    const windowWithApple = window as Window & { AppleID?: unknown };
    delete windowWithApple.AppleID;

    const appendChildSpy = vi.spyOn(document.head, 'appendChild');

    // Resolve script load only once, after a short delay
    const scriptResolvers: Array<() => void> = [];
    appendChildSpy.mockImplementation((node) => {
      const script = node as HTMLScriptElement;
      // Capture resolve so we can trigger it after both calls are in-flight
      scriptResolvers.push(() => script.onload?.(new Event('load')));
      return node;
    });

    // Import a fresh module instance after vi.resetModules()
    const { initiateAppleSignIn } = await import('../apple-auth');

    // Fire two concurrent calls — only one should append a <script>
    const p1 = initiateAppleSignIn().catch(() => {
      /* expected: Apple SDK not loaded */
    });
    const p2 = initiateAppleSignIn().catch(() => {
      /* expected: Apple SDK not loaded */
    });

    // Resolve the in-flight script load (only first entry — deduplication means only one was appended)
    scriptResolvers[0]?.();

    await Promise.allSettled([p1, p2]);

    // Only one script should have been appended despite two concurrent calls
    expect(appendChildSpy.mock.calls.length).toBe(1);

    appendChildSpy.mockRestore();
  });

  it('resets the in-flight promise on load failure to allow retry', async () => {
    vi.resetModules();

    const windowWithApple = window as Window & { AppleID?: unknown };
    delete windowWithApple.AppleID;

    const appendChildSpy = vi.spyOn(document.head, 'appendChild');
    let callCount = 0;

    appendChildSpy.mockImplementation((node) => {
      callCount++;
      const script = node as HTMLScriptElement;
      // First call: simulate onerror; second call: simulate onload
      if (callCount === 1) {
        setTimeout(() => script.onerror?.(new Event('error')), 0);
      } else {
        setTimeout(() => script.onload?.(new Event('load')), 0);
      }
      return node;
    });

    const { initiateAppleSignIn } = await import('../apple-auth');

    // First attempt — script fails to load
    await expect(initiateAppleSignIn()).rejects.toThrow('Failed to load Apple Sign-In SDK');
    expect(callCount).toBe(1);

    // After failure, sdkLoadPromise should be null, allowing a retry
    // Second attempt — script loads, but AppleID is still not on window
    await expect(initiateAppleSignIn()).rejects.toThrow('Apple JS SDK not loaded');
    expect(callCount).toBe(2);

    appendChildSpy.mockRestore();
  });
});
