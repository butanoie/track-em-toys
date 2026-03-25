import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddToCollectionButton } from '../AddToCollectionButton';
import type { CollectionMutations } from '@/collection/hooks/useCollectionMutations';

vi.mock('@/collection/components/AddToCollectionDialog', () => ({
  AddToCollectionDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="add-dialog">Dialog Open</div> : null,
}));

function mockMutations(): CollectionMutations {
  return {
    add: { mutate: vi.fn(), isPending: false },
    patch: { mutate: vi.fn(), isPending: false },
    remove: { mutate: vi.fn(), isPending: false },
    restore: { mutate: vi.fn(), isPending: false },
  } as unknown as CollectionMutations;
}

describe('AddToCollectionButton', () => {
  it('renders "Add to Collection" when not owned', () => {
    render(
      <AddToCollectionButton item={{ id: 'i-1', name: 'Test' }} checkResult={undefined} mutations={mockMutations()} />
    );
    expect(screen.getByText('Add to Collection')).toBeInTheDocument();
  });

  it('renders "Add Copy" when already owned', () => {
    render(
      <AddToCollectionButton
        item={{ id: 'i-1', name: 'Test' }}
        checkResult={{ count: 2, collection_ids: ['c-1', 'c-2'] }}
        mutations={mockMutations()}
      />
    );
    expect(screen.getByText('Add Copy')).toBeInTheDocument();
  });

  it('opens dialog on click', async () => {
    render(
      <AddToCollectionButton item={{ id: 'i-1', name: 'Test' }} checkResult={undefined} mutations={mockMutations()} />
    );
    expect(screen.queryByTestId('add-dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Add to Collection'));
    expect(screen.getByTestId('add-dialog')).toBeInTheDocument();
  });
});
