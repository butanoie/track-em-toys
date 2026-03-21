import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DropZone } from '../DropZone';

vi.mock('../api', () => ({
  buildPhotoUrl: (url: string) => url,
  validateFile: () => null,
}));

describe('DropZone', () => {
  it('renders default state with upload instructions', () => {
    render(<DropZone onFilesSelected={vi.fn()} />);

    expect(screen.getByText('Drop photos here')).toBeInTheDocument();
    expect(screen.getByText('select files')).toBeInTheDocument();
    expect(screen.getByText(/JPEG, PNG, WebP, GIF/)).toBeInTheDocument();
  });

  it('renders the hidden file input with correct accept types', () => {
    render(<DropZone onFilesSelected={vi.fn()} />);

    const input = document.getElementById('photo-file-input') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.type).toBe('file');
    expect(input.multiple).toBe(true);
    expect(input.accept).toBe('image/jpeg,image/png,image/webp,image/gif');
  });

  it('calls onFilesSelected when files are dropped', () => {
    const onFilesSelected = vi.fn();
    render(<DropZone onFilesSelected={onFilesSelected} />);

    const dropZone = screen.getByRole('region', { name: /drop zone/i });
    const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    });

    expect(onFilesSelected).toHaveBeenCalledWith([file]);
  });

  it('calls onFilesSelected when files are selected via input', async () => {
    const user = userEvent.setup();
    const onFilesSelected = vi.fn();
    render(<DropZone onFilesSelected={onFilesSelected} />);

    const input = document.getElementById('photo-file-input') as HTMLInputElement;
    const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });

    await user.upload(input, file);

    expect(onFilesSelected).toHaveBeenCalledWith([file]);
  });

  it('renders disabled state', () => {
    render(<DropZone onFilesSelected={vi.fn()} disabled />);

    const dropZone = screen.getByRole('region', { name: /drop zone/i });
    expect(dropZone.className).toContain('pointer-events-none');
  });

  it('does not call onFilesSelected when disabled and files are dropped', () => {
    const onFilesSelected = vi.fn();
    render(<DropZone onFilesSelected={onFilesSelected} disabled />);

    const dropZone = screen.getByRole('region', { name: /drop zone/i });
    const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    });

    expect(onFilesSelected).not.toHaveBeenCalled();
  });

  it('has accessible region role and label', () => {
    render(<DropZone onFilesSelected={vi.fn()} />);

    expect(screen.getByRole('region', { name: 'Photo upload drop zone' })).toBeInTheDocument();
  });
});
