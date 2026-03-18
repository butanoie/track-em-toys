import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { extractGoogleCredential } from './google-auth';
import { initiateAppleSignIn } from './apple-auth';
import { useMe } from './hooks/useMe';
import { useLinkAccount } from './hooks/useLinkAccount';
import { useAuth } from './useAuth';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';

const PROVIDERS = ['google', 'apple'] as const;

function providerLabel(provider: string): string {
  return provider === 'google' ? 'Google' : 'Apple';
}

export function SettingsPage() {
  const { user, logout } = useAuth();
  const { data: me, isPending, isError } = useMe();
  const linkAccount = useLinkAccount();
  const [error, setError] = useState<string | null>(null);
  const [isAppleLinking, setIsAppleLinking] = useState(false);

  const linkedProviders = new Set(me?.linked_accounts.map((a) => a.provider));
  const unlinkedProviders = PROVIDERS.filter((p) => !linkedProviders.has(p));

  async function handleLinkGoogle(response: CredentialResponse) {
    setError(null);
    const credential = extractGoogleCredential(response);
    if (!credential) {
      setError('Google sign-in failed: no credential received.');
      return;
    }
    try {
      await linkAccount.mutateAsync({ provider: 'google', id_token: credential });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(err.body.error);
      } else {
        const message = err instanceof Error ? err.message : 'Failed to link Google account.';
        setError(message);
      }
    }
  }

  async function handleLinkApple() {
    setError(null);
    setIsAppleLinking(true);
    try {
      const result = await initiateAppleSignIn();
      await linkAccount.mutateAsync({
        provider: 'apple',
        id_token: result.idToken,
        nonce: result.rawNonce,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(err.body.error);
      } else {
        const message = err instanceof Error ? err.message : 'Failed to link Apple account.';
        setError(message);
      }
    } finally {
      setIsAppleLinking(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-foreground">Settings</h1>
          <div className="flex items-center gap-4">
            {user && (
              <span className="text-sm text-muted-foreground">{user.display_name ?? user.email ?? 'Collector'}</span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void logout();
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {error && (
          <div
            role="alert"
            className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Profile</CardTitle>
            <CardDescription>Your account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Name</span>
              <span className="text-sm">{user?.display_name ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Email</span>
              <span className="text-sm">{user?.email ?? '—'}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Linked Accounts</CardTitle>
            <CardDescription>Connect multiple sign-in providers to your account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isPending && <p className="text-sm text-muted-foreground">Loading accounts...</p>}

            {isError && <p className="text-sm text-destructive">Failed to load linked accounts.</p>}

            {me && (
              <>
                {me.linked_accounts.length > 0 && (
                  <div className="space-y-3">
                    {me.linked_accounts.map((account) => (
                      <div key={account.provider} className="flex items-center justify-between rounded-md border p-3">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium">{providerLabel(account.provider)}</span>
                          {account.email && <span className="text-sm text-muted-foreground">{account.email}</span>}
                        </div>
                        <Badge variant="secondary">Linked</Badge>
                      </div>
                    ))}
                  </div>
                )}

                {unlinkedProviders.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Link another provider to sign in with either account:
                    </p>
                    {unlinkedProviders.includes('google') && (
                      <div className="flex justify-center">
                        <GoogleLogin
                          onSuccess={(response) => {
                            void handleLinkGoogle(response);
                          }}
                          onError={() => setError('Google sign-in failed. Please try again.')}
                          useOneTap={false}
                          shape="rectangular"
                          size="large"
                          text="continue_with"
                        />
                      </div>
                    )}
                    {unlinkedProviders.includes('apple') && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          void handleLinkApple();
                        }}
                        disabled={isAppleLinking || linkAccount.isPending}
                        aria-label="Link Apple account"
                      >
                        {isAppleLinking ? 'Linking Apple account...' : 'Link Apple Account'}
                      </Button>
                    )}
                  </div>
                )}

                {me.linked_accounts.length === PROVIDERS.length && (
                  <p className="text-sm text-muted-foreground">All providers are linked.</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
