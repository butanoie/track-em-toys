import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PendingQueueBanner } from '../PendingQueueBanner';

describe('PendingQueueBanner', () => {
  it('renders nothing when totalCount equals shownCount', () => {
    const { container } = render(<PendingQueueBanner totalCount={42} shownCount={42} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when totalCount is below shownCount', () => {
    const { container } = render(<PendingQueueBanner totalCount={10} shownCount={200} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the warning when more rows are pending than shown', () => {
    render(<PendingQueueBanner totalCount={1234} shownCount={200} />);
    const banner = screen.getByRole('status');
    expect(banner.textContent).toMatch(/Showing oldest 200 of 1234/);
  });
});
