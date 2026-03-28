import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ImportCollectionDialog } from '../ImportCollectionDialog';

const mockMutate = vi.fn();
const mockReset = vi.fn();

vi.mock('@/collection/hooks/useCollectionImport', () => ({
  useCollectionImport: () => ({
    mutate: mockMutate,
    reset: mockReset,
    isPending: false,
    isError: false,
    isSuccess: false,
  }),
}));

// Store the onFileSelect callback so tests can trigger it directly
let capturedOnFileSelect: ((file: File) => void) | null = null;

vi.mock('../ImportDropZone', () => ({
  ImportDropZone: ({ onFileSelect }: { onFileSelect: (file: File) => void }) => {
    capturedOnFileSelect = onFileSelect;
    return <div data-testid="drop-zone">Drop Zone</div>;
  },
}));

vi.mock('../ImportPreview', () => ({
  ImportPreview: ({ onReplaceFile }: { onReplaceFile: () => void }) => (
    <div data-testid="preview">
      <button onClick={onReplaceFile}>Replace file</button>
    </div>
  ),
}));

vi.mock('../ImportResultsManifest', () => ({
  ImportResultsManifest: ({ onDone }: { onDone: () => void }) => (
    <div data-testid="results">
      <button onClick={onDone}>Done</button>
    </div>
  ),
}));

function createFile(content: string, name = 'test.json'): File {
  return new File([content], name, { type: 'application/json' });
}

const validExportJson = JSON.stringify({
  version: 1,
  exported_at: '2026-03-24T00:00:00.000Z',
  items: [
    {
      franchise_slug: 'transformers',
      item_slug: 'optimus-prime',
      package_condition: 'mint_sealed',
      item_condition: 5,
      notes: null,
      added_at: '2026-03-20T00:00:00Z',
      deleted_at: null,
    },
  ],
});

function renderDialog(open = true, currentCollectionCount = 10) {
  const onOpenChange = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={qc}>
      <ImportCollectionDialog open={open} onOpenChange={onOpenChange} currentCollectionCount={currentCollectionCount} />
    </QueryClientProvider>
  );
  return { ...result, onOpenChange };
}

async function triggerFileSelect(content: string, name = 'test.json') {
  const file = createFile(content, name);
  await act(async () => {
    capturedOnFileSelect?.(file);
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe('ImportCollectionDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnFileSelect = null;
  });

  it('renders drop zone in idle state', () => {
    renderDialog();
    expect(screen.getByText('Import Collection')).toBeInTheDocument();
    expect(screen.getByTestId('drop-zone')).toBeInTheDocument();
  });

  it('transitions to file-selected state on valid file', async () => {
    renderDialog();
    await triggerFileSelect(validExportJson);
    await waitFor(() => {
      expect(screen.getByTestId('preview')).toBeInTheDocument();
    });
  });

  it('shows Append and Replace buttons after file selection', async () => {
    renderDialog();
    await triggerFileSelect(validExportJson);
    await waitFor(() => screen.getByTestId('preview'));
    expect(screen.getByRole('button', { name: /^Append$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Replace$/i })).toBeInTheDocument();
  });

  it('shows append confirmation dialog when Append is clicked', async () => {
    const user = userEvent.setup();
    renderDialog();
    await triggerFileSelect(validExportJson);
    await waitFor(() => screen.getByTestId('preview'));
    await user.click(screen.getByRole('button', { name: /^Append$/i }));
    expect(screen.getByText('Append to collection?')).toBeInTheDocument();
  });

  it('calls import mutation with append mode after append confirmation', async () => {
    const user = userEvent.setup();
    renderDialog();
    await triggerFileSelect(validExportJson);
    await waitFor(() => screen.getByTestId('preview'));
    await user.click(screen.getByRole('button', { name: /^Append$/i }));
    await user.click(screen.getByRole('button', { name: /append 1 items/i }));
    expect(mockMutate).toHaveBeenCalledOnce();
    const call = mockMutate.mock.calls[0] as unknown[];
    expect((call[0] as { mode: string }).mode).toBe('append');
  });

  it('shows overwrite confirmation when Replace is clicked', async () => {
    const user = userEvent.setup();
    // 1 item importing into collection of 1 → ratio = 1.0 ≥ 0.5 → regular overwrite prompt
    renderDialog(true, 1);
    await triggerFileSelect(validExportJson);
    await waitFor(() => screen.getByTestId('preview'));
    await user.click(screen.getByRole('button', { name: /^Replace$/i }));
    expect(screen.getByText('Replace entire collection?')).toBeInTheDocument();
  });

  it('shows size warning when import is much smaller than collection', async () => {
    const user = userEvent.setup();
    // 1 item importing into a collection of 10 → ratio = 0.1 < 0.5 → size warning
    renderDialog(true, 10);
    await triggerFileSelect(validExportJson);
    await waitFor(() => screen.getByTestId('preview'));
    await user.click(screen.getByRole('button', { name: /^Replace$/i }));
    expect(screen.getByText('Import is much smaller than your collection')).toBeInTheDocument();
  });

  it('does not show size warning when import is similar size', async () => {
    const user = userEvent.setup();
    // 1 item importing into a collection of 1 → ratio = 1.0 ≥ 0.5 → no warning
    renderDialog(true, 1);
    await triggerFileSelect(validExportJson);
    await waitFor(() => screen.getByTestId('preview'));
    await user.click(screen.getByRole('button', { name: /^Replace$/i }));
    expect(screen.getByText('Replace entire collection?')).toBeInTheDocument();
  });

  it('shows error state on invalid JSON file', async () => {
    renderDialog();
    await triggerFileSelect('not valid json');
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Invalid file format')).toBeInTheDocument();
    });
  });

  it('shows error state on unsupported version', async () => {
    const futureExport = JSON.stringify({
      version: 99,
      exported_at: '2026-01-01T00:00:00Z',
      items: [
        {
          franchise_slug: 'tf',
          item_slug: 'op',
          package_condition: 'unknown',
          item_condition: 5,
          notes: null,
          added_at: '2026-01-01T00:00:00Z',
          deleted_at: null,
        },
      ],
    });
    renderDialog();
    await triggerFileSelect(futureExport);
    await waitFor(() => {
      expect(screen.getByText('Unsupported schema version')).toBeInTheDocument();
    });
  });

  it('shows error state on empty items array', async () => {
    const emptyExport = JSON.stringify({
      version: 1,
      exported_at: '2026-01-01T00:00:00Z',
      items: [],
    });
    renderDialog();
    await triggerFileSelect(emptyExport);
    await waitFor(() => {
      expect(screen.getByText('No items to import')).toBeInTheDocument();
    });
  });

  it('returns to idle when Replace file is clicked in preview', async () => {
    const user = userEvent.setup();
    renderDialog();
    await triggerFileSelect(validExportJson);
    await waitFor(() => screen.getByTestId('preview'));
    await user.click(screen.getByText('Replace file'));
    expect(screen.getByTestId('drop-zone')).toBeInTheDocument();
  });

  it('returns to idle when retry link is clicked in error state', async () => {
    const user = userEvent.setup();
    renderDialog();
    await triggerFileSelect('bad json');
    await waitFor(() => screen.getByRole('alert'));
    await user.click(screen.getByText('Choose a different file'));
    expect(screen.getByTestId('drop-zone')).toBeInTheDocument();
  });

  it('does not render dialog content when closed', () => {
    renderDialog(false);
    expect(screen.queryByText('Import Collection')).not.toBeInTheDocument();
  });
});
