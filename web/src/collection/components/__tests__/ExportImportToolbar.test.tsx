import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportImportToolbar } from '../ExportImportToolbar';

describe('ExportImportToolbar', () => {
  const defaultProps = {
    hasItems: true,
    isExporting: false,
    onExport: vi.fn(),
    onImportOpen: vi.fn(),
  };

  it('renders Export and Import buttons', () => {
    render(<ExportImportToolbar {...defaultProps} />);
    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import/i })).toBeInTheDocument();
  });

  it('calls onExport when Export button is clicked', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    render(<ExportImportToolbar {...defaultProps} onExport={onExport} />);
    await user.click(screen.getByRole('button', { name: /export/i }));
    expect(onExport).toHaveBeenCalledOnce();
  });

  it('calls onImportOpen when Import button is clicked', async () => {
    const user = userEvent.setup();
    const onImportOpen = vi.fn();
    render(<ExportImportToolbar {...defaultProps} onImportOpen={onImportOpen} />);
    await user.click(screen.getByRole('button', { name: /import/i }));
    expect(onImportOpen).toHaveBeenCalledOnce();
  });

  it('disables Export button when hasItems is false', () => {
    render(<ExportImportToolbar {...defaultProps} hasItems={false} />);
    expect(screen.getByRole('button', { name: /export/i })).toBeDisabled();
  });

  it('disables Export button when isExporting is true', () => {
    render(<ExportImportToolbar {...defaultProps} isExporting={true} />);
    expect(screen.getByRole('button', { name: /export/i })).toBeDisabled();
  });

  it('Import button is always enabled', () => {
    render(<ExportImportToolbar {...defaultProps} hasItems={false} />);
    expect(screen.getByRole('button', { name: /import/i })).not.toBeDisabled();
  });
});
