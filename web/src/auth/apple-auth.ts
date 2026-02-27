import { SESSION_KEYS } from '@/lib/auth-store'

// Apple JS SDK type declarations (loaded dynamically via <script> tag)
declare global {
  interface Window {
    AppleID?: {
      auth: {
        init: (config: AppleIDAuthConfig) => void
        signIn: () => Promise<void>
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

async function generateNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const raw = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(raw),
  )
  const hashed = Array.from(
    new Uint8Array(hashBuffer),
    b => b.toString(16).padStart(2, '0'),
  ).join('')
  return { raw, hashed }
}

export async function initiateAppleSignIn(): Promise<void> {
  const clientId: string | undefined = import.meta.env.VITE_APPLE_SERVICES_ID || undefined
  const redirectURI: string | undefined = import.meta.env.VITE_APPLE_REDIRECT_URI || undefined
  if (!clientId || !redirectURI) {
    throw new Error(
      'Apple Sign-In is not configured. Set VITE_APPLE_SERVICES_ID and VITE_APPLE_REDIRECT_URI.'
    )
  }

  await loadAppleSDK()

  const { raw, hashed } = await generateNonce()
  const state = crypto.randomUUID()

  // Store raw nonce and state for CSRF validation in callback
  sessionStorage.setItem(SESSION_KEYS.appleNonce, raw)
  sessionStorage.setItem(SESSION_KEYS.appleState, state)

  if (!window.AppleID) {
    throw new Error('Apple JS SDK not loaded')
  }

  window.AppleID.auth.init({
    clientId: clientId,
    scope: 'name email',
    redirectURI: redirectURI,
    state,
    nonce: hashed,
    usePopup: false,
  })

  try {
    await window.AppleID.auth.signIn()
  } catch (err) {
    // Clean up stale nonce/state so they don't persist on error
    sessionStorage.removeItem(SESSION_KEYS.appleNonce)
    sessionStorage.removeItem(SESSION_KEYS.appleState)
    throw err
  }
}
