import {describe, it, expect} from 'vitest';
import {
  advance,
  arc,
  arcBounds,
  arcEnd,
  arcEndPose,
  arcLength,
  arcMidpoint,
  arcStart,
  boundsOfPoints,
  degToRad,
  dot,
  normalizeAngle,
  snapToIncrement,
  posesCoincide,
  radToDeg,
  segmentBounds,
  segmentEnd,
  segmentEndPose,
  unionBounds,
  unitVector,
  type PlacedArc,
  type PlacedSegment,
  type Pose,
} from './geometry';

describe('degToRad / radToDeg', () => {
  it('round-trips a right angle through both directions', () => {
    expect(radToDeg(degToRad(90))).toBeCloseTo(90);
    expect(degToRad(radToDeg(Math.PI / 2))).toBeCloseTo(Math.PI / 2);
  });
});

describe('arc / arcLength', () => {
  it('measures arc length as radius × sweep', () => {
    expect(arcLength(arc(100, Math.PI / 2))).toBeCloseTo((100 * Math.PI) / 2);
  });

  it('rejects non-positive dimensions', () => {
    expect(() => arc(0, Math.PI)).toThrow(RangeError);
    expect(() => arc(100, -1)).toThrow(RangeError);
    expect(() => arcLength({radius: -1, sweep: Math.PI})).toThrow(RangeError);
  });
});

describe('normalizeAngle', () => {
  it('wraps into [0, 2π)', () => {
    expect(normalizeAngle(0)).toBeCloseTo(0);
    expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2);
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
  });
});

describe('snapToIncrement', () => {
  it('snaps to the nearest multiple within the threshold', () => {
    expect(snapToIncrement(177, 15, 5)).toBe(180);
    expect(snapToIncrement(2, 15, 5)).toBe(0); // toward zero too
  });

  it('leaves values outside the threshold untouched', () => {
    expect(snapToIncrement(38, 15, 5)).toBe(38);
    expect(snapToIncrement(8, 15, 5)).toBe(8); // between 0 and 15, snaps to neither
  });
});

describe('advance', () => {
  it('moves along the heading', () => {
    const north = advance({x: 1, y: 1}, Math.PI / 2, 5);
    expect(north.x).toBeCloseTo(1);
    expect(north.y).toBeCloseTo(6);
  });
});

describe('dot / unitVector', () => {
  it('computes the dot product', () => {
    expect(dot({x: 2, y: 3}, {x: 4, y: 5})).toBeCloseTo(23);
  });

  it('builds a unit vector along a heading', () => {
    const up = unitVector(Math.PI / 2);
    expect(up.x).toBeCloseTo(0);
    expect(up.y).toBeCloseTo(1);
    expect(dot(up, up)).toBeCloseTo(1);
  });
});

describe('placed segment', () => {
  const segment: PlacedSegment = {
    kind: 'segment',
    start: {position: {x: 2, y: 3}, heading: Math.PI / 2},
    length: 10,
  };

  it('ends ahead along its heading, keeping the heading', () => {
    expect(segmentEnd(segment).x).toBeCloseTo(2);
    expect(segmentEnd(segment).y).toBeCloseTo(13);
    const exit = segmentEndPose(segment);
    expect(exit.heading).toBeCloseTo(Math.PI / 2);
  });

  it('bounds its endpoints', () => {
    const b = segmentBounds(segment);
    expect(b.minX).toBeCloseTo(2);
    expect(b.minY).toBeCloseTo(3);
    expect(b.maxX).toBeCloseTo(2);
    expect(b.maxY).toBeCloseTo(13);
  });
});

describe('placed arc', () => {
  // A left (CCW) quarter arc of radius 100, entering at the origin heading east.
  const left: PlacedArc = {
    kind: 'arc',
    start: {position: {x: 0, y: 0}, heading: 0},
    radius: 100,
    sweep: Math.PI / 2,
  };

  it('ends a quarter-turn to the left, turning the heading with it', () => {
    expect(arcStart(left)).toEqual({x: 0, y: 0});
    expect(arcEnd(left).x).toBeCloseTo(100);
    expect(arcEnd(left).y).toBeCloseTo(100);
    expect(arcEndPose(left).heading).toBeCloseTo(Math.PI / 2);
    const mid = arcMidpoint(left);
    expect(mid.x).toBeCloseTo(100 * Math.sin(Math.PI / 4));
    expect(mid.y).toBeCloseTo(100 * (1 - Math.cos(Math.PI / 4)));
  });

  it('bends the other way and shortens the heading for a negative sweep', () => {
    const right: PlacedArc = {...left, sweep: -Math.PI / 2};
    expect(arcEnd(right).x).toBeCloseTo(100);
    expect(arcEnd(right).y).toBeCloseTo(-100);
    expect(arcEndPose(right).heading).toBeCloseTo(-Math.PI / 2);
  });

  it('works for a start heading off the axes', () => {
    // Entering heading north, a left quarter turn ends heading west.
    const north: PlacedArc = {
      kind: 'arc',
      start: {position: {x: 10, y: 10}, heading: Math.PI / 2},
      radius: 100,
      sweep: Math.PI / 2,
    };
    expect(arcEnd(north).x).toBeCloseTo(-90);
    expect(arcEnd(north).y).toBeCloseTo(110);
    expect(arcEndPose(north).heading).toBeCloseTo(Math.PI);
  });

  it('bounds an arc by its bulge, including swept compass points', () => {
    // A left 180° semicircle from the origin heading east: endpoints on x = 0,
    // bulging to +x = R and spanning y from 0 to 2R.
    const semicircle: PlacedArc = {...left, sweep: Math.PI};
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
  const origin: Pose = {position: {x: 0, y: 0}, heading: 0};

  it('matches a pose with itself', () => {
    expect(posesCoincide(origin, origin, 1e-6, 1e-6)).toBe(true);
  });

  it('treats headings a full turn apart as equal', () => {
    const spun: Pose = {position: {x: 0, y: 0}, heading: 2 * Math.PI};
    expect(posesCoincide(origin, spun, 1e-6, 1e-6)).toBe(true);
  });

  it('rejects poses beyond the position tolerance', () => {
    const moved: Pose = {position: {x: 1, y: 0}, heading: 0};
    expect(posesCoincide(origin, moved, 0.5, 1e-6)).toBe(false);
  });

  it('rejects poses beyond the heading tolerance', () => {
    const turned: Pose = {position: {x: 0, y: 0}, heading: 0.5};
    expect(posesCoincide(origin, turned, 1e-6, 0.1)).toBe(false);
  });
});
