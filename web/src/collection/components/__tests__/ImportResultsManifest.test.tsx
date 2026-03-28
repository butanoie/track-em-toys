import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportResultsManifest } from '../ImportResultsManifest';
import type { CollectionImportResponse } from '@/lib/zod-schemas';

const allSuccessResult: CollectionImportResponse = {
  imported: [
    {
      franchise_slug: 'transformers',
      item_slug: 'optimus-prime',
      item_name: 'Optimus Prime',
      package_condition: 'mint_sealed',
      item_condition: 5,
    },
    {
      franchise_slug: 'gi-joe',
      item_slug: 'snake-eyes',
      item_name: 'Snake Eyes',
      package_condition: 'loose_complete',
      item_condition: 5,
    },
  ],
  unresolved: [],
  overwritten_count: 0,
};

const mixedResult: CollectionImportResponse = {
  imported: [
    {
      franchise_slug: 'transformers',
      item_slug: 'optimus-prime',
      item_name: 'Optimus Prime',
      package_condition: 'mint_sealed',
      item_condition: 5,
    },
  ],
  unresolved: [{ franchise_slug: 'gi-joe', item_slug: 'snow-serpent', reason: 'Item not found in catalog' }],
  overwritten_count: 0,
};

describe('ImportResultsManifest', () => {
  it('renders compact success view when all items imported', () => {
    render(<ImportResultsManifest result={allSuccessResult} onDone={vi.fn()} />);
    expect(screen.getByText('All items imported')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders ledger view with unresolved section first when mixed results', () => {
    render(<ImportResultsManifest result={mixedResult} onDone={vi.fn()} />);
    expect(screen.getByText('Unresolved')).toBeInTheDocument();
    expect(screen.getByText('Imported')).toBeInTheDocument();
    expect(screen.getByText('gi-joe / snow-serpent')).toBeInTheDocument();
    expect(screen.getByText('Item not found in catalog')).toBeInTheDocument();
  });

  it('renders imported items with names', () => {
    render(<ImportResultsManifest result={mixedResult} onDone={vi.fn()} />);
    expect(screen.getByText('Optimus Prime')).toBeInTheDocument();
  });

  it('calls onDone when Done button is clicked', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<ImportResultsManifest result={allSuccessResult} onDone={onDone} />);
    await user.click(screen.getByRole('button', { name: /done/i }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('renders Download failed items button when there are unresolved items and originalItems provided', () => {
    const originalItems = [
      {
        franchise_slug: 'transformers',
        item_slug: 'optimus-prime',
        package_condition: 'mint_sealed' as const,
        item_condition: 5,
        notes: null,
        added_at: '2026-03-20T00:00:00Z',
        deleted_at: null,
      },
      {
        franchise_slug: 'gi-joe',
        item_slug: 'snow-serpent',
        package_condition: 'unknown' as const,
        item_condition: 5,
        notes: null,
        added_at: '2026-03-21T00:00:00Z',
        deleted_at: null,
      },
    ];
    render(<ImportResultsManifest result={mixedResult} originalItems={originalItems} onDone={vi.fn()} />);
    expect(screen.getByText('Download failed items')).toBeInTheDocument();
  });

  it('does not render Download failed items button on all-success results', () => {
    render(<ImportResultsManifest result={allSuccessResult} onDone={vi.fn()} />);
    expect(screen.queryByText('Download failed items')).not.toBeInTheDocument();
  });
});
