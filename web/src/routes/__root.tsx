import { createRootRoute, Outlet } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider } from '@/auth/AuthProvider'
import { ApiError } from '@/lib/api-client'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status === 401) return false
        return failureCount < 3
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
})

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <AuthProvider queryClientClear={() => queryClient.clear()}>
          <Outlet />
        </AuthProvider>
      </GoogleOAuthProvider>
    </QueryClientProvider>
  )
}
