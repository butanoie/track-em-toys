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
});
