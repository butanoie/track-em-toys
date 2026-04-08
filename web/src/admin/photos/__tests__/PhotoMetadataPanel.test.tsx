import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PhotoMetadataPanel } from '../PhotoMetadataPanel';
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

describe('PhotoMetadataPanel', () => {
  it('renders item link, contributor info, intent, and existing photo thumbnails', () => {
    render(<PhotoMetadataPanel photo={makePhotoApprovalItem()} />);

    expect(screen.getByRole('link', { name: 'Optimus Prime' })).toHaveAttribute(
      'href',
      '/catalog/transformers/items/optimus-prime',
    );
    expect(screen.getByText('Test Contributor')).toBeInTheDocument();
    expect(screen.getByText('contributor@example.com')).toBeInTheDocument();
    expect(screen.getByText('Catalog + training')).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /Existing approved photo for Optimus Prime/ }))
      .toHaveLength(2);
  });

  it('displays "Deleted user" when uploader is null (GDPR tombstone)', () => {
    render(<PhotoMetadataPanel photo={makePhotoApprovalItem({ uploader: null })} />);
    expect(screen.getByText('Deleted user')).toBeInTheDocument();
  });

  it('omits the existing-photos section entirely when the array is empty', () => {
    render(<PhotoMetadataPanel photo={makePhotoApprovalItem({ existing_photos: [] })} />);
    expect(screen.queryByText(/Existing approved photos/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('omits the consent section when there is no contribution row', () => {
    render(<PhotoMetadataPanel photo={makePhotoApprovalItem({ contribution: null })} />);
    expect(screen.queryByText(/Consent/i)).not.toBeInTheDocument();
  });

  it('shows "Training only" intent label when the contributor chose training_only', () => {
    render(
      <PhotoMetadataPanel
        photo={makePhotoApprovalItem({
          contribution: {
            id: '44444444-4444-4444-8444-444444444444',
            contributed_by: '33333333-3333-4333-8333-333333333333',
            consent_version: '1',
            consent_granted_at: '2026-04-01T12:00:00.000Z',
            intent: 'training_only',
          },
        })}
      />,
    );
    expect(screen.getByText('Training only')).toBeInTheDocument();
  });
});
