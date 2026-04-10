import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useAuth } from '@/auth/useAuth';
import { LoadingSpinner } from '@/components/LoadingSpinner';

/**
 * `/admin` index — role-aware landing page.
 *
 * Admins land on ML Stats (their existing default). Curators land on
 * Photo Approvals, the only admin area they can access.
 *
 * The redirect happens at the component level (not `beforeLoad`) because
 * auth state is async and not part of the router context at load time —
 * same reason the layout guard is a `useEffect`.
 */
export const Route = createFileRoute('/_authenticated/admin/')({
  component: AdminIndexRedirect,
});

function AdminIndexRedirect() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading || !user) return;
    if (user.role === 'admin') {
      void navigate({ to: '/admin/ml', replace: true });
    } else if (user.role === 'curator') {
      void navigate({ to: '/admin/photo-approvals', replace: true });
    } else {
      // Unprivileged user hit /admin directly — bounce home. The admin
      // layout would also redirect, but we should not depend on parent
      // layout behavior for the unauthorized path.
      void navigate({ to: '/', replace: true });
    }
  }, [isLoading, user, navigate]);

  return <LoadingSpinner className="flex-1" />;
}
