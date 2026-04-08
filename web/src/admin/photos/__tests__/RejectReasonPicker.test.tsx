import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RejectReasonPicker } from '../RejectReasonPicker';

function renderPicker(overrides: Partial<React.ComponentProps<typeof RejectReasonPicker>> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <RejectReasonPicker
      isPending={false}
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onSubmit, onCancel };
}

describe('RejectReasonPicker', () => {
  it('fires onSubmit immediately for reasons 1-5', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderPicker();

    await user.click(screen.getByRole('button', { name: /Blurry/ }));
    expect(onSubmit).toHaveBeenLastCalledWith({ code: 'blurry', text: null });

    await user.click(screen.getByRole('button', { name: /Wrong item/ }));
    expect(onSubmit).toHaveBeenLastCalledWith({ code: 'wrong_item', text: null });

    await user.click(screen.getByRole('button', { name: /Poor quality/ }));
    expect(onSubmit).toHaveBeenLastCalledWith({ code: 'poor_quality', text: null });

    expect(onSubmit).toHaveBeenCalledTimes(3);
  });

  it('reveals the inline input when Other is clicked and does NOT submit yet', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderPicker();

    await user.click(screen.getByRole('button', { name: /Other/ }));
    const input = screen.getByLabelText(/Other rejection reason text/);
    expect(input).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('confirms with text on Enter and trims whitespace', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderPicker();

    await user.click(screen.getByRole('button', { name: /Other/ }));
    const input = screen.getByLabelText(/Other rejection reason text/);
    await user.type(input, '  Compressed artifacts  {Enter}');

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ code: 'other', text: 'Compressed artifacts' });
  });

  it('confirms with null text when Enter is pressed in an empty input', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderPicker();

    await user.click(screen.getByRole('button', { name: /Other/ }));
    const input = screen.getByLabelText(/Other rejection reason text/);
    await user.click(input);
    await user.keyboard('{Enter}');

    expect(onSubmit).toHaveBeenCalledWith({ code: 'other', text: null });
  });

  it('calls onCancel when Esc is pressed inside the input', async () => {
    const user = userEvent.setup();
    const { onCancel, onSubmit } = renderPicker();

    await user.click(screen.getByRole('button', { name: /Other/ }));
    const input = screen.getByLabelText(/Other rejection reason text/);
    await user.click(input);
    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables every reason button while a mutation is pending', () => {
    renderPicker({ isPending: true });
    expect(screen.getByRole('button', { name: /Blurry/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Other/ })).toBeDisabled();
  });
});
