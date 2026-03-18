/**
 * Thrown inside `withTransaction` callbacks to trigger a ROLLBACK and return an
 * HTTP error response to the client. Must only be thrown inside a transaction
 * callback — throwing it outside a transaction bypasses production error redaction
 * in the global setErrorHandler.
 *
 * Outside a transaction: use `reply.code(x).send(...)` (pre-transaction) or
 * `throw new Error(...)` (post-COMMIT) instead.
 */
export class HttpError extends Error {
  /**
   * Create an HttpError that will be caught outside the transaction.
   *
   * @param statusCode - HTTP status code to return
   * @param body - JSON response body
   */
  constructor(
    public readonly statusCode: number,
    public readonly body: Record<string, unknown>
  ) {
    super(JSON.stringify(body));
    this.name = 'HttpError';
  }
}

/**
 * Thrown by provider token verification functions (verifyAppleToken, verifyGoogleToken)
 * for validation failures such as bad signature, wrong audience, expired token, or
 * missing required fields.
 *
 * Infrastructure errors (JWKS fetch timeout, network failure, etc.) must be thrown
 * as plain `Error` so route handlers can distinguish validation failures (401) from
 * infrastructure failures (503).
 */
export class ProviderVerificationError extends Error {
  /**
   * Create a ProviderVerificationError for token validation failures.
   *
   * @param message - Human-readable description of the validation failure
   */
  constructor(message: string) {
    super(message);
    this.name = 'ProviderVerificationError';
  }
}

/**
 * Node.js POSIX error codes that indicate network/infrastructure failures.
 * Used to distinguish transient infrastructure errors from token validation errors.
 */
const NETWORK_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EPIPE',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EHOSTDOWN',
  'ENETDOWN',
]);

/**
 * Returns true if the error is a Node.js network-level infrastructure error,
 * identified by its `.code` property (e.g. ECONNRESET, ETIMEDOUT, ENOTFOUND).
 * These errors should propagate as-is so the route handler can return 503.
 *
 * @param err - The error to check
 */
export function isNetworkError(err: unknown): err is Error {
  if (!(err instanceof Error)) return false;
  // instanceof Error confirmed above; NodeJS.ErrnoException adds only optional .code — cast is safe
  const code = (err as NodeJS.ErrnoException).code;
  return code !== undefined && NETWORK_ERROR_CODES.has(code);
}
