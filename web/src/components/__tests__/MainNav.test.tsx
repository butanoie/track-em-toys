import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MainNav } from '../MainNav';

let mockPathname = '/';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useRouterState: (opts?: {
    select?: (s: { location: { pathname: string; search: Record<string, unknown> } }) => unknown;
  }) => {
    const state = { location: { pathname: mockPathname, search: {} } };
    return opts?.select ? opts.select(state) : state;
  },
}));

describe('MainNav', () => {
  it('renders navigation landmark with aria-label', () => {
    render(<MainNav />);
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });

  it('renders Dashboard and Catalog links', () => {
    render(<MainNav />);
    expect(screen.getByText('Dashboard').closest('a')).toHaveAttribute('href', '/');
    expect(screen.getByText('Catalog').closest('a')).toHaveAttribute('href', '/catalog');
  });

  it('marks Dashboard aria-current="page" when pathname is "/"', () => {
    mockPathname = '/';
    render(<MainNav />);
    expect(screen.getByText('Dashboard').closest('a')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Catalog').closest('a')).not.toHaveAttribute('aria-current');
  });

  it('marks Catalog aria-current="page" when pathname starts with "/catalog"', () => {
    mockPathname = '/catalog/transformers';
    render(<MainNav />);
    expect(screen.getByText('Catalog').closest('a')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Dashboard').closest('a')).not.toHaveAttribute('aria-current');
  });

  it('renders "My Collection" as a link to /collection', () => {
    render(<MainNav />);
    const myCollection = screen.getByText('My Collection');
    expect(myCollection.closest('a')).toHaveAttribute('href', '/collection');
    expect(myCollection).not.toHaveAttribute('aria-disabled');
  });

  it('marks My Collection aria-current="page" when pathname starts with "/collection"', () => {
    mockPathname = '/collection';
    render(<MainNav />);
    expect(screen.getByText('My Collection').closest('a')).toHaveAttribute('aria-current', 'page');
  });
});
