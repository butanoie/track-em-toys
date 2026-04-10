import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PhotoTriageView } from '../PhotoTriageView';
import { makePhotoApprovalItem } from './test-fixtures';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    params?: Record<string, string>;
    className?: string;
  }) => {
    let href = to;
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        href = href.replace(`$${key}`, value);
      }
    }
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  },
}));

function renderTriage(overrides: Partial<React.ComponentProps<typeof PhotoTriageView>> = {}) {
  const defaults: React.ComponentProps<typeof PhotoTriageView> = {
    photo: makePhotoApprovalItem(),
    positionLabel: '1 of 5',
    isMutationPending: false,
    rejectPickerOpen: false,
    canApprovePublic: true,
    onApprove: vi.fn(),
    onApproveTrainingOnly: vi.fn(),
    onRejectButtonClick: vi.fn(),
    onRejectSubmit: vi.fn(),
    onRejectCancel: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onShowShortcuts: vi.fn(),
  };
  return render(<PhotoTriageView {...defaults} {...overrides} />);
}

describe('PhotoTriageView', () => {
  it('renders the heading, hero image, and metadata sidebar', () => {
    renderTriage();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/Reviewing.*Optimus Prime/);
    expect(screen.getByRole('img', { name: /Pending photo for Optimus Prime/ })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: /Photo metadata/ })).toBeInTheDocument();
  });

  it('exposes the queue position via a visually-hidden live region', () => {
    const { container } = renderTriage({ positionLabel: '3 of 7' });
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live?.textContent).toMatch(/Reviewing photo 3 of 7/);
  });

  it('hides the reject reason picker when rejectPickerOpen is false', () => {
    renderTriage({ rejectPickerOpen: false });
    expect(screen.queryByRole('group', { name: /Select rejection reason/ })).not.toBeInTheDocument();
  });

  it('shows the reject reason picker when rejectPickerOpen is true and canDecide is true', () => {
    renderTriage({ rejectPickerOpen: true });
    expect(screen.getByRole('group', { name: /Select rejection reason/ })).toBeInTheDocument();
  });

  it('suppresses the reject picker even if rejectPickerOpen is true when canDecide is false', () => {
    renderTriage({
      rejectPickerOpen: true,
      photo: makePhotoApprovalItem({ can_decide: false }),
    });
    expect(screen.queryByRole('group', { name: /Select rejection reason/ })).not.toBeInTheDocument();
  });

  it('shows a near-duplicate warning when an existing photo has distance ≤ 4', () => {
    renderTriage({
      photo: makePhotoApprovalItem({
        existing_photos: [
          { id: '55555555-5555-4555-8555-555555555555', url: 'transformers/op-1.webp', distance: 2 },
          { id: '66666666-6666-4666-8666-666666666666', url: 'transformers/op-2.webp', distance: 30 },
        ],
      }),
    });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/Possible duplicate/);
    expect(alert).toHaveTextContent(/distance 2/);
  });

  it('does NOT show the near-duplicate warning when all distances exceed 4', () => {
    renderTriage({
      photo: makePhotoApprovalItem({
        existing_photos: [
          { id: '55555555-5555-4555-8555-555555555555', url: 'transformers/op-1.webp', distance: 12 },
          { id: '66666666-6666-4666-8666-666666666666', url: 'transformers/op-2.webp', distance: 30 },
        ],
      }),
    });
    expect(screen.queryByText(/Possible duplicate/)).not.toBeInTheDocument();
  });

  it('does NOT show the near-duplicate warning when distance is null (legacy dHash)', () => {
    renderTriage({
      photo: makePhotoApprovalItem({
        existing_photos: [
          { id: '55555555-5555-4555-8555-555555555555', url: 'transformers/op-1.webp', distance: null },
        ],
      }),
    });
    expect(screen.queryByText(/Possible duplicate/)).not.toBeInTheDocument();
  });

  it('renders the photo caption when present', () => {
    renderTriage({
      photo: makePhotoApprovalItem({
        photo: { url: 'pending/x.webp', caption: 'Top-down shot', visibility: 'public' },
      }),
    });
    expect(screen.getByText(/Top-down shot/)).toBeInTheDocument();
  });
});
