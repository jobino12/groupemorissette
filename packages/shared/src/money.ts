/**
 * Money is stored as numeric(12,2) strings in the DB to avoid JS float drift.
 * Compute in integer cents, format at the edge.
 */

export function toCents(amount: string | number): number {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(n)) throw new Error(`Invalid amount: ${amount}`);
  return Math.round(n * 100);
}

export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function formatCAD(amount: string | number, locale: 'fr' | 'en' = 'fr'): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-CA' : 'en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(n);
}
