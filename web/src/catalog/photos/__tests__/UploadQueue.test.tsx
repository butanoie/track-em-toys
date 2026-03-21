import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UploadQueue } from '../UploadQueue';
import type { UploadItem } from '../usePhotoUpload';

describe('UploadQueue', () => {
  it('returns null when items array is empty', () => {
    const { container } = render(<UploadQueue items={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders queued item with filename and circle icon', () => {
    const items: UploadItem[] = [{ id: '1', fileName: 'photo.jpg', status: 'queued', progress: 0 }];
    render(<UploadQueue items={items} />);

    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
    expect(screen.getByLabelText('Queued')).toBeInTheDocument();
  });

  it('renders uploading item with progress bar and percentage', () => {
    const items: UploadItem[] = [{ id: '1', fileName: 'photo.jpg', status: 'uploading', progress: 42 }];
    render(<UploadQueue items={items} />);

    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByLabelText('Uploading photo.jpg')).toBeInTheDocument();
  });

  it('renders done item with checkmark', () => {
    const items: UploadItem[] = [{ id: '1', fileName: 'photo.jpg', status: 'done', progress: 100 }];
    render(<UploadQueue items={items} />);

    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
    expect(screen.getByLabelText('Upload complete')).toBeInTheDocument();
  });

  it('renders error item with error message and alert role', () => {
    const items: UploadItem[] = [
      { id: '1', fileName: 'photo.jpg', status: 'error', progress: 0, errorMessage: 'File too large' },
    ];
    render(<UploadQueue items={items} />);

    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('File too large');
    expect(screen.getByLabelText('Upload failed')).toBeInTheDocument();
  });

  it('renders multiple items in order', () => {
    const items: UploadItem[] = [
      { id: '1', fileName: 'first.jpg', status: 'done', progress: 100 },
      { id: '2', fileName: 'second.jpg', status: 'uploading', progress: 50 },
      { id: '3', fileName: 'third.jpg', status: 'queued', progress: 0 },
    ];
    render(<UploadQueue items={items} />);

    expect(screen.getByText('first.jpg')).toBeInTheDocument();
    expect(screen.getByText('second.jpg')).toBeInTheDocument();
    expect(screen.getByText('third.jpg')).toBeInTheDocument();
  });

  it('has accessible region with live announcements', () => {
    const items: UploadItem[] = [{ id: '1', fileName: 'photo.jpg', status: 'uploading', progress: 10 }];
    render(<UploadQueue items={items} />);

    const region = screen.getByRole('region', { name: 'Upload progress' });
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  it('shows default error message when errorMessage is undefined', () => {
    const items: UploadItem[] = [{ id: '1', fileName: 'photo.jpg', status: 'error', progress: 0 }];
    render(<UploadQueue items={items} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Upload failed');
  });
});
