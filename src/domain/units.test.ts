import {describe, it, expect} from 'vitest';
import {feet, inches, INCHES_PER_FOOT, MM_PER_INCH, toInches} from './units';

describe('units', () => {
  it('converts inches to millimeters', () => {
    expect(inches(1)).toBeCloseTo(MM_PER_INCH);
    expect(inches(10)).toBeCloseTo(254);
  });

  it('converts feet to millimeters', () => {
    expect(feet(1)).toBeCloseTo(304.8);
    expect(feet(1)).toBeCloseTo(inches(INCHES_PER_FOOT));
  });

  it('round-trips millimeters and inches', () => {
    expect(toInches(inches(7))).toBeCloseTo(7);
  });

  it('rejects non-finite input', () => {
    expect(() => inches(Infinity)).toThrow(RangeError);
    expect(() => feet(NaN)).toThrow(RangeError);
    expect(() => toInches(Infinity)).toThrow(RangeError);
  });
});
