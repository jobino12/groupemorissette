import { describe, expect, it } from 'vitest';
import { computeTax, STANDARD_QC_RATES, GST_ONLY_RATES, EXEMPT_RATES } from './tax';

describe('computeTax', () => {
  it('applies GST and QST independently on a single line', () => {
    const result = computeTax([
      { quantity: 1, unitPrice: 100, taxRates: STANDARD_QC_RATES },
    ]);
    expect(result.subtotal).toBe('100.00');
    expect(result.gst).toBe('5.00');
    expect(result.qst).toBe('9.98'); // 100 * 0.09975 = 9.975 → 9.98
    expect(result.total).toBe('114.98');
  });

  it('does NOT compound QST on top of GST (post-2013 Quebec rule)', () => {
    const result = computeTax([
      { quantity: 1, unitPrice: 1000, taxRates: STANDARD_QC_RATES },
    ]);
    // Compound (wrong): 1000 * 0.09975 on 1050 = 104.74
    // Non-compound (correct): 1000 * 0.09975 = 99.75
    expect(result.qst).toBe('99.75');
    expect(result.gst).toBe('50.00');
    expect(result.total).toBe('1149.75');
  });

  it('handles GST-only (out-of-province customer)', () => {
    const result = computeTax([
      { quantity: 2, unitPrice: 50, taxRates: GST_ONLY_RATES },
    ]);
    expect(result.subtotal).toBe('100.00');
    expect(result.gst).toBe('5.00');
    expect(result.qst).toBe('0.00');
    expect(result.total).toBe('105.00');
  });

  it('handles exempt lines', () => {
    const result = computeTax([
      { quantity: 1, unitPrice: 250, taxRates: EXEMPT_RATES },
    ]);
    expect(result.gst).toBe('0.00');
    expect(result.qst).toBe('0.00');
    expect(result.total).toBe('250.00');
  });

  it('sums multiple lines correctly', () => {
    const result = computeTax([
      { quantity: 2, unitPrice: 75, taxRates: STANDARD_QC_RATES },
      { quantity: 1, unitPrice: 50, taxRates: STANDARD_QC_RATES },
      { quantity: 3, unitPrice: 10, taxRates: EXEMPT_RATES },
    ]);
    expect(result.subtotal).toBe('230.00');
    // GST on taxable (200) = 10.00
    expect(result.gst).toBe('10.00');
    // QST on taxable (200) = 19.95
    expect(result.qst).toBe('19.95');
    expect(result.total).toBe('259.95');
  });

  it('handles fractional quantities', () => {
    const result = computeTax([
      { quantity: '1.5', unitPrice: '99.99', taxRates: STANDARD_QC_RATES },
    ]);
    expect(result.subtotal).toBe('149.99'); // 1.5 * 99.99 = 149.985 → 149.99
  });
});
