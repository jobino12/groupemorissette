/**
 * QuickBooks Online sync — Phase 2 implementation lands here.
 *
 * Outbound (ERP → QBO):
 *   - On invoice create/update/void, emit `invoice.changed` Inngest event.
 *   - Worker calls this module to map local → QBO Invoice and POST.
 *   - Idempotency: use local invoice id as RequestId; on 200 write qbo_sync_state.
 *   - Backoff on 429 (limit: 500 req/min/realm).
 *
 * Inbound (QBO → ERP):
 *   - Webhook hits /api/qbo/webhook → verify HMAC → write qbo_webhook_events.
 *   - Worker fetches changed entity from QBO and reconciles.
 *
 * Mapping notes:
 *   - tax_codes.qbo_tax_code_id is per-realm and must be set up once.
 *   - ERP owns Customer + Invoice creation; QBO owns Payment + GL.
 */

import type { QboCredentials, QboEnvironment } from './types';

export interface QboPushResult {
  qboId: string;
  syncToken: string;
}

export async function pushInvoice(_args: {
  credentials: QboCredentials;
  environment: QboEnvironment;
  invoice: unknown;
}): Promise<QboPushResult> {
  throw new Error('Not implemented (Phase 2)');
}

export async function pushCustomer(_args: {
  credentials: QboCredentials;
  environment: QboEnvironment;
  customer: unknown;
}): Promise<QboPushResult> {
  throw new Error('Not implemented (Phase 2)');
}

export async function refreshAccessToken(_credentials: QboCredentials): Promise<QboCredentials> {
  throw new Error('Not implemented (Phase 2)');
}
