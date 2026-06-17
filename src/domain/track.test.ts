import {describe, it, expect} from 'vitest';
import {trackLength, type Track} from './track';

describe('trackLength', () => {
  it('returns the length of a straight piece unchanged', () => {
    expect(trackLength({kind: 'straight', length: 168})).toBe(168);
  });

  it('returns the arc length of a curved piece', () => {
    const quarterCircle: Track = {
      kind: 'curved',
      arc: {radius: 360, sweep: Math.PI / 2},
    };
    // A quarter of a full circle of radius 360: (2 * pi * 360) / 4.
    expect(trackLength(quarterCircle)).toBeCloseTo((Math.PI * 360) / 2);
  });

  it('rejects non-positive dimensions', () => {
    expect(() => trackLength({kind: 'straight', length: 0})).toThrow(
      RangeError
    );
    expect(() =>
      trackLength({kind: 'curved', arc: {radius: -1, sweep: Math.PI / 2}})
    ).toThrow(RangeError);
  });
});
