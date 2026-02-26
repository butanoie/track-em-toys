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

async function loadAppleSDK(): Promise<void> {
  if (window.AppleID) return

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = APPLE_SDK_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Apple JS SDK'))
    document.head.appendChild(script)
  })
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
  await loadAppleSDK()

  const { raw, hashed } = await generateNonce()
  const state = crypto.randomUUID()

  // Store raw nonce and state for CSRF validation in callback
  sessionStorage.setItem(SESSION_KEYS.appleNonce, raw)
  sessionStorage.setItem(SESSION_KEYS.appleState, state)

  const clientId = import.meta.env.VITE_APPLE_SERVICES_ID
  const redirectURI = import.meta.env.VITE_APPLE_REDIRECT_URI

  if (!window.AppleID) {
    throw new Error('Apple JS SDK not loaded')
  }

  window.AppleID.auth.init({
    clientId,
    scope: 'name email',
    redirectURI,
    state,
    nonce: hashed,
    usePopup: false,
  })

  await window.AppleID.auth.signIn()
}
