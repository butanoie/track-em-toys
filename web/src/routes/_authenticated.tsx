import { createFileRoute, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useAuth } from '@/auth/useAuth';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: () => {
    // We handle redirects in the component for loading state support.
    // Route-level beforeLoad cannot check React state.
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useRouterState({ select: (s) => s.location });
  const navigate = useNavigate();

  // Refs let us read the latest navigate/href inside the effect without
  // including them in the dependency array. Including navigate (recreated
  // each render) or location.href (changes on every navigation) as deps
  // would cause an infinite redirect loop.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const hrefRef = useRef(location.href);
  hrefRef.current = location.href;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      void navigateRef.current({
        to: '/login',
        search: { redirect: hrefRef.current },
      });
    }
  }, [isLoading, isAuthenticated]);

  if (isLoading || !isAuthenticated) return <LoadingSpinner />;

  return <Outlet />;
}
