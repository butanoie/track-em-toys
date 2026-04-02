/**
 * Fire-and-forget ML inference telemetry. Uses plain fetch with manual auth
 * header — avoids apiFetch's never-resolving promise on expired sessions.
 */

import { authStore } from '@/lib/auth-store';
import { API_BASE } from '@/lib/api-client';

export type MlEventType =
  | 'scan_started'
  | 'scan_completed'
  | 'scan_failed'
  | 'prediction_accepted'
  | 'scan_abandoned'
  | 'browse_catalog';

/**
 * Emit an ML inference telemetry event. Best-effort — never throws, never
 * blocks the caller. Returns void (not Promise) to prevent accidental awaiting.
 *
 * @param eventType - The event type
 * @param modelName - Model name for denormalized grouping
 * @param metadata - Event-specific metadata
 */
export function emitMlEvent(eventType: MlEventType, modelName?: string, metadata?: Record<string, unknown>): void {
  const token = authStore.getToken();
  if (!token) return;

  void fetch(`${API_BASE}/ml/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      event_type: eventType,
      model_name: modelName,
      metadata,
    }),
  }).catch(() => {
    // Telemetry is best-effort — silently discard errors
  });
}
