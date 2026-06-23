import {describe, it, expect} from 'vitest';
import {
  add,
  advance,
  arc,
  arcBounds,
  arcCenter,
  arcEndPoint,
  arcEndPose,
  arcLength,
  arcMidpoint,
  arcStartPoint,
  boundsOfPoints,
  cross,
  degToRad,
  distance,
  dot,
  lineIntersection,
  normalizeAngle,
  onLine,
  posesCoincide,
  projectOntoLine,
  radToDeg,
  scale,
  segmentBounds,
  segmentEnd,
  segmentEndPose,
  subtract,
  unionBounds,
  unitArcChord,
  unitVector,
  type PlacedArc,
  type PlacedSegment,
  type Pose,
} from './geometry';

// ── Points ──

describe('distance', () => {
  it('measures a 3-4-5 triangle', () => {
    expect(distance({x: 1, y: 2}, {x: 4, y: 6})).toBeCloseTo(5);
  });
});

// ── Vectors ──

describe('dot', () => {
  it('computes the dot product', () => {
    expect(dot({x: 2, y: 3}, {x: 4, y: 5})).toBeCloseTo(23);
  });
});

describe('cross', () => {
  it('is the signed parallelogram area', () => {
    expect(cross({x: 2, y: 0}, {x: 0, y: 3})).toBeCloseTo(6);
    expect(cross({x: 0, y: 3}, {x: 2, y: 0})).toBeCloseTo(-6);
  });

  it('is zero for parallel vectors', () => {
    expect(cross({x: 2, y: 4}, {x: 1, y: 2})).toBeCloseTo(0);
  });
});

describe('add / subtract / scale', () => {
  it('adds component-wise', () => {
    expect(add({x: 1, y: 2}, {x: 3, y: -1})).toEqual({x: 4, y: 1});
  });

  it('subtracts to the vector between two points', () => {
    expect(subtract({x: 4, y: 1}, {x: 1, y: 2})).toEqual({x: 3, y: -1});
  });

  it('scales by a factor', () => {
    expect(scale({x: 3, y: -1}, 2)).toEqual({x: 6, y: -2});
  });
});

describe('unitVector', () => {
  it('builds a unit vector along a heading', () => {
    const up = unitVector(Math.PI / 2);
    expect(up.x).toBeCloseTo(0);
    expect(up.y).toBeCloseTo(1);
    expect(dot(up, up)).toBeCloseTo(1);
  });
});

describe('advance', () => {
  it('moves along the heading', () => {
    const north = advance({x: 1, y: 1}, Math.PI / 2, 5);
    expect(north.x).toBeCloseTo(1);
    expect(north.y).toBeCloseTo(6);
  });
});

// ── Angles ──

describe('degToRad / radToDeg', () => {
  it('round-trips a right angle through both directions', () => {
    expect(radToDeg(degToRad(90))).toBeCloseTo(90);
    expect(degToRad(radToDeg(Math.PI / 2))).toBeCloseTo(Math.PI / 2);
  });
});

describe('normalizeAngle', () => {
  it('wraps into [0, 2π)', () => {
    expect(normalizeAngle(0)).toBeCloseTo(0);
    expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2);
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
  });
});

// ── Poses ──

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

// ── Lines ──

describe('lineIntersection', () => {
  it('finds where two crossing lines meet', () => {
    const horizontal = {origin: {x: 0, y: 5}, direction: {x: 1, y: 0}};
    const vertical = {origin: {x: 3, y: 0}, direction: {x: 0, y: 1}};
    expect(lineIntersection(horizontal, vertical)).toEqual({x: 3, y: 5});
  });

  it('returns null for parallel lines', () => {
    const a = {origin: {x: 0, y: 0}, direction: {x: 1, y: 1}};
    const b = {origin: {x: 1, y: 0}, direction: {x: 1, y: 1}};
    expect(lineIntersection(a, b)).toBeNull();
  });
});

describe('projectOntoLine', () => {
  it('drops a point onto a horizontal line', () => {
    const foot = projectOntoLine(
      {x: 3, y: 4},
      {origin: {x: 0, y: 0}, direction: {x: 1, y: 0}}
    );
    expect(foot.x).toBeCloseTo(3);
    expect(foot.y).toBeCloseTo(0);
  });

  it('drops a point onto a vertical line offset from the origin', () => {
    const foot = projectOntoLine(
      {x: 2, y: 7},
      {origin: {x: 5, y: 0}, direction: {x: 0, y: 1}}
    );
    expect(foot.x).toBeCloseTo(5);
    expect(foot.y).toBeCloseTo(7);
  });

  it('projects onto a tilted line through a non-origin point', () => {
    // Line through (1,1) at 45°: the foot of (1,3) lands at (2,2).
    const foot = projectOntoLine(
      {x: 1, y: 3},
      {origin: {x: 1, y: 1}, direction: {x: 1, y: 1}}
    );
    expect(foot.x).toBeCloseTo(2);
    expect(foot.y).toBeCloseTo(2);
  });

  it('returns the origin for a degenerate line', () => {
    const foot = projectOntoLine(
      {x: 3, y: 4},
      {origin: {x: 9, y: 9}, direction: {x: 0, y: 0}}
    );
    expect(foot).toEqual({x: 9, y: 9});
  });
});

