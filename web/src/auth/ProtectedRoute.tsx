import { Navigate, Outlet } from '@tanstack/react-router'
import { useAuth } from './useAuth'

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

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) return <LoadingSpinner />
  if (!isAuthenticated) return <Navigate to="/login" />

  return <Outlet />
}
