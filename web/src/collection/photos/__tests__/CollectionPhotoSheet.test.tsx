import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CollectionPhotoSheet } from '../CollectionPhotoSheet';
import type { CollectionPhotoListItem } from '@/lib/zod-schemas';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/catalog/photos/api', () => ({
  buildPhotoUrl: (url: string) => `http://photos/${url}`,
}));

const mockListCollectionPhotos = vi.fn();
const mockContributeCollectionPhoto = vi.fn();
const mockDeleteCollectionPhoto = vi.fn();
const mockSetPrimaryCollectionPhoto = vi.fn();
const mockReorderCollectionPhotos = vi.fn();
const mockRevokeCollectionPhotoContribution = vi.fn();

vi.mock('../api', () => ({
  listCollectionPhotos: (...args: unknown[]) => mockListCollectionPhotos(...args),
  uploadCollectionPhoto: vi.fn(),
  validateFile: () => null,
  deleteCollectionPhoto: (...args: unknown[]) => mockDeleteCollectionPhoto(...args),
  setPrimaryCollectionPhoto: (...args: unknown[]) => mockSetPrimaryCollectionPhoto(...args),
  reorderCollectionPhotos: (...args: unknown[]) => mockReorderCollectionPhotos(...args),
  contributeCollectionPhoto: (...args: unknown[]) => mockContributeCollectionPhoto(...args),
  revokeCollectionPhotoContribution: (...args: unknown[]) => mockRevokeCollectionPhotoContribution(...args),
  buildPhotoUrl: (url: string) => `http://photos/${url}`,
  DuplicateUploadError: class extends Error {
    matchedId: string;
    matchedUrl: string;
    constructor(id: string, url: string) {
      super('Duplicate');
      this.matchedId = id;
      this.matchedUrl = url;
    }
  },
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

vi.mock('../ContributeDialog', () => ({
  ContributeDialog: ({
    open,
    onConfirm,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    photoUrl: string | null;
    onConfirm: () => void;
    isPending: boolean;
  }) =>
    open
      ? React.createElement(
          'div',
          { 'data-testid': 'contribute-dialog', style: { pointerEvents: 'auto' } },
          React.createElement('button', { onClick: onConfirm }, 'Confirm Contribute')
        )
      : null,
}));

const mockPhotos: CollectionPhotoListItem[] = [
  {
    id: 'p-1',
    url: 'collection/u1/c1/p1-original.webp',
    caption: null,
    is_primary: true,
    sort_order: 0,
    contribution_status: null,
  },
  {
    id: 'p-2',
    url: 'collection/u1/c1/p2-original.webp',
    caption: null,
    is_primary: false,
    sort_order: 1,
    contribution_status: 'pending',
  },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('CollectionPhotoSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListCollectionPhotos.mockResolvedValue(mockPhotos);
  });

  it('renders sheet with title and photo count when open', async () => {
    render(
      <CollectionPhotoSheet
        open={true}
        onOpenChange={vi.fn()}
        collectionItemId="c-1"
        collectionItemName="Optimus Prime"
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText('Manage Photos')).toBeInTheDocument();
    });
    expect(screen.getByText(/Optimus Prime/)).toBeInTheDocument();
  });

  it('fetches photos when sheet opens', async () => {
    render(
      <CollectionPhotoSheet
        open={true}
        onOpenChange={vi.fn()}
        collectionItemId="c-1"
        collectionItemName="Optimus Prime"
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(mockListCollectionPhotos).toHaveBeenCalledWith('c-1');
    });
  });

  it('renders contribute button for non-contributed photos', async () => {
    render(
      <CollectionPhotoSheet
        open={true}
        onOpenChange={vi.fn()}
        collectionItemId="c-1"
        collectionItemName="Optimus Prime"
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Contribute photo to catalog')).toBeInTheDocument();
    });
  });

  it('renders "Submitted" badge for contributed photos', async () => {
    render(
      <CollectionPhotoSheet
        open={true}
        onOpenChange={vi.fn()}
        collectionItemId="c-1"
        collectionItemName="Optimus Prime"
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Photo submitted for review' })).toBeInTheDocument();
    });
  });

  it('opens ContributeDialog when contribute button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <CollectionPhotoSheet
        open={true}
        onOpenChange={vi.fn()}
        collectionItemId="c-1"
        collectionItemName="Optimus Prime"
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Contribute photo to catalog')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Contribute photo to catalog'));

    expect(screen.getByTestId('contribute-dialog')).toBeInTheDocument();
  });

  it('calls contribute API and shows success toast on confirm', async () => {
    const { toast } = await import('sonner');
    const user = userEvent.setup();
    mockContributeCollectionPhoto.mockResolvedValue('contrib-1');

    render(
      <CollectionPhotoSheet
        open={true}
        onOpenChange={vi.fn()}
        collectionItemId="c-1"
        collectionItemName="Optimus Prime"
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Contribute photo to catalog')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('Contribute photo to catalog'));
    await user.click(screen.getByText('Confirm Contribute'));

    await waitFor(() => {
      expect(mockContributeCollectionPhoto).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('Photo contributed for review');
    });
  });
});
