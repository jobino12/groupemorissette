import { toCents, fromCents } from './money';

/**
 * Quebec GST/QST rules (as of 2026):
 *   GST: 5%       — federal
 *   QST: 9.975%   — Quebec, applied to the SUBTOTAL only (NOT compounded on GST).
 *                   Quebec changed from compounded to non-compounded in 2013.
 *
 * Default tax codes seeded per company:
 *   - GST_QST   : both apply (most B2C and B2B in Quebec)
 *   - GST_ONLY  : out-of-province customer in Canada
 *   - EXEMPT    : zero-rated or exempt (export, etc.)
 */

export const GST_RATE = 0.05;
export const QST_RATE = 0.09975;

export interface TaxRates {
  gstRate: number;
  qstRate: number;
}

export interface LineForTax {
  quantity: string | number;
  unitPrice: string | number;
  taxRates: TaxRates;
}

export interface TaxBreakdown {
  subtotal: string;
  gst: string;
  qst: string;
  total: string;
}

/**
 * Compute the tax breakdown for a set of lines.
 * All math is done in integer cents and rounded once at the end per bucket.
 */
export function computeTax(lines: LineForTax[]): TaxBreakdown {
  let subtotalCents = 0;
  let gstCents = 0;
  let qstCents = 0;

  for (const line of lines) {
    const qty = typeof line.quantity === 'string' ? Number(line.quantity) : line.quantity;
    const unit = typeof line.unitPrice === 'string' ? Number(line.unitPrice) : line.unitPrice;
    // Convert unit price to cents first so qty * unitCents stays in integer space —
    // avoids float drift that would round 1.5 * 99.99 down to 149.98 instead of 149.99.
    const unitCents = Math.round(unit * 100);
    const lineSubtotalCents = Math.round(qty * unitCents);
    subtotalCents += lineSubtotalCents;
    gstCents += Math.round(lineSubtotalCents * line.taxRates.gstRate);
    // QST is on the subtotal, NOT on (subtotal + GST). Post-2013 Quebec rule.
    qstCents += Math.round(lineSubtotalCents * line.taxRates.qstRate);
  }

  return {
    subtotal: fromCents(subtotalCents),
    gst: fromCents(gstCents),
    qst: fromCents(qstCents),
    total: fromCents(subtotalCents + gstCents + qstCents),
  };
}

export const STANDARD_QC_RATES: TaxRates = { gstRate: GST_RATE, qstRate: QST_RATE };
export const GST_ONLY_RATES: TaxRates = { gstRate: GST_RATE, qstRate: 0 };
export const EXEMPT_RATES: TaxRates = { gstRate: 0, qstRate: 0 };

// Re-export for callers that just want totals from raw numbers.
export { toCents, fromCents };
