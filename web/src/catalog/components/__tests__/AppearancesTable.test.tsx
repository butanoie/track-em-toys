import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppearancesTable } from '../AppearancesTable';
import { mockAppearance } from '@/catalog/__tests__/catalog-test-helpers';

describe('AppearancesTable', () => {
  it('renders "None recorded." when appearances is empty', () => {
    render(<AppearancesTable appearances={[]} />);
    expect(screen.getByText('None recorded.')).toBeInTheDocument();
  });

  it('renders table headers', () => {
    render(<AppearancesTable appearances={[mockAppearance]} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.getByText('Years')).toBeInTheDocument();
  });

  it('renders appearance name and source_media', () => {
    render(<AppearancesTable appearances={[mockAppearance]} />);
    expect(screen.getByText('The Transformers Season 1')).toBeInTheDocument();
    expect(screen.getByText('Animated TV series')).toBeInTheDocument();
  });

  it('formats year range as "1984–1985"', () => {
    render(<AppearancesTable appearances={[mockAppearance]} />);
    expect(screen.getByText('1984–1985')).toBeInTheDocument();
  });

  it('formats start-only year without hyphen', () => {
    render(<AppearancesTable appearances={[{ ...mockAppearance, year_end: null }]} />);
    expect(screen.getByText('1984')).toBeInTheDocument();
  });

  it('formats end-only year without hyphen', () => {
    render(<AppearancesTable appearances={[{ ...mockAppearance, year_start: null }]} />);
    expect(screen.getByText('1985')).toBeInTheDocument();
  });

  it('formats same start and end year as single year', () => {
    render(<AppearancesTable appearances={[{ ...mockAppearance, year_start: 1986, year_end: 1986 }]} />);
    expect(screen.getByText('1986')).toBeInTheDocument();
  });

  it('formats null/null years as "—"', () => {
    render(<AppearancesTable appearances={[{ ...mockAppearance, year_start: null, year_end: null }]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders "—" for null source_media', () => {
    render(<AppearancesTable appearances={[{ ...mockAppearance, source_media: null }]} />);
    expect(screen.getByRole('cell', { name: '—' })).toBeInTheDocument();
  });
});
