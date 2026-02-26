import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useAuth } from './useAuth'
import { SESSION_KEYS } from '@/lib/auth-store'

function extractStringParam(params: Record<string, unknown>, key: string): string | undefined {
  const val = params[key]
  return typeof val === 'string' ? val : undefined
}

export function AppleCallback() {
  const navigate = useNavigate()
  const searchRaw = useSearch({ strict: false })
  const { signInWithApple } = useAuth()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const hasRunRef = useRef(false)

  useEffect(() => {
    // Prevent double-invocation in React StrictMode
    if (hasRunRef.current) return
    hasRunRef.current = true

    async function handleCallback() {
      const errorParam = extractStringParam(searchRaw, 'error')
      const idToken = extractStringParam(searchRaw, 'token')
      const encodedUser = extractStringParam(searchRaw, 'user')
      const returnedState = extractStringParam(searchRaw, 'state')

      // Check for Apple error
      if (errorParam) {
        setErrorMessage(`Apple sign-in error: ${errorParam}`)
        return
      }

      if (!idToken) {
        setErrorMessage('Invalid callback: missing token.')
        return
      }

      // CSRF state validation
      const storedState = sessionStorage.getItem(SESSION_KEYS.appleState)
      if (returnedState && storedState && returnedState !== storedState) {
        setErrorMessage('Security check failed: state mismatch.')
        return
      }

      // Retrieve raw nonce stored before redirect
      const rawNonce = sessionStorage.getItem(SESSION_KEYS.appleNonce) ?? ''

      // Clear CSRF values
      sessionStorage.removeItem(SESSION_KEYS.appleState)
      sessionStorage.removeItem(SESSION_KEYS.appleNonce)

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
        await navigate({ to: '/' })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Apple sign-in failed.'
        setErrorMessage(message)
      }
    }

    void handleCallback()
  }, [searchRaw, signInWithApple, navigate])

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
          <a href="/login" className="text-sm text-primary underline">
            Return to Login
          </a>
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
