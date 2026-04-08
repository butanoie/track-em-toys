import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRejectChord } from '../useRejectChord';

function pressR() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', code: 'KeyR' }));
  document.dispatchEvent(new KeyboardEvent('keyup', { key: 'r', code: 'KeyR' }));
}

describe('useRejectChord', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-07T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onChord when R is pressed twice within the window', () => {
    const onChord = vi.fn();
    renderHook(() => useRejectChord({ enabled: true, onChord }));

    act(() => {
      pressR();
      vi.advanceTimersByTime(200);
      pressR();
    });

    expect(onChord).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onChord when the second R falls outside the window', () => {
    const onChord = vi.fn();
    renderHook(() => useRejectChord({ enabled: true, windowMs: 500, onChord }));

    act(() => {
      pressR();
      vi.advanceTimersByTime(600);
      pressR();
    });

    expect(onChord).not.toHaveBeenCalled();
  });

  it('requires a third R after a missed window to chord again', () => {
    const onChord = vi.fn();
    renderHook(() => useRejectChord({ enabled: true, windowMs: 500, onChord }));

    act(() => {
      pressR();
      vi.advanceTimersByTime(600); // window expires
      pressR(); // becomes the new "first" press
      vi.advanceTimersByTime(100);
      pressR();
    });

    expect(onChord).toHaveBeenCalledTimes(1);
  });

  it('does not listen when disabled', () => {
    const onChord = vi.fn();
    renderHook(() => useRejectChord({ enabled: false, onChord }));

    act(() => {
      pressR();
      vi.advanceTimersByTime(100);
      pressR();
    });

    expect(onChord).not.toHaveBeenCalled();
  });

  it('resetChord clears a pending first press', () => {
    const onChord = vi.fn();
    const { result } = renderHook(() => useRejectChord({ enabled: true, onChord }));

    act(() => {
      pressR(); // first press queued
    });

    act(() => {
      result.current.resetChord();
    });

    act(() => {
      vi.advanceTimersByTime(100);
      pressR(); // would have completed the chord without reset
    });

    expect(onChord).not.toHaveBeenCalled();
  });
});
