import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_authenticated/')({
  component: Dashboard,
})

function Dashboard() {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-foreground">Track&apos;em Toys</h1>
          <div className="flex items-center gap-4">
            {user && (
              <span className="text-sm text-muted-foreground">
                {user.display_name ?? user.email ?? 'Collector'}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => { void logout() }}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-16">
          <h2 className="text-2xl font-bold text-foreground">Your Collection</h2>
          <p className="mt-2 text-muted-foreground">
            Your toy catalog will appear here.
          </p>
        </div>
      </main>
    </div>
  )
}
