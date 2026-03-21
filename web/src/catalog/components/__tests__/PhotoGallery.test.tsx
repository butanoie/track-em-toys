import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhotoGallery } from '../PhotoGallery';

const mockPhotos = [
  { id: 'p-1', url: '/photo-1.jpg', caption: 'Front view', is_primary: true, sort_order: 1 },
  { id: 'p-2', url: '/photo-2.jpg', caption: 'Side view', is_primary: false, sort_order: 2 },
  { id: 'p-3', url: '/photo-3.jpg', caption: null, is_primary: false, sort_order: 3 },
];

// Suppress React/Radix Dialog warnings in jsdom
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('PhotoGallery', () => {
  it('returns null when photos is empty', () => {
    const { container } = render(<PhotoGallery photos={[]} itemName="Test Item" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders displayed photo with correct aria-label', () => {
    render(<PhotoGallery photos={mockPhotos} itemName="Optimus Prime" />);
    expect(screen.getByRole('button', { name: 'Enlarge photo: Front view' })).toBeInTheDocument();
  });

  it('uses itemName when caption is null for displayed photo', () => {
    const photos = [{ id: 'p-1', url: '/photo.jpg', caption: null, is_primary: true, sort_order: 1 }];
    render(<PhotoGallery photos={photos} itemName="Optimus Prime" />);
    expect(screen.getByRole('button', { name: 'Enlarge photo: Optimus Prime' })).toBeInTheDocument();
  });

  it('renders thumbnail strip when photos.length > 1', () => {
    render(<PhotoGallery photos={mockPhotos} itemName="Optimus Prime" />);
    expect(screen.getByRole('button', { name: 'View photo 1: Front view' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View photo 2: Side view' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View photo 3: Optimus Prime' })).toBeInTheDocument();
  });

  it('does not render thumbnails for single photo', () => {
    const photos = [mockPhotos[0]];
    render(<PhotoGallery photos={photos} itemName="Optimus Prime" />);
    expect(screen.queryByRole('button', { name: /View photo 1/ })).not.toBeInTheDocument();
  });

  it('clicking thumbnail changes displayed photo without opening lightbox', async () => {
    render(<PhotoGallery photos={mockPhotos} itemName="Optimus Prime" />);
    await userEvent.click(screen.getByRole('button', { name: 'View photo 2: Side view' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enlarge photo: Side view' })).toBeInTheDocument();
  });

  it('clicking displayed photo opens lightbox', async () => {
    render(<PhotoGallery photos={mockPhotos} itemName="Optimus Prime" />);
    await userEvent.click(screen.getByRole('button', { name: 'Enlarge photo: Front view' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('clicking displayed photo opens lightbox at selected index', async () => {
    render(<PhotoGallery photos={mockPhotos} itemName="Optimus Prime" />);
    await userEvent.click(screen.getByRole('button', { name: 'View photo 2: Side view' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enlarge photo: Side view' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('Previous wraps from first photo to last', async () => {
    render(<PhotoGallery photos={mockPhotos} itemName="Optimus Prime" />);
    await userEvent.click(screen.getByRole('button', { name: 'Enlarge photo: Front view' }));
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Previous photo' }));
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
  });

  it('Next wraps from last photo to first', async () => {
    render(<PhotoGallery photos={mockPhotos} itemName="Optimus Prime" />);
    await userEvent.click(screen.getByRole('button', { name: 'View photo 3: Optimus Prime' }));
    await userEvent.click(screen.getByRole('button', { name: /Enlarge photo/ }));
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('clicking Next advances to next photo', async () => {
    render(<PhotoGallery photos={mockPhotos} itemName="Optimus Prime" />);
    await userEvent.click(screen.getByRole('button', { name: 'Enlarge photo: Front view' }));
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('clicking Previous goes back', async () => {
    render(<PhotoGallery photos={mockPhotos} itemName="Optimus Prime" />);
    await userEvent.click(screen.getByRole('button', { name: 'View photo 2: Side view' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enlarge photo: Side view' }));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Previous photo' }));
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('renders magnifying glass icon on displayed photo', () => {
    render(<PhotoGallery photos={mockPhotos} itemName="Optimus Prime" />);
    const enlargeButton = screen.getByRole('button', { name: 'Enlarge photo: Front view' });
    expect(enlargeButton.querySelector('svg')).toBeInTheDocument();
  });
});
