import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportPreview } from '../ImportPreview';
import type { ImportPreviewData } from '@/collection/lib/import-types';

const mockFile = new File(['{}'], 'collection-export-2026-03-24.json', { type: 'application/json' });
Object.defineProperty(mockFile, 'size', { value: 2457 });

const mockPreview: ImportPreviewData = {
  schemaVersion: 1,
  exportedAt: '2026-03-24T14:30:00.000Z',
  itemCount: 47,
  franchiseCounts: [
    { slug: 'transformers', count: 32 },
    { slug: 'gi-joe', count: 15 },
  ],
};

describe('ImportPreview', () => {
  it('renders filename', () => {
    render(<ImportPreview file={mockFile} preview={mockPreview} onReplaceFile={vi.fn()} />);
    expect(screen.getByText('collection-export-2026-03-24.json')).toBeInTheDocument();
  });

  it('renders schema version badge', () => {
    render(<ImportPreview file={mockFile} preview={mockPreview} onReplaceFile={vi.fn()} />);
    expect(screen.getByText('v1')).toBeInTheDocument();
  });

  it('renders item count', () => {
    render(<ImportPreview file={mockFile} preview={mockPreview} onReplaceFile={vi.fn()} />);
    expect(screen.getByText('47')).toBeInTheDocument();
  });

  it('renders franchise pills with counts', () => {
    render(<ImportPreview file={mockFile} preview={mockPreview} onReplaceFile={vi.fn()} />);
    expect(screen.getByText('transformers')).toBeInTheDocument();
    expect(screen.getByText('32')).toBeInTheDocument();
    expect(screen.getByText('gi-joe')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('calls onReplaceFile when Replace is clicked', async () => {
    const user = userEvent.setup();
    const onReplaceFile = vi.fn();
    render(<ImportPreview file={mockFile} preview={mockPreview} onReplaceFile={onReplaceFile} />);
    await user.click(screen.getByText('Replace'));
    expect(onReplaceFile).toHaveBeenCalledOnce();
  });
});
