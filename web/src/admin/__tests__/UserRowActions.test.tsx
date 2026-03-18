import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserRowActions } from '../users/UserRowActions';
import { AuthContext, type AuthContextValue } from '@/auth/AuthProvider';
import {
  mockAdminUser,
  mockRegularUser,
  mockDeactivatedUser,
  mockPurgedUser,
  makeAdminAuthContext,
} from './admin-test-helpers';

// Mock TanStack Router
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

function makeMockMutations() {
  return {
    patchRole: { isPending: false, variables: undefined, mutate: vi.fn() },
    deactivate: { isPending: false, mutate: vi.fn() },
    reactivate: { isPending: false, mutate: vi.fn() },
    purge: { isPending: false, mutate: vi.fn() },
  } as any;
}

function renderWithAuth(ui: React.ReactElement, ctx: AuthContextValue = makeAdminAuthContext()) {
  return render(<AuthContext.Provider value={ctx}>{ui}</AuthContext.Provider>);
}

describe('UserRowActions', () => {
  let mutations: ReturnType<typeof makeMockMutations>;
  let onAction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mutations = makeMockMutations();
    onAction = vi.fn();
  });

  it('renders role select with current role', () => {
    renderWithAuth(<UserRowActions row={mockRegularUser} mutations={mutations} onAction={onAction} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders Deactivate button for active user', () => {
    renderWithAuth(<UserRowActions row={mockRegularUser} mutations={mutations} onAction={onAction} />);
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeInTheDocument();
  });

  it('renders Reactivate button for deactivated user', () => {
    renderWithAuth(<UserRowActions row={mockDeactivatedUser} mutations={mutations} onAction={onAction} />);
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument();
  });

  it('calls onAction with deactivate type', async () => {
    renderWithAuth(<UserRowActions row={mockRegularUser} mutations={mutations} onAction={onAction} />);
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'deactivate', user: mockRegularUser });
  });

  it('calls onAction with purge type', async () => {
    renderWithAuth(<UserRowActions row={mockRegularUser} mutations={mutations} onAction={onAction} />);
    await userEvent.click(screen.getByRole('button', { name: 'Purge' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'purge', user: mockRegularUser });
  });

  it('disables all actions for purged user', () => {
    renderWithAuth(<UserRowActions row={mockPurgedUser} mutations={mutations} onAction={onAction} />);
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Purge' })).not.toBeInTheDocument();
  });

  it('disables all actions for own row (self-action guard)', () => {
    const selfRow = {
      ...mockRegularUser,
      id: mockAdminUser.id,
      role: 'admin' as const,
    };
    renderWithAuth(<UserRowActions row={selfRow} mutations={mutations} onAction={onAction} />);
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Purge' })).not.toBeInTheDocument();
  });
});
