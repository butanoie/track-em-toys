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
      <button onClick={onReplaceFile}>Replace</button>
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
      condition: 'mint_sealed',
      notes: null,
      added_at: '2026-03-20T00:00:00Z',
      deleted_at: null,
    },
  ],
});

function renderDialog(open = true) {
  const onOpenChange = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={qc}>
      <ImportCollectionDialog open={open} onOpenChange={onOpenChange} />
    </QueryClientProvider>
  );
  return { ...result, onOpenChange };
}

async function triggerFileSelect(content: string, name = 'test.json') {
  const file = createFile(content, name);
  await act(async () => {
    capturedOnFileSelect?.(file);
    // Allow file.text() promise and setState to resolve
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
          condition: 'unknown',
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

  it('calls import mutation on confirm', async () => {
    const user = userEvent.setup();
    renderDialog();
    await triggerFileSelect(validExportJson);
    await waitFor(() => screen.getByTestId('preview'));
    await user.click(screen.getByRole('button', { name: /import 1 items/i }));
    expect(mockMutate).toHaveBeenCalledOnce();
  });

  it('returns to idle when Replace is clicked in preview', async () => {
    const user = userEvent.setup();
    renderDialog();
    await triggerFileSelect(validExportJson);
    await waitFor(() => screen.getByTestId('preview'));
    await user.click(screen.getByText('Replace'));
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
