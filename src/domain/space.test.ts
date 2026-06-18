import {describe, it, expect} from 'vitest';
import {makeSpace, spaceContains} from './space';
import {feet, inches} from './units';

describe('makeSpace', () => {
  it('rejects non-positive dimensions', () => {
    expect(() => makeSpace(0, inches(48))).toThrow(RangeError);
    expect(() => makeSpace(inches(96), -1)).toThrow(RangeError);
  });
});

describe('spaceContains', () => {
  const sheet = makeSpace(feet(8), feet(4));

  it('accepts bounds inside the sheet', () => {
    expect(
      spaceContains(sheet, {
        minX: feet(1),
        minY: feet(1),
        maxX: feet(2),
        maxY: feet(2),
      })
    ).toBe(true);
  });

  it('accepts bounds flush with the edges', () => {
    expect(
      spaceContains(sheet, {
        minX: 0,
        minY: 0,
        maxX: feet(8),
        maxY: feet(4),
      })
    ).toBe(true);
  });

  it('rejects bounds that spill past an edge', () => {
    expect(
      spaceContains(sheet, {minX: -1, minY: 0, maxX: feet(2), maxY: feet(2)})
    ).toBe(false);
    expect(
      spaceContains(sheet, {
        minX: 0,
        minY: 0,
        maxX: feet(8) + 1,
        maxY: feet(2),
      })
    ).toBe(false);
  });

  it('honors the tolerance for hairline overhang', () => {
    const bounds = {minX: -0.0005, minY: 0, maxX: feet(2), maxY: feet(2)};
    expect(spaceContains(sheet, bounds)).toBe(false);
    expect(spaceContains(sheet, bounds, 1e-3)).toBe(true);
  });
});
