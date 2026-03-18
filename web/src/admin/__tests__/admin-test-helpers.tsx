import React from 'react';
import { vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContext, type AuthContextValue } from '@/auth/AuthProvider';
import type { AdminUserRow } from '@/lib/zod-schemas';

export const mockAdminUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'admin@example.com',
  display_name: 'Admin User',
  avatar_url: null,
  role: 'admin' as const,
};

export const mockRegularUser: AdminUserRow = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  email: 'user@example.com',
  display_name: 'Regular User',
  avatar_url: null,
  role: 'user',
  deactivated_at: null,
  deleted_at: null,
  created_at: '2026-01-15T10:00:00.000Z',
};

export const mockCuratorUser: AdminUserRow = {
  id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  email: 'curator@example.com',
  display_name: 'Curator User',
  avatar_url: null,
  role: 'curator',
  deactivated_at: null,
  deleted_at: null,
  created_at: '2026-02-10T10:00:00.000Z',
};

export const mockDeactivatedUser: AdminUserRow = {
  id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
  email: 'deactivated@example.com',
  display_name: 'Deactivated User',
  avatar_url: null,
  role: 'user',
  deactivated_at: '2026-03-01T10:00:00.000Z',
  deleted_at: null,
  created_at: '2026-01-01T10:00:00.000Z',
};

export const mockPurgedUser: AdminUserRow = {
  id: 'd4e5f6a7-b8c9-0123-defa-234567890123',
  email: null,
  display_name: null,
  avatar_url: null,
  role: 'user',
  deactivated_at: '2026-03-01T10:00:00.000Z',
  deleted_at: '2026-03-15T10:00:00.000Z',
  created_at: '2025-12-01T10:00:00.000Z',
};

export function makeAdminAuthContext(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: mockAdminUser,
    isAuthenticated: true,
    isLoading: false,
    signInWithGoogle: vi.fn(),
    signInWithApple: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  };
}

export function createTestWrapper(ctx?: AuthContextValue) {
  const authCtx = ctx ?? makeAdminAuthContext();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return function TestWrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={authCtx}>{children}</AuthContext.Provider>
      </QueryClientProvider>
    );
  };
}
