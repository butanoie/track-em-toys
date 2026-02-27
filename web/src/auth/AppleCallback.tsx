import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useAuth } from './useAuth'
import { SESSION_KEYS } from '@/lib/auth-store'

function extractStringParam(params: Record<string, unknown>, key: string): string | undefined {
  const val = params[key]
  return typeof val === 'string' ? val : undefined
}

const APPLE_ERROR_MESSAGES: Record<string, string> = {
  user_cancelled_authorize: 'Sign-in was cancelled.',
  invalid_request: 'Invalid sign-in request. Please try again.',
  invalid_client: 'App configuration error. Please contact support.',
  invalid_grant: 'Sign-in session expired. Please try again.',
  invalid_scope: 'Invalid permissions requested.',
  unsupported_response_type: 'Sign-in not supported in this context.',
}

export function AppleCallback() {
  const navigate = useNavigate()
  const searchRaw = useSearch({ strict: false })
  const { signInWithApple } = useAuth()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // Snapshot search params on mount so that identity changes to `searchRaw`,
  // `signInWithApple`, or `navigate` cannot re-trigger the callback after it
  // has already run. This is a one-shot mount effect.
  const searchParamsRef = useRef(searchRaw)

  useEffect(() => {
    // One-time mount callback — search params captured by ref above.
    // signInWithApple and navigate are stable references in TanStack Router.

    async function handleCallback() {
      const params = searchParamsRef.current
      const errorParam = extractStringParam(params, 'error')
      const idToken = extractStringParam(params, 'token')
      const encodedUser = extractStringParam(params, 'user')
      const returnedState = extractStringParam(params, 'state')

      // Check for Apple error — map known codes to human-friendly messages
      if (errorParam) {
        const friendlyError =
          APPLE_ERROR_MESSAGES[errorParam] ?? `Apple sign-in failed (${errorParam}).`
        setErrorMessage(friendlyError)
        return
      }

      if (!idToken) {
        setErrorMessage('Invalid callback: missing token.')
        return
      }

      // CSRF state validation — fail-closed: reject when either value is absent
      const storedState = sessionStorage.getItem(SESSION_KEYS.appleState)
      if (!returnedState || !storedState || returnedState !== storedState) {
        setErrorMessage('Security check failed: state mismatch.')
        return
      }

      // Retrieve raw nonce stored before redirect — fail-closed like state above
      const rawNonce = sessionStorage.getItem(SESSION_KEYS.appleNonce)
      if (!rawNonce) {
        setErrorMessage('Sign-in session expired. Please try again.')
        return
      }

      // Parse optional user name (only provided on first Apple sign-in)
      let userName: string | undefined
      if (encodedUser) {
        try {
          const decoded = decodeURIComponent(encodedUser)
          const userObj: unknown = JSON.parse(decoded)
          if (
            userObj !== null &&
            typeof userObj === 'object' &&
            'name' in userObj &&
            userObj.name !== null &&
            typeof userObj.name === 'object'
          ) {
            const nameObj = userObj.name as Record<string, unknown>
            const firstName = typeof nameObj['firstName'] === 'string' ? nameObj['firstName'] : ''
            const lastName = typeof nameObj['lastName'] === 'string' ? nameObj['lastName'] : ''
            const parts = [firstName, lastName].filter(Boolean)
            if (parts.length > 0) {
              userName = parts.join(' ')
              sessionStorage.setItem(SESSION_KEYS.appleUserName, userName)
            }
          }
        } catch {
          // Ignore malformed user data
        }
      }

      // Fall back to previously cached Apple user name if available
      if (!userName) {
        userName = sessionStorage.getItem(SESSION_KEYS.appleUserName) ?? undefined
      }

      try {
        await signInWithApple(idToken, rawNonce, userName)
        // Only clear CSRF values after success — allows retry on transient failure
        sessionStorage.removeItem(SESSION_KEYS.appleState)
        sessionStorage.removeItem(SESSION_KEYS.appleNonce)
        await navigate({ to: '/' })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Apple sign-in failed.'
        setErrorMessage(message)
      }
    }

    void handleCallback()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentional empty deps: one-shot mount callback, params captured by ref

  if (errorMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-sm p-8 space-y-4 text-center">
          <h2 className="text-xl font-semibold text-foreground">Sign-in Failed</h2>
          <p
            role="alert"
            className="text-sm text-destructive"
          >
            {errorMessage}
          </p>
          <Link to="/login" className="text-sm text-primary underline">
            Return to Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Completing Apple sign-in...
        </p>
      </div>
    </div>
  )
}
