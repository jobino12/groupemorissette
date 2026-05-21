/**
 * Offline outbox for the mobile app — Phase 1 implementation lands here.
 *
 * Design:
 *   1. Every mutation writes to local SQLite first (immediate UI feedback).
 *   2. Append a row to `outbox(id, kind, payload, created_at, attempts, last_error)`.
 *   3. A foreground sync loop pops outbox rows in order and POSTs to tRPC.
 *   4. On success: delete the outbox row, mark local row as synced.
 *   5. On 4xx: mark error, surface to user (conflict UI).
 *   6. On 5xx / network: exponential backoff (1s, 2s, 4s, 8s, 30s cap).
 *
 * Conflict policy:
 *   - Append-only events (status, photo, signature, time, parts) → no conflict possible.
 *   - Scalar field edits → server is source of truth, last-write-wins, surface diff to user.
 */

export type OutboxKind =
  | 'work_order.status'
  | 'work_order.event'
  | 'time_entry.create'
  | 'parts.used';

export interface OutboxRow {
  id: string;
  kind: OutboxKind;
  payload: unknown;
  createdAt: string;
  attempts: number;
  lastError: string | null;
}

export async function enqueue(_kind: OutboxKind, _payload: unknown): Promise<void> {
  throw new Error('Not implemented (Phase 1)');
}

export async function flush(): Promise<void> {
  throw new Error('Not implemented (Phase 1)');
}
