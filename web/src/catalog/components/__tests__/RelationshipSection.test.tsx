import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RelationshipSection } from '../RelationshipSection';
import type { RelationshipGroup } from '../RelationshipSection';

function makeGroup(overrides: Partial<RelationshipGroup> = {}): RelationshipGroup {
  return {
    type: 'combiner-component',
    heading: 'Combiner Components',
    groupSubtype: null,
    items: [
      {
        key: 'scrapper',
        name: 'Scrapper',
        role: 'right leg',
        subtype: null,
        renderLink: () => <a href="/scrapper">Scrapper</a>,
      },
    ],
    ...overrides,
  };
}

describe('RelationshipSection', () => {
  it('renders nothing when groups is empty', () => {
    const { container } = render(<RelationshipSection groups={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders heading for each group', () => {
    const groups = [makeGroup(), makeGroup({ type: 'rival', heading: 'Rivals' })];
    render(<RelationshipSection groups={groups} />);
    expect(screen.getByText('Combiner Components')).toBeInTheDocument();
    expect(screen.getByText('Rivals')).toBeInTheDocument();
  });

  it('renders link via renderLink callback', () => {
    render(<RelationshipSection groups={[makeGroup()]} />);
    const link = screen.getByText('Scrapper');
    expect(link.closest('a')).toHaveAttribute('href', '/scrapper');
  });

  it('renders role as muted parenthetical text', () => {
    render(<RelationshipSection groups={[makeGroup()]} />);
    expect(screen.getByText('(right leg)')).toBeInTheDocument();
  });

  it('omits role when null', () => {
    const group = makeGroup({
      items: [{ key: 'a', name: 'A', role: null, subtype: null, renderLink: () => <a href="/a">A</a> }],
    });
    render(<RelationshipSection groups={[group]} />);
    expect(screen.queryByText(/\(/)).not.toBeInTheDocument();
  });

  it('renders group-level subtype badge on heading', () => {
    const group = makeGroup({ groupSubtype: 'headmaster' });
    render(<RelationshipSection groups={[group]} />);
    expect(screen.getByText('headmaster')).toBeInTheDocument();
  });

  it('renders per-item subtype badge when groupSubtype is null', () => {
    const group = makeGroup({
      groupSubtype: null,
      items: [
        {
          key: 'a',
          name: 'A',
          role: null,
          subtype: 'targetmaster',
          renderLink: () => <a href="/a">A</a>,
        },
      ],
    });
    render(<RelationshipSection groups={[group]} />);
    expect(screen.getByText('targetmaster')).toBeInTheDocument();
  });

  it('does not render per-item subtype badge when null', () => {
    const group = makeGroup({
      items: [{ key: 'a', name: 'A', role: null, subtype: null, renderLink: () => <a href="/a">A</a> }],
    });
    render(<RelationshipSection groups={[group]} />);
    // Only the heading text should be present, no badges
    expect(screen.queryByText('headmaster')).not.toBeInTheDocument();
    expect(screen.queryByText('targetmaster')).not.toBeInTheDocument();
  });

  it('uses renderHeading callback when provided', () => {
    const group = makeGroup({
      renderHeading: () => <a href="/devastator">Devastator</a>,
    });
    render(<RelationshipSection groups={[group]} />);
    const link = screen.getByRole('link', { name: 'Devastator' });
    expect(link).toHaveAttribute('href', '/devastator');
  });

  it('falls back to heading text when renderHeading is not provided', () => {
    const group = makeGroup({ heading: 'Combiner Components' });
    render(<RelationshipSection groups={[group]} />);
    expect(screen.getByText('Combiner Components')).toBeInTheDocument();
  });

  it('renders isCurrent item with aria-current and distinct styling', () => {
    const group = makeGroup({
      items: [
        {
          key: 'scrapper',
          name: 'Scrapper',
          role: 'right leg',
          subtype: null,
          isCurrent: true,
          renderLink: () => <a href="/scrapper">Scrapper</a>,
        },
      ],
    });
    render(<RelationshipSection groups={[group]} />);
    const currentEl = screen.getByText('Scrapper');
    expect(currentEl).toHaveAttribute('aria-current', 'true');
    expect(currentEl.tagName).toBe('SPAN');
    expect(currentEl).toHaveClass('text-muted-foreground', 'font-medium');
  });

  it('still renders role for isCurrent item', () => {
    const group = makeGroup({
      items: [
        {
          key: 'scrapper',
          name: 'Scrapper',
          role: 'right leg',
          subtype: null,
          isCurrent: true,
          renderLink: () => <a href="/scrapper">Scrapper</a>,
        },
      ],
    });
    render(<RelationshipSection groups={[group]} />);
    expect(screen.getByText('(right leg)')).toBeInTheDocument();
  });

  it('does not use renderLink for isCurrent items', () => {
    const renderLink = vi.fn(() => <a href="/scrapper">Scrapper Link</a>);
    const group = makeGroup({
      items: [
        {
          key: 'scrapper',
          name: 'Scrapper',
          role: null,
          subtype: null,
          isCurrent: true,
          renderLink,
        },
      ],
    });
    render(<RelationshipSection groups={[group]} />);
    expect(renderLink).not.toHaveBeenCalled();
    expect(screen.getByText('Scrapper')).toBeInTheDocument();
  });
});