describe('onLine', () => {
  // The line y = 5 (horizontal through (0, 5)).
  const line = {origin: {x: 0, y: 5}, direction: {x: 2, y: 0}};

  it('accepts a point on the line', () => {
    expect(onLine({x: 37, y: 5}, line)).toBe(true);
  });

  it('rejects a point off the line', () => {
    expect(onLine({x: 37, y: 5.001}, line)).toBe(false);
  });
});

// ── Bounds ──

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

// ── Placed segments ──

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

// ── Arcs ──

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

describe('unitArcChord', () => {
  it('gives the start→end offset of a unit-radius arc', () => {
    // A 90° left arc from east ends at (100, 100) for radius 100, so the unit
    // chord is (1, 1).
    const chord = unitArcChord(0, Math.PI / 2);
    expect(chord.x).toBeCloseTo(1);
    expect(chord.y).toBeCloseTo(1);
  });

  it('points the other way for a clockwise sweep', () => {
    // A 90° right arc from east ends at (100, -100) for radius 100 → (1, -1).
    const chord = unitArcChord(0, -Math.PI / 2);
    expect(chord.x).toBeCloseTo(1);
    expect(chord.y).toBeCloseTo(-1);
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
    expect(arcStartPoint(left)).toEqual({x: 0, y: 0});
    expect(arcEndPoint(left).x).toBeCloseTo(100);
    expect(arcEndPoint(left).y).toBeCloseTo(100);
    expect(arcEndPose(left).heading).toBeCloseTo(Math.PI / 2);
    const mid = arcMidpoint(left);
    expect(mid.x).toBeCloseTo(100 * Math.sin(Math.PI / 4));
    expect(mid.y).toBeCloseTo(100 * (1 - Math.cos(Math.PI / 4)));
  });

  // The center sits one radius square to the travel direction — to its left for
  // a CCW (positive) sweep, to its right for a CW (negative) one — so sweeping
  // the start heading around the compass walks the center through every quadrant.
  const centerOf = (heading: number, sweep: number) =>
    arcCenter({
      kind: 'arc',
      start: {position: {x: 0, y: 0}, heading},
      radius: 100,
      sweep,
    });

  it('sits a radius to the left of travel for a CCW arc, in each quadrant', () => {
    expect(centerOf(0, Math.PI / 2).x).toBeCloseTo(0); // east → north
    expect(centerOf(0, Math.PI / 2).y).toBeCloseTo(100);
    expect(centerOf(Math.PI / 2, Math.PI / 2).x).toBeCloseTo(-100); // north → west
    expect(centerOf(Math.PI / 2, Math.PI / 2).y).toBeCloseTo(0);
    expect(centerOf(Math.PI, Math.PI / 2).x).toBeCloseTo(0); // west → south
    expect(centerOf(Math.PI, Math.PI / 2).y).toBeCloseTo(-100);
    const diagonal = centerOf(Math.PI / 4, Math.PI / 2); // off-axis: center at 135°
    expect(diagonal.x).toBeCloseTo(-100 * Math.SQRT1_2);
    expect(diagonal.y).toBeCloseTo(100 * Math.SQRT1_2);
  });

  it('sits a radius to the right of travel for a CW arc, in each quadrant', () => {
    expect(centerOf(0, -Math.PI / 2).x).toBeCloseTo(0); // east → south
    expect(centerOf(0, -Math.PI / 2).y).toBeCloseTo(-100);
    expect(centerOf(Math.PI / 2, -Math.PI / 2).x).toBeCloseTo(100); // north → east
    expect(centerOf(Math.PI / 2, -Math.PI / 2).y).toBeCloseTo(0);
    expect(centerOf(Math.PI, -Math.PI / 2).x).toBeCloseTo(0); // west → north
    expect(centerOf(Math.PI, -Math.PI / 2).y).toBeCloseTo(100);
  });

  it('bends the other way and shortens the heading for a negative sweep', () => {
    const right: PlacedArc = {...left, sweep: -Math.PI / 2};
    expect(arcEndPoint(right).x).toBeCloseTo(100);
    expect(arcEndPoint(right).y).toBeCloseTo(-100);
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
    expect(arcEndPoint(north).x).toBeCloseTo(-90);
    expect(arcEndPoint(north).y).toBeCloseTo(110);
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
