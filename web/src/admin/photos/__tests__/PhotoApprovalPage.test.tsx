import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PhotoApprovalPage } from '../PhotoApprovalPage';
import { makePhotoApprovalItem } from './test-fixtures';
import * as api from '../api';
import type { PhotoApprovalListResponse } from '@/lib/zod-schemas';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('../api');

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PhotoApprovalPage />
    </QueryClientProvider>,
  );
}

function makeList(overrides: Partial<PhotoApprovalListResponse> = {}): PhotoApprovalListResponse {
  return {
    photos: [
      makePhotoApprovalItem({ id: '10000000-0000-4000-8000-000000000001' }),
      makePhotoApprovalItem({
        id: '10000000-0000-4000-8000-000000000002',
        item: {
          id: '20000000-0000-4000-8000-000000000002',
          name: 'Megatron',
          slug: 'megatron',
          franchise_slug: 'transformers',
          thumbnail_url: 'transformers/megatron-thumb.webp',
        },
      }),
    ],
    total_count: 2,
    ...overrides,
  };
}

beforeEach(() => {
  // jsdom lacks a usable localStorage in this repo — stub one so the
  // KeyboardShortcutOverlay mount effect doesn't crash.
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => {
        store.clear();
      },
      key: () => null,
      length: 0,
    },
  });
  // Suppress first-visit auto-open by marking overlay as seen.
  localStorage.setItem('photo-approval-shortcuts-seen', 'true');
});

afterEach(() => {
  vi.resetAllMocks();
});

describe('PhotoApprovalPage', () => {
  it('renders heading and the first photo in the queue', async () => {
    vi.mocked(api.listPendingPhotos).mockResolvedValue(makeList());
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Photo Approvals' })).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 2, name: /Reviewing.*Optimus Prime/ }),
    ).toBeInTheDocument();
  });

  it('calls decidePhoto with approved status when Approve is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listPendingPhotos).mockResolvedValue(makeList());
    vi.mocked(api.decidePhoto).mockResolvedValue({
      conflict: false,
      data: {
        id: '10000000-0000-4000-8000-000000000001',
        item_id: '22222222-2222-4222-8222-222222222222',
        url: 'pending/x.webp',
        status: 'approved',
        visibility: 'public',
        rejection_reason_code: null,
        rejection_reason_text: null,
        updated_at: '2026-04-07T00:00:00.000Z',
      },
    });
    renderPage();

    await screen.findByRole('heading', { level: 2, name: /Reviewing.*Optimus Prime/ });
    const approveButton = screen.getAllByRole('button', { name: /Approve/ })[0]!;
    await user.click(approveButton);

    await waitFor(() => {
      expect(vi.mocked(api.decidePhoto)).toHaveBeenCalledWith(
        '10000000-0000-4000-8000-000000000001',
        { status: 'approved' },
      );
    });
  });

  it('shows a conflict banner when decidePhoto returns 409', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listPendingPhotos).mockResolvedValue(makeList());
    vi.mocked(api.decidePhoto).mockResolvedValue({
      conflict: true,
      current_status: 'approved',
      error: 'Photo already decided',
    });
    renderPage();

    await screen.findByRole('heading', { level: 2, name: /Reviewing.*Optimus Prime/ });
    const approveButton = screen.getAllByRole('button', { name: /Approve/ })[0]!;
    await user.click(approveButton);

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent(/no longer pending/);
    expect(banner).toHaveTextContent(/approved/);

    // Dismiss clears the banner.
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => {
      expect(screen.queryByText(/no longer pending/)).not.toBeInTheDocument();
    });
  });

  it('renders empty state when the queue is empty', async () => {
    vi.mocked(api.listPendingPhotos).mockResolvedValue({ photos: [], total_count: 0 });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'No pending photos' })).toBeInTheDocument();
  });

  it('renders empty state after the only pending photo is decided', async () => {
    const single: PhotoApprovalListResponse = {
      photos: [makePhotoApprovalItem({ id: '30000000-0000-4000-8000-000000000001' })],
      total_count: 1,
    };
    const empty: PhotoApprovalListResponse = { photos: [], total_count: 0 };
    let callCount = 0;
    vi.mocked(api.listPendingPhotos).mockImplementation(() => {
      callCount += 1;
      return Promise.resolve(callCount === 1 ? single : empty);
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PhotoApprovalPage />
      </QueryClientProvider>,
    );
    await screen.findByRole('heading', { level: 2, name: /Reviewing.*Optimus Prime/ });

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'photos', 'pending'] });
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'No pending photos' })).toBeInTheDocument();
    });
  });

  it('clamps activeIndex when the queue shrinks on refetch', async () => {
    const twoPhotos = makeList();
    const onePhoto: PhotoApprovalListResponse = {
      photos: [twoPhotos.photos[0]!],
      total_count: 1,
    };
    let callCount = 0;
    vi.mocked(api.listPendingPhotos).mockImplementation(() => {
      callCount += 1;
      return Promise.resolve(callCount === 1 ? twoPhotos : onePhoto);
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PhotoApprovalPage />
      </QueryClientProvider>,
    );

    await screen.findByRole('heading', { level: 2, name: /Reviewing.*Optimus Prime/ });

    // Force a refetch that returns the shorter list.
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'photos', 'pending'] });
    });

    await waitFor(() => {
      // Position label should reflect the clamped index.
      expect(screen.getByText(/1 \/ 1/)).toBeInTheDocument();
    });
  });
});
