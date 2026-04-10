import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilmStripQueue } from '../FilmStripQueue';
import { makePhotoApprovalItem } from './test-fixtures';

const photos = [
  makePhotoApprovalItem({ id: 'a', item: { ...makePhotoApprovalItem().item, name: 'Alpha' } }),
  makePhotoApprovalItem({ id: 'b', item: { ...makePhotoApprovalItem().item, name: 'Bravo' } }),
  makePhotoApprovalItem({ id: 'c', item: { ...makePhotoApprovalItem().item, name: 'Charlie' } }),
];

describe('FilmStripQueue', () => {
  it('renders one button per photo with a position label', () => {
    render(<FilmStripQueue photos={photos} activeIndex={1} onSelect={vi.fn()} />);
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('marks the active photo with aria-current', () => {
    render(<FilmStripQueue photos={photos} activeIndex={2} onSelect={vi.fn()} />);
    const charlieButton = screen.getByRole('button', { name: /Photo 3 of 3: Charlie/ });
    expect(charlieButton).toHaveAttribute('aria-current', 'true');
    const alphaButton = screen.getByRole('button', { name: /Photo 1 of 3: Alpha/ });
    expect(alphaButton).not.toHaveAttribute('aria-current');
  });

  it('fires onSelect with the clicked index', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<FilmStripQueue photos={photos} activeIndex={0} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /Photo 2 of 3: Bravo/ }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('handles an empty queue gracefully', () => {
    render(<FilmStripQueue photos={[]} activeIndex={0} onSelect={vi.fn()} />);
    expect(screen.getByText('0 / 0')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
