import { createFileRoute, redirect, Outlet, useRouterState } from '@tanstack/react-router'
import { useAuth } from '@/auth/useAuth'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: () => {
    // We handle redirects in the component for loading state support.
    // Route-level beforeLoad cannot check React state.
  },
  component: AuthenticatedLayout,
})

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div
        role="status"
        aria-label="Loading"
        className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"
      />
    </div>
  )
}

function AuthenticatedLayout() {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useRouterState({ select: s => s.location })

  if (isLoading) return <LoadingSpinner />

  if (!isAuthenticated) {
    throw redirect({
      to: '/login',
      search: { redirect: location.href },
    })
  }

  return <Outlet />
}
