import { GoogleLogin, type CredentialResponse } from '@react-oauth/google'
import { extractGoogleCredential } from './google-auth'
import { initiateAppleSignIn } from './apple-auth'
import { useAuth } from './useAuth'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Route } from '@/routes/login'

export function LoginPage() {
  const { signInWithGoogle } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [isAppleLoading, setIsAppleLoading] = useState(false)
  const navigate = useNavigate()
  const { redirect: redirectTo } = Route.useSearch()

  async function handleGoogleSuccess(response: CredentialResponse) {
    setError(null)
    const credential = extractGoogleCredential(response)
    if (!credential) {
      setError('Google sign-in failed: no credential received.')
      return
    }
    try {
      await signInWithGoogle(credential)
      await navigate({ to: redirectTo ?? '/' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed.'
      setError(message)
    }
  }

  function handleGoogleError() {
    setError('Google sign-in failed. Please try again.')
  }

  async function handleAppleSignIn() {
    setError(null)
    setIsAppleLoading(true)
    try {
      await initiateAppleSignIn()
      // With usePopup: false the SDK triggers a full-page redirect and this line
      // is never reached under normal circumstances. If it is reached, the redirect
      // did not happen — surface an error so the user is not left confused with a
      // silently re-enabled button and no feedback.
      setError('Apple sign-in did not complete. Please try again.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Apple sign-in failed.'
      setError(message)
    } finally {
      setIsAppleLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-8 p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Track&apos;em Toys
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to manage your toy collection
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={(response) => { void handleGoogleSuccess(response) }}
              onError={handleGoogleError}
              useOneTap={false}
              shape="rectangular"
              size="large"
              width="100%"
            />
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => { void handleAppleSignIn() }}
            disabled={isAppleLoading}
            aria-label="Sign in with Apple"
          >
            {isAppleLoading ? 'Redirecting to Apple...' : 'Sign in with Apple'}
          </Button>
        </div>
      </div>
    </div>
  )
}
