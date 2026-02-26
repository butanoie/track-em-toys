import { createRootRoute, Outlet } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { useState } from 'react'
import { AuthProvider } from '@/auth/AuthProvider'
import { ApiError } from '@/lib/api-client'
import { ErrorBoundary } from '@/components/ErrorBoundary'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  // Stable per component lifecycle, not shared between test runs
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status === 401) return false
          return failureCount < 3
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <AuthProvider queryClientClear={() => queryClient.clear()}>
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </AuthProvider>
      </GoogleOAuthProvider>
    </QueryClientProvider>
  )
}
