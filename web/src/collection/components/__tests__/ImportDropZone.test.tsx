import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportDropZone } from '../ImportDropZone';

describe('ImportDropZone', () => {
  it('renders drop zone with correct role and label', () => {
    render(<ImportDropZone onFileSelect={vi.fn()} />);
    const zone = screen.getByRole('button', { name: /select export file to import/i });
    expect(zone).toBeInTheDocument();
  });

  it('renders instructional text', () => {
    render(<ImportDropZone onFileSelect={vi.fn()} />);
    expect(screen.getByText('Drop your export file here')).toBeInTheDocument();
    expect(screen.getByText('or click to browse')).toBeInTheDocument();
  });

  it('renders hidden file input with .json accept', () => {
    const { container } = render(<ImportDropZone onFileSelect={vi.fn()} />);
    const input = container.querySelector('input[type="file"]');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('accept', '.json');
  });

  it('calls onFileSelect when a .json file is chosen via input', async () => {
    const user = userEvent.setup();
    const onFileSelect = vi.fn();
    const { container } = render(<ImportDropZone onFileSelect={onFileSelect} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['{}'], 'test.json', { type: 'application/json' });
    await user.upload(input, file);
    expect(onFileSelect).toHaveBeenCalledWith(file);
  });
});
