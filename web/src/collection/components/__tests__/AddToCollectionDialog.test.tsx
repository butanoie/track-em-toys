import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddToCollectionDialog } from '../AddToCollectionDialog';
import type { CollectionMutations } from '@/collection/hooks/useCollectionMutations';
import type { CollectionItem } from '@/lib/zod-schemas';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockUploadCollectionPhoto = vi.fn();
const mockContributeCollectionPhoto = vi.fn();
vi.mock('@/collection/photos/api', () => ({
  uploadCollectionPhoto: (...args: unknown[]) => mockUploadCollectionPhoto(...args),
  contributeCollectionPhoto: (...args: unknown[]) => mockContributeCollectionPhoto(...args),
}));

// jsdom lacks createObjectURL/revokeObjectURL
beforeEach(() => {
  Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:mock-url'),
    revokeObjectURL: vi.fn(),
  });
  vi.clearAllMocks();
});

function makeMutations(overrides: Partial<{ addItem: CollectionItem }> = {}): CollectionMutations {
  const defaultItem: CollectionItem = {
    id: 'new-item-1',
    item_id: 'cat-item-1',
    user_id: 'u-1',
    package_condition: 'unknown',
    item_condition: 7,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
  } as unknown as CollectionItem;

  const item = overrides.addItem ?? defaultItem;
  const add = {
    mutate: vi.fn(
      (_payload: unknown, opts?: { onSuccess?: (data: CollectionItem) => void; onError?: (e: Error) => void }) => {
        opts?.onSuccess?.(item);
      }
    ),
    isPending: false,
  };

  return {
    add,
    patch: { mutate: vi.fn(), isPending: false },
    remove: { mutate: vi.fn(), isPending: false },
    restore: { mutate: vi.fn(), isPending: false },
  } as unknown as CollectionMutations;
}

function makePhotoFile(name = 'optimus.jpg', sizeBytes = 2048): File {
  const file = new File(['x'.repeat(sizeBytes)], name, { type: 'image/jpeg' });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  itemId: 'cat-item-1',
  itemName: 'Optimus Prime',
  alreadyOwned: false,
  mutations: makeMutations(),
};

