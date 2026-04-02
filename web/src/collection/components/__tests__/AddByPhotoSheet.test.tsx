import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/collection/hooks/useMlModels', () => ({
  useMlModels: vi.fn().mockReturnValue({
    data: { models: [] },
    isPending: false,
    isError: false,
  }),
}));

vi.mock('@/collection/hooks/usePhotoIdentify', () => ({
  usePhotoIdentify: vi.fn().mockReturnValue({
    phase: { step: 'idle' },
    activeCategory: 'primary',
    identify: vi.fn(),
    tryAltMode: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock('@/catalog/photos/DropZone', () => ({
  DropZone: () => <div data-testid="drop-zone">Drop zone</div>,
}));

vi.mock('./PredictionCard', () => ({
  PredictionCard: () => <div data-testid="prediction-card">Prediction</div>,
}));

vi.mock('@/ml/telemetry', () => ({
  emitMlEvent: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

import { AddByPhotoSheet } from '../AddByPhotoSheet';
import { useMlModels } from '@/collection/hooks/useMlModels';
import type { CollectionMutations } from '@/collection/hooks/useCollectionMutations';

const mockMutations = {
  add: { mutate: vi.fn(), isPending: false },
  update: { mutate: vi.fn(), isPending: false },
  remove: { mutate: vi.fn(), isPending: false },
} as unknown as CollectionMutations;

describe('AddByPhotoSheet', () => {
  it('renders without crashing when open', () => {
    render(<AddByPhotoSheet open={true} onOpenChange={vi.fn()} mutations={mockMutations} />);

    expect(screen.getByText('Identify by Photo')).toBeInTheDocument();
  });

  it('shows "not available" when no models exist', () => {
    render(<AddByPhotoSheet open={true} onOpenChange={vi.fn()} mutations={mockMutations} />);

    expect(screen.getByText('Photo identification is not yet available.')).toBeInTheDocument();
  });

  it('shows loading spinner when models are loading', () => {
    vi.mocked(useMlModels).mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    } as ReturnType<typeof useMlModels>);

    render(<AddByPhotoSheet open={true} onOpenChange={vi.fn()} mutations={mockMutations} />);

    expect(screen.queryByText('Photo identification is not yet available.')).not.toBeInTheDocument();
  });

  it('does not render content when closed', () => {
    const { container } = render(<AddByPhotoSheet open={false} onOpenChange={vi.fn()} mutations={mockMutations} />);

    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });
});
