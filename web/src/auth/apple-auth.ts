import { SESSION_KEYS } from '@/lib/auth-store'

// Apple JS SDK type declarations (loaded dynamically via <script> tag)

interface AppleSignInAuthorization {
  code: string
  id_token: string
  state: string
}

interface AppleSignInUser {
  email: string
  name: {
    firstName: string
    lastName: string
  }
}

interface AppleSignInResponse {
  authorization: AppleSignInAuthorization
  user?: AppleSignInUser
}

declare global {
  interface Window {
    AppleID?: {
      auth: {
        init: (config: AppleIDAuthConfig) => void
        signIn: () => Promise<AppleSignInResponse>
      }
    }
  }
}

interface AppleIDAuthConfig {
  clientId: string
  scope: string
  redirectURI: string
  state: string
  nonce: string
  usePopup: boolean
}

export interface AppleSignInResult {
  idToken: string
  rawNonce: string
  userName?: string
}

const APPLE_SDK_URL = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js'

// Tracks the in-flight SDK load so concurrent calls share the same promise
// and only one <script> element is ever appended.
let sdkLoadPromise: Promise<void> | null = null

function loadAppleSDK(): Promise<void> {
  if (window.AppleID) return Promise.resolve()
  if (sdkLoadPromise) return sdkLoadPromise   // deduplicate concurrent calls
  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = APPLE_SDK_URL
    script.async = true
    // Apple does not publish versioned SRI hashes for their JS SDK, so a full
    // `integrity` attribute is not possible. The recommended mitigation is a
    // strict CSP: script-src 'self' https://appleid.cdn-apple.com
    script.crossOrigin = 'anonymous'
    script.onload = () => resolve()
    script.onerror = () => {
      sdkLoadPromise = null  // allow retry on load failure
      reject(new Error('Failed to load Apple Sign-In SDK'))
    }
    document.head.appendChild(script)
  })
  return sdkLoadPromise
}

function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Opens the Apple Sign-In popup and returns the id_token, raw nonce, and
 * optional user name on success.
 *
 * Uses `usePopup: true` so the entire flow happens within a popup window —
 * no full-page redirect, no form POST callback, and nonce/state stay in
 * local variables (no sessionStorage needed for CSRF tokens).
 */
export async function initiateAppleSignIn(): Promise<AppleSignInResult> {
  const clientId: string | undefined = import.meta.env.VITE_APPLE_SERVICES_ID || undefined
  const redirectURI: string | undefined = import.meta.env.VITE_APPLE_REDIRECT_URI || undefined
  if (!clientId || !redirectURI) {
    throw new Error(
      'Apple Sign-In is not configured. Set VITE_APPLE_SERVICES_ID and VITE_APPLE_REDIRECT_URI.'
    )
  }

  await loadAppleSDK()

  const raw = generateNonce()
  const state = crypto.randomUUID()

  if (!window.AppleID) {
    throw new Error('Apple JS SDK not loaded')
  }

  // Pass the raw nonce — Apple's JS SDK hashes it (SHA-256) before embedding
  // in the JWT. The API's apple-signin-auth library also hashes the nonce it
  // receives before comparing, so both sides end up comparing SHA-256(raw).
  window.AppleID.auth.init({
    clientId: clientId,
    scope: 'name email',
    redirectURI: redirectURI,
    state,
    nonce: raw,
    usePopup: true,
  })

  const response = await window.AppleID.auth.signIn()

  // CSRF state validation — fail-closed: reject when either value is absent or mismatched
  if (!response.authorization.state || response.authorization.state !== state) {
    throw new Error('Security check failed: state mismatch.')
  }

  // Extract user name (Apple only provides this on the first authorization)
  let userName: string | undefined
  if (response.user?.name) {
    const { firstName, lastName } = response.user.name
    const parts = [firstName, lastName].filter(Boolean)
    if (parts.length > 0) {
      userName = parts.join(' ')
      // Cache for retry — Apple won't send the name again on subsequent sign-ins
      sessionStorage.setItem(SESSION_KEYS.appleUserName, userName)
    }
  }

  // Fall back to previously cached name if Apple didn't provide it this time
  if (!userName) {
    userName = sessionStorage.getItem(SESSION_KEYS.appleUserName) ?? undefined
  }

  return {
    idToken: response.authorization.id_token,
    rawNonce: raw,
    userName,
  }
}
