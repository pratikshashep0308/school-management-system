// frontend/src/components/fms/Money.test.js
//
// The API returns integer PAISE. Getting this wrong once, in one component,
// would be wrong on every screen — so it is tested exhaustively here and
// nowhere else formats money by hand.

import { formatPaise } from './Money';

describe('formatPaise — paise to Indian-grouped rupees', () => {
  test('groups the Indian way, not the Western way', () => {
    // 1,23,456.78 — last three digits, then pairs.
    expect(formatPaise(12345678)).toBe('₹1,23,456.78');
    // The Western grouping would be ₹123,456.78, which is what a naive
    // toLocaleString() without 'en-IN' produces.
    expect(formatPaise(12345678)).not.toBe('₹123,456.78');
  });

  test('handles a plain thousand', () => {
    expect(formatPaise(100000)).toBe('₹1,000.00');
  });

  test('handles a crore', () => {
    expect(formatPaise(1000000000)).toBe('₹1,00,00,000.00');
  });

  test('one paisa is not lost', () => {
    expect(formatPaise(1)).toBe('₹0.01');
  });

  test('zero is a real figure and shows as zero', () => {
    expect(formatPaise(0)).toBe('₹0.00');
  });

  test('MISSING IS NOT ZERO', () => {
    // Rendering "no value" as ₹0.00 is how a reader concludes a payment was
    // free rather than unrecorded.
    expect(formatPaise(null)).toBe('—');
    expect(formatPaise(undefined)).toBe('—');
    expect(formatPaise(NaN)).toBe('—');
  });

  test('negatives keep their sign', () => {
    expect(formatPaise(-500000)).toBe('-₹5,000.00');
    expect(formatPaise(-1)).toBe('-₹0.01');
  });

  test('showSign marks positives explicitly when asked', () => {
    expect(formatPaise(100000, { showSign: true })).toBe('+₹1,000.00');
    expect(formatPaise(-100000, { showSign: true })).toBe('-₹1,000.00');
  });

  test('always two decimal places', () => {
    expect(formatPaise(100)).toBe('₹1.00');
    expect(formatPaise(110)).toBe('₹1.10');
    expect(formatPaise(111)).toBe('₹1.11');
  });

  test('rejects nonsense rather than rendering it', () => {
    expect(formatPaise(Infinity)).toBe('—');
    expect(formatPaise(-Infinity)).toBe('—');
  });
});