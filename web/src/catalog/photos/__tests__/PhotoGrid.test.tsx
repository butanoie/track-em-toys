import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PhotoGrid } from '../PhotoGrid';
import type { Photo } from '@/lib/zod-schemas';

vi.mock('../api', () => ({
  buildPhotoUrl: (url: string) => `http://localhost:3010/photos/${url}`,
}));

const mockPhotos: Photo[] = [
  { id: 'p-1', url: 'item1/photo1-original.webp', caption: null, is_primary: true, sort_order: 0 },
  { id: 'p-2', url: 'item1/photo2-original.webp', caption: 'Side view', is_primary: false, sort_order: 1 },
  { id: 'p-3', url: 'item1/photo3-original.webp', caption: null, is_primary: false, sort_order: 2 },
];

describe('PhotoGrid', () => {
  it('returns null when photos array is empty', () => {
    const { container } = render(
      <PhotoGrid photos={[]} onReorder={vi.fn()} onSetPrimary={vi.fn()} onDelete={vi.fn()} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders photo count in heading', () => {
    render(<PhotoGrid photos={mockPhotos} onReorder={vi.fn()} onSetPrimary={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText('Photos')).toBeInTheDocument();
    expect(screen.getByText('(3)')).toBeInTheDocument();
  });

  it('renders primary badge on the primary photo', () => {
    render(<PhotoGrid photos={mockPhotos} onReorder={vi.fn()} onSetPrimary={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByRole('status', { name: 'Primary photo' })).toBeInTheDocument();
  });

  it('renders set-primary buttons for non-primary photos', () => {
    render(<PhotoGrid photos={mockPhotos} onReorder={vi.fn()} onSetPrimary={vi.fn()} onDelete={vi.fn()} />);

    const setPrimaryButtons = screen.getAllByLabelText('Set as primary photo');
    expect(setPrimaryButtons).toHaveLength(2);
  });

  it('renders delete buttons for all photos', () => {
    render(<PhotoGrid photos={mockPhotos} onReorder={vi.fn()} onSetPrimary={vi.fn()} onDelete={vi.fn()} />);

    const deleteButtons = screen.getAllByLabelText('Delete photo');
    expect(deleteButtons).toHaveLength(3);
  });

  it('renders help text when more than one photo', () => {
    render(<PhotoGrid photos={mockPhotos} onReorder={vi.fn()} onSetPrimary={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText(/Drag to reorder/)).toBeInTheDocument();
  });

  it('does not render help text for single photo', () => {
    render(<PhotoGrid photos={[mockPhotos[0]]} onReorder={vi.fn()} onSetPrimary={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.queryByText(/Drag to reorder/)).not.toBeInTheDocument();
  });

  it('renders images with buildPhotoUrl', () => {
    render(<PhotoGrid photos={mockPhotos} onReorder={vi.fn()} onSetPrimary={vi.fn()} onDelete={vi.fn()} />);

    const images = screen.getAllByRole('img');
    expect(images[0]).toHaveAttribute('src', 'http://localhost:3010/photos/item1/photo1-original.webp');
  });

  it('uses caption as alt text when available', () => {
    render(<PhotoGrid photos={mockPhotos} onReorder={vi.fn()} onSetPrimary={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByAltText('Side view')).toBeInTheDocument();
  });

  it('calls onSetPrimary when set-primary button is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const onSetPrimary = vi.fn();

    render(<PhotoGrid photos={mockPhotos} onReorder={vi.fn()} onSetPrimary={onSetPrimary} onDelete={vi.fn()} />);

    const buttons = screen.getAllByLabelText('Set as primary photo');
    await user.click(buttons[0]);

    expect(onSetPrimary).toHaveBeenCalledWith('p-2');
  });

  it('calls onDelete when delete button is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const onDelete = vi.fn();

    render(<PhotoGrid photos={mockPhotos} onReorder={vi.fn()} onSetPrimary={vi.fn()} onDelete={onDelete} />);

    const buttons = screen.getAllByLabelText('Delete photo');
    await user.click(buttons[0]);

    expect(onDelete).toHaveBeenCalledWith('p-1');
  });

  it('does not render contribute buttons when onContribute is not provided', () => {
    render(<PhotoGrid photos={mockPhotos} onReorder={vi.fn()} onSetPrimary={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.queryByLabelText('Contribute photo to catalog')).not.toBeInTheDocument();
  });

  it('renders contribute buttons when onContribute is provided and contribution_status is null', () => {
    const photosWithStatus = mockPhotos.map((p) => ({ ...p, contribution_status: null }));
    render(
      <PhotoGrid
        photos={photosWithStatus}
        onReorder={vi.fn()}
        onSetPrimary={vi.fn()}
        onDelete={vi.fn()}
        onContribute={vi.fn()}
      />
    );

    expect(screen.getAllByLabelText('Contribute photo to catalog')).toHaveLength(3);
  });

  it('renders "Submitted" badge for pending contributions', () => {
    const photosWithStatus = [
      { ...mockPhotos[0], contribution_status: 'pending' as const },
      { ...mockPhotos[1], contribution_status: null },
    ];
    render(
      <PhotoGrid
        photos={photosWithStatus}
        onReorder={vi.fn()}
        onSetPrimary={vi.fn()}
        onDelete={vi.fn()}
        onContribute={vi.fn()}
      />
    );

    expect(screen.getByRole('status', { name: 'Photo submitted for review' })).toBeInTheDocument();
    expect(screen.getAllByLabelText('Contribute photo to catalog')).toHaveLength(1);
  });

  it('renders "Shared" badge for approved contributions', () => {
    const photosWithStatus = [{ ...mockPhotos[0], contribution_status: 'approved' as const }];
    render(
      <PhotoGrid
        photos={photosWithStatus}
        onReorder={vi.fn()}
        onSetPrimary={vi.fn()}
        onDelete={vi.fn()}
        onContribute={vi.fn()}
      />
    );

    expect(screen.getByRole('status', { name: 'Photo shared to catalog' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Contribute photo to catalog')).not.toBeInTheDocument();
  });

  it('renders contribute button for rejected photos (re-contribution allowed)', () => {
    const photosWithStatus = [{ ...mockPhotos[0], contribution_status: 'rejected' as const }];
    render(
      <PhotoGrid
        photos={photosWithStatus}
        onReorder={vi.fn()}
        onSetPrimary={vi.fn()}
        onDelete={vi.fn()}
        onContribute={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Contribute photo to catalog')).toBeInTheDocument();
  });

  it('calls onContribute with correct photoId when contribute button is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const onContribute = vi.fn();
    const photosWithStatus = mockPhotos.map((p) => ({ ...p, contribution_status: null }));

    render(
      <PhotoGrid
        photos={photosWithStatus}
        onReorder={vi.fn()}
        onSetPrimary={vi.fn()}
        onDelete={vi.fn()}
        onContribute={onContribute}
      />
    );

    const buttons = screen.getAllByLabelText('Contribute photo to catalog');
    await user.click(buttons[0]);

    expect(onContribute).toHaveBeenCalledWith('p-1');
  });
});
