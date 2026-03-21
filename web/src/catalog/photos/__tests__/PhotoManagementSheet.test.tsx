import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PhotoManagementSheet } from '../PhotoManagementSheet';
import type { Photo } from '@/lib/zod-schemas';

vi.mock('../api', () => ({
  buildPhotoUrl: (url: string) => `http://localhost:3010/photos/${url}`,
  validateFile: () => null,
  uploadPhoto: vi.fn(),
  deletePhoto: vi.fn().mockResolvedValue(undefined),
  setPrimaryPhoto: vi.fn().mockResolvedValue({
    id: 'p-1',
    url: 'test-original.webp',
    caption: null,
    is_primary: true,
    sort_order: 0,
    status: 'approved',
  }),
  reorderPhotos: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/admin/components/ConfirmDialog', () => ({
  ConfirmDialog: ({
    open,
    title,
    onConfirm,
  }: {
    open: boolean;
    title: string;
    onConfirm: () => void;
    onOpenChange: (open: boolean) => void;
    description: string;
    confirmLabel: string;
    variant: string;
    isPending: boolean;
  }) =>
    open
      ? React.createElement(
          'div',
          { 'data-testid': 'confirm-dialog' },
          React.createElement('p', null, title),
          React.createElement('button', { onClick: onConfirm }, 'Confirm Delete')
        )
      : null,
}));

vi.mock('@/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-1', role: 'curator' }, isAuthenticated: true, isLoading: false }),
}));

const mockPhotos: Photo[] = [
  { id: 'p-1', url: 'item1/photo1-original.webp', caption: null, is_primary: true, sort_order: 0 },
  { id: 'p-2', url: 'item1/photo2-original.webp', caption: 'Side view', is_primary: false, sort_order: 1 },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('PhotoManagementSheet', () => {
  it('renders sheet with title and description when open', () => {
    render(
      <PhotoManagementSheet
        open={true}
        onOpenChange={vi.fn()}
        franchise="transformers"
        itemSlug="optimus-prime"
        itemName="Optimus Prime (G1)"
        photos={mockPhotos}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('Manage Photos')).toBeInTheDocument();
    expect(screen.getByText(/Optimus Prime \(G1\)/)).toBeInTheDocument();
    expect(screen.getByText(/2 photos/)).toBeInTheDocument();
  });

  it('renders drop zone', () => {
    render(
      <PhotoManagementSheet
        open={true}
        onOpenChange={vi.fn()}
        franchise="transformers"
        itemSlug="optimus-prime"
        itemName="Optimus Prime (G1)"
        photos={mockPhotos}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('Drop photos here')).toBeInTheDocument();
  });

  it('renders photo grid with correct count', () => {
    render(
      <PhotoManagementSheet
        open={true}
        onOpenChange={vi.fn()}
        franchise="transformers"
        itemSlug="optimus-prime"
        itemName="Optimus Prime (G1)"
        photos={mockPhotos}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('Photos')).toBeInTheDocument();
    expect(screen.getByText('(2)')).toBeInTheDocument();
  });

  it('renders primary badge on primary photo', () => {
    render(
      <PhotoManagementSheet
        open={true}
        onOpenChange={vi.fn()}
        franchise="transformers"
        itemSlug="optimus-prime"
        itemName="Optimus Prime (G1)"
        photos={mockPhotos}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByRole('status', { name: 'Primary photo' })).toBeInTheDocument();
  });

  it('renders set-primary button on non-primary photo', () => {
    render(
      <PhotoManagementSheet
        open={true}
        onOpenChange={vi.fn()}
        franchise="transformers"
        itemSlug="optimus-prime"
        itemName="Optimus Prime (G1)"
        photos={mockPhotos}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByLabelText('Set as primary photo')).toBeInTheDocument();
  });

  it('opens confirm dialog when delete button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <PhotoManagementSheet
        open={true}
        onOpenChange={vi.fn()}
        franchise="transformers"
        itemSlug="optimus-prime"
        itemName="Optimus Prime (G1)"
        photos={mockPhotos}
      />,
      { wrapper: createWrapper() }
    );

    const deleteButtons = screen.getAllByLabelText('Delete photo');
    await user.click(deleteButtons[0]);

    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete photo?')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <PhotoManagementSheet
        open={false}
        onOpenChange={vi.fn()}
        franchise="transformers"
        itemSlug="optimus-prime"
        itemName="Optimus Prime (G1)"
        photos={mockPhotos}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.queryByText('Manage Photos')).not.toBeInTheDocument();
  });

  it('shows empty state when no photos', () => {
    render(
      <PhotoManagementSheet
        open={true}
        onOpenChange={vi.fn()}
        franchise="transformers"
        itemSlug="optimus-prime"
        itemName="Optimus Prime (G1)"
        photos={[]}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('Drop photos here')).toBeInTheDocument();
    expect(screen.queryByText('Photos')).not.toBeInTheDocument();
  });

  it('renders 1 photo label correctly', () => {
    render(
      <PhotoManagementSheet
        open={true}
        onOpenChange={vi.fn()}
        franchise="transformers"
        itemSlug="optimus-prime"
        itemName="Optimus Prime (G1)"
        photos={[mockPhotos[0]]}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText(/1 photo/)).toBeInTheDocument();
  });
});
