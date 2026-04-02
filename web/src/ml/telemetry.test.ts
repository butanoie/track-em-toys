import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetToken = vi.fn();
vi.mock('@/lib/auth-store', () => ({
  authStore: { getToken: () => mockGetToken() },
}));

vi.mock('@/lib/api-client', () => ({
  API_BASE: 'http://localhost:3000',
}));

import { emitMlEvent } from './telemetry';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});

describe('emitMlEvent', () => {
  it('sends a POST with correct payload when token exists', () => {
    mockGetToken.mockReturnValue('test-token');

    emitMlEvent('scan_started', 'primary-classifier', { model_version: 'v1' });

    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/ml/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({
        event_type: 'scan_started',
        model_name: 'primary-classifier',
        metadata: { model_version: 'v1' },
      }),
    });
  });

  it('does nothing when no token exists', () => {
    mockGetToken.mockReturnValue(null);

    emitMlEvent('scan_completed', 'model');

    expect(fetch).not.toHaveBeenCalled();
  });

  it('swallows fetch errors silently', () => {
    mockGetToken.mockReturnValue('test-token');
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    // Should not throw
    expect(() => emitMlEvent('scan_failed', 'model')).not.toThrow();
  });

  it('returns void (not a promise)', () => {
    mockGetToken.mockReturnValue('test-token');

    const result = emitMlEvent('prediction_accepted', 'model');

    expect(result).toBeUndefined();
  });
});
