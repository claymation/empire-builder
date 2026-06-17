import {describe, it, expect} from 'vitest';
import {
  advance,
  arc,
  arcBounds,
  arcEnd,
  arcMidpoint,
  arcStart,
  boundsOfPoints,
  degToRad,
  normalizeAngle,
  posesCoincide,
  radToDeg,
  unionBounds,
  type PlacedArc,
} from './geometry';

describe('degToRad / radToDeg', () => {
  it('round-trips a right angle', () => {
    expect(degToRad(90)).toBeCloseTo(Math.PI / 2);
    expect(radToDeg(Math.PI)).toBeCloseTo(180);
  });
});

describe('arc', () => {
  it('rejects non-positive dimensions', () => {
    expect(() => arc(0, Math.PI)).toThrow(RangeError);
    expect(() => arc(100, -1)).toThrow(RangeError);
  });
});

describe('normalizeAngle', () => {
  it('wraps into [0, 2π)', () => {
    expect(normalizeAngle(0)).toBeCloseTo(0);
    expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2);
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
  });
});

describe('advance', () => {
  it('moves along the heading', () => {
    const east = advance({x: 0, y: 0}, 0, 10);
    expect(east.x).toBeCloseTo(10);
    expect(east.y).toBeCloseTo(0);

    const north = advance({x: 1, y: 1}, Math.PI / 2, 5);
    expect(north.x).toBeCloseTo(1);
    expect(north.y).toBeCloseTo(6);
  });

  it('is also the point on a circle at an angle', () => {
    const onCircle = advance({x: 0, y: 0}, Math.PI / 2, 2);
    expect(onCircle.x).toBeCloseTo(0);
    expect(onCircle.y).toBeCloseTo(2);
  });
});

describe('placed arc helpers', () => {
  // A quarter arc of radius 2 about the origin, from due-east to due-north.
  const quarter: PlacedArc = {
    center: {x: 0, y: 0},
    radius: 2,
    startAngle: 0,
    endAngle: Math.PI / 2,
  };

  it('locates the endpoints and midpoint', () => {
    expect(arcStart(quarter)).toEqual({x: 2, y: 0});
    const end = arcEnd(quarter);
    expect(end.x).toBeCloseTo(0);
    expect(end.y).toBeCloseTo(2);
    const mid = arcMidpoint(quarter);
    expect(mid.x).toBeCloseTo(Math.SQRT2);
    expect(mid.y).toBeCloseTo(Math.SQRT2);
  });

  it('bounds an arc by its bulge, including swept compass points', () => {
    // A left 180° semicircle from the origin heading east: endpoints on x = 0,
    // bulging to +x = R and spanning y from 0 to 2R.
    const semicircle: PlacedArc = {
      center: {x: 0, y: 100},
      radius: 100,
      startAngle: -Math.PI / 2,
      endAngle: Math.PI / 2,
    };
    const b = arcBounds(semicircle);
    expect(b.minX).toBeCloseTo(0);
    expect(b.maxX).toBeCloseTo(100);
    expect(b.minY).toBeCloseTo(0);
    expect(b.maxY).toBeCloseTo(200);
  });
});

describe('boundsOfPoints', () => {
  it('bounds a set of points', () => {
    const b = boundsOfPoints([
      {x: 1, y: 2},
      {x: -3, y: 5},
      {x: 4, y: -1},
    ]);
    expect(b).toEqual({minX: -3, minY: -1, maxX: 4, maxY: 5});
  });

  it('throws on an empty list', () => {
    expect(() => boundsOfPoints([])).toThrow(RangeError);
  });
});

describe('unionBounds', () => {
  it('covers both boxes', () => {
    const a = {minX: 0, minY: 0, maxX: 2, maxY: 2};
    const b = {minX: 1, minY: -1, maxX: 5, maxY: 1};
    expect(unionBounds(a, b)).toEqual({minX: 0, minY: -1, maxX: 5, maxY: 2});
  });
});

describe('posesCoincide', () => {
  const origin = {position: {x: 0, y: 0}, heading: 0};

  it('matches a pose with itself', () => {
    expect(posesCoincide(origin, origin, 1e-6, 1e-6)).toBe(true);
  });

  it('treats headings a full turn apart as equal', () => {
    const spun = {position: {x: 0, y: 0}, heading: 2 * Math.PI};
    expect(posesCoincide(origin, spun, 1e-6, 1e-6)).toBe(true);
  });

  it('rejects poses beyond the position tolerance', () => {
    const moved = {position: {x: 1, y: 0}, heading: 0};
    expect(posesCoincide(origin, moved, 0.5, 1e-6)).toBe(false);
  });

  it('rejects poses beyond the heading tolerance', () => {
    const turned = {position: {x: 0, y: 0}, heading: 0.5};
    expect(posesCoincide(origin, turned, 1e-6, 0.1)).toBe(false);
  });
});