describe('AddToCollectionDialog', () => {
  it('does not render Photo Options section when photoFile is not provided', () => {
    render(<AddToCollectionDialog {...baseProps} mutations={makeMutations()} />);

    expect(screen.queryByText('Photo Options')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Save this photo/)).not.toBeInTheDocument();
  });

  it('renders Photo Options with save checked and intent defaulting to training_only', () => {
    render(<AddToCollectionDialog {...baseProps} mutations={makeMutations()} photoFile={makePhotoFile()} />);

    expect(screen.getByText('Photo Options')).toBeInTheDocument();
    expect(screen.getByLabelText(/Save this photo/)).toBeChecked();

    // Default = 'training_only' (privacy + editorial defaults — the catalog is curated)
    expect(screen.getByRole('radio', { name: /Training only/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Don.?t contribute/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /Catalog \+ training/ })).not.toBeChecked();
  });

  it('renders photo preview with filename and formatted size', () => {
    render(
      <AddToCollectionDialog
        {...baseProps}
        mutations={makeMutations()}
        photoFile={makePhotoFile('shockwave.jpg', 1024 * 50)}
      />
    );

    expect(screen.getByAltText('Scanned photo preview')).toHaveAttribute('src', 'blob:mock-url');
    expect(screen.getByText('shockwave.jpg')).toBeInTheDocument();
    expect(screen.getByText('50 KB')).toBeInTheDocument();
  });

  it('hides intent radio when save is unchecked and shows inline disclaimer by default (training_only)', async () => {
    const user = userEvent.setup();
    render(<AddToCollectionDialog {...baseProps} mutations={makeMutations()} photoFile={makePhotoFile()} />);

    // Radio visible on open, disclaimer visible because default intent ≠ 'none'
    expect(screen.getByRole('radio', { name: /Training only/ })).toBeInTheDocument();
    expect(screen.getByText(/perpetual, non-exclusive, royalty-free license/)).toBeInTheDocument();

    // Uncheck save → radio disappears
    await user.click(screen.getByLabelText(/Save this photo/));
    expect(screen.queryByRole('radio', { name: /Training only/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/perpetual, non-exclusive, royalty-free license/)).not.toBeInTheDocument();
  });

  it('hides inline disclaimer when user picks "Don\'t contribute"', async () => {
    const user = userEvent.setup();
    render(<AddToCollectionDialog {...baseProps} mutations={makeMutations()} photoFile={makePhotoFile()} />);

    // Default intent = training_only, disclaimer visible
    expect(screen.getByText(/perpetual, non-exclusive, royalty-free license/)).toBeInTheDocument();

    // Pick "Don't contribute" → disclaimer hidden
    await user.click(screen.getByRole('radio', { name: /Don.?t contribute/ }));
    expect(screen.queryByText(/perpetual, non-exclusive, royalty-free license/)).not.toBeInTheDocument();
  });

  it('resets intent to training_only default when save is toggled back on', async () => {
    const user = userEvent.setup();
    render(<AddToCollectionDialog {...baseProps} mutations={makeMutations()} photoFile={makePhotoFile()} />);

    // Switch to catalog_and_training
    await user.click(screen.getByRole('radio', { name: /Catalog \+ training/ }));
    expect(screen.getByRole('radio', { name: /Catalog \+ training/ })).toBeChecked();

    // Uncheck save, then re-check → intent should be reset to training_only
    await user.click(screen.getByLabelText(/Save this photo/));
    await user.click(screen.getByLabelText(/Save this photo/));

    expect(screen.getByRole('radio', { name: /Training only/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Catalog \+ training/ })).not.toBeChecked();
  });

  it('creates item only (no upload) when no photoFile is provided', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const mutations = makeMutations();

    render(<AddToCollectionDialog {...baseProps} onOpenChange={onOpenChange} mutations={mutations} />);
    await user.click(screen.getByRole('button', { name: 'Add to Collection' }));

    expect(mutations.add.mutate).toHaveBeenCalled();
    expect(mockUploadCollectionPhoto).not.toHaveBeenCalled();
    expect(mockContributeCollectionPhoto).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('uploads photo after item creation when save is checked and user opts out of contribute', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const file = makePhotoFile();
    mockUploadCollectionPhoto.mockResolvedValue([{ id: 'photo-1', url: 'collection/u/c/p-original.webp' }]);

    render(
      <AddToCollectionDialog {...baseProps} onOpenChange={onOpenChange} mutations={makeMutations()} photoFile={file} />
    );

    // Explicit opt-out of contribution so only upload runs
    await user.click(screen.getByRole('radio', { name: /Don.?t contribute/ }));
    await user.click(screen.getByRole('button', { name: 'Add to Collection' }));

    await waitFor(() => {
      expect(mockUploadCollectionPhoto).toHaveBeenCalledWith('new-item-1', file, expect.any(Function));
    });
    expect(mockContributeCollectionPhoto).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('uploads then contributes with training_only intent by default', async () => {
    const { toast } = await import('sonner');
    const user = userEvent.setup();
    const file = makePhotoFile();
    mockUploadCollectionPhoto.mockResolvedValue([{ id: 'photo-1', url: 'collection/u/c/p-original.webp' }]);
    mockContributeCollectionPhoto.mockResolvedValue('contribution-1');

    render(<AddToCollectionDialog {...baseProps} mutations={makeMutations()} photoFile={file} />);

    // Default intent is training_only — no radio click needed
    await user.click(screen.getByRole('button', { name: 'Add to Collection' }));

    await waitFor(() => {
      expect(mockContributeCollectionPhoto).toHaveBeenCalledWith('new-item-1', 'photo-1', '1.0', 'training_only');
    });
    expect(toast.success).toHaveBeenCalledWith('Photo contributed for review');
  });

  it('uploads then contributes with catalog_and_training when user picks the superset', async () => {
    const user = userEvent.setup();
    const file = makePhotoFile();
    mockUploadCollectionPhoto.mockResolvedValue([{ id: 'photo-1', url: 'collection/u/c/p-original.webp' }]);
    mockContributeCollectionPhoto.mockResolvedValue('contribution-1');

    render(<AddToCollectionDialog {...baseProps} mutations={makeMutations()} photoFile={file} />);

    await user.click(screen.getByRole('radio', { name: /Catalog \+ training/ }));
    await user.click(screen.getByRole('button', { name: 'Add to Collection' }));

    await waitFor(() => {
      expect(mockContributeCollectionPhoto).toHaveBeenCalledWith(
        'new-item-1',
        'photo-1',
        '1.0',
        'catalog_and_training'
      );
    });
  });

  it('uploads but does NOT contribute when user picks "Don\'t contribute"', async () => {
    const user = userEvent.setup();
    const file = makePhotoFile();
    mockUploadCollectionPhoto.mockResolvedValue([{ id: 'photo-1', url: 'collection/u/c/p-original.webp' }]);

    render(<AddToCollectionDialog {...baseProps} mutations={makeMutations()} photoFile={file} />);

    await user.click(screen.getByRole('radio', { name: /Don.?t contribute/ }));
    await user.click(screen.getByRole('button', { name: 'Add to Collection' }));

    await waitFor(() => {
      expect(mockUploadCollectionPhoto).toHaveBeenCalled();
    });
    // Contribute endpoint never called — 'none' is client-side-only
    expect(mockContributeCollectionPhoto).not.toHaveBeenCalled();
  });

  it('skips upload when save is unchecked even with photoFile present', async () => {
    const user = userEvent.setup();
    const file = makePhotoFile();

    render(<AddToCollectionDialog {...baseProps} mutations={makeMutations()} photoFile={file} />);

    await user.click(screen.getByLabelText(/Save this photo/));
    await user.click(screen.getByRole('button', { name: 'Add to Collection' }));

    expect(mockUploadCollectionPhoto).not.toHaveBeenCalled();
    expect(mockContributeCollectionPhoto).not.toHaveBeenCalled();
  });

  it('shows error toast but still closes when upload fails (item creation persists)', async () => {
    const { toast } = await import('sonner');
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const file = makePhotoFile();
    mockUploadCollectionPhoto.mockRejectedValue(new Error('Network error'));

    render(
      <AddToCollectionDialog {...baseProps} onOpenChange={onOpenChange} mutations={makeMutations()} photoFile={file} />
    );

    await user.click(screen.getByRole('button', { name: 'Add to Collection' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Network error');
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows contribute error but keeps upload success when contribute fails', async () => {
    const { toast } = await import('sonner');
    const user = userEvent.setup();
    const file = makePhotoFile();
    mockUploadCollectionPhoto.mockResolvedValue([{ id: 'photo-1', url: 'x' }]);
    mockContributeCollectionPhoto.mockRejectedValue(new Error('Already contributed'));

    render(<AddToCollectionDialog {...baseProps} mutations={makeMutations()} photoFile={file} />);

    // Default intent = training_only → contribute fires automatically
    await user.click(screen.getByRole('button', { name: 'Add to Collection' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Already contributed');
    });
    // Photo upload still happened
    expect(mockUploadCollectionPhoto).toHaveBeenCalled();
  });
});
