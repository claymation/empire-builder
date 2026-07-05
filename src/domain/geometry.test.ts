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
  boundsOfPoints,
  colinear,
  composePose,
  cross,
  degToRad,
  headingOf,
  inversePose,
  distance,
  dot,
  lineIntersection,
  nearestLineTo,
  normalize,
  normalizeAngle,
  onLine,
  posesAlign,
  posesEqual,
  projectOntoLine,
  reversePose,
  radToDeg,
  scale,
  segmentBounds,
  segmentEndPoint,
  segmentEndPose,
  subtract,
  tangentAndNormalLines,
  unionBounds,
  unitArcChord,
  unitVector,
  type Line,
  type PlacedArc,
  type PlacedSegment,
  type Pose,
} from './geometry';

// ── Points ──

describe('distance', () => {
  it('measures a 3-4-5 triangle in both quadrants', () => {
    expect(distance({x: 1, y: 2}, {x: 4, y: 6})).toBeCloseTo(5);
    expect(distance({x: 2, y: 3}, {x: -1, y: -1})).toBeCloseTo(5);
  });

  it('is zero between a point and itself', () => {
    expect(distance({x: -7, y: 4}, {x: -7, y: 4})).toBe(0);
  });
});

// ── Vectors ──

describe('dot', () => {
  it('computes the dot product', () => {
    expect(dot({x: 2, y: 3}, {x: 4, y: 5})).toBeCloseTo(23);
  });

  it('is zero for perpendicular vectors', () => {
    expect(dot({x: 3, y: 0}, {x: 0, y: -4})).toBeCloseTo(0);
  });

  it('is negative when the vectors oppose', () => {
    expect(dot({x: 1, y: 2}, {x: -3, y: -1})).toBeCloseTo(-5);
  });
});

describe('cross', () => {
  it('is the signed parallelogram area, flipping with order', () => {
    expect(cross({x: 2, y: 0}, {x: 0, y: 3})).toBeCloseTo(6);
    expect(cross({x: 0, y: 3}, {x: 2, y: 0})).toBeCloseTo(-6);
  });

  it('is zero for parallel and anti-parallel vectors', () => {
    expect(cross({x: 2, y: 4}, {x: 1, y: 2})).toBeCloseTo(0);
    expect(cross({x: 2, y: 4}, {x: -1, y: -2})).toBeCloseTo(0);
  });
});

describe('add / subtract / scale', () => {
  it('adds component-wise', () => {
    expect(add({x: 1, y: 2}, {x: 3, y: -1})).toEqual({x: 4, y: 1});
  });

  it('subtracts to the vector from b to a', () => {
    expect(subtract({x: 4, y: 1}, {x: 1, y: 2})).toEqual({x: 3, y: -1});
  });

  it('scales by a factor, including reversal', () => {
    expect(scale({x: 3, y: -1}, 2)).toEqual({x: 6, y: -2});
    expect(scale({x: 3, y: -1}, -2)).toEqual({x: -6, y: 2});
  });
});

describe('headingOf', () => {
  it('reads the heading in every quadrant, inverting unitVector', () => {
    for (const heading of [0, 0.7, 2.1, Math.PI, -2.1, -0.7]) {
      expect(headingOf(unitVector(heading))).toBeCloseTo(heading);
    }
    expect(headingOf({x: 3, y: 3})).toBeCloseTo(Math.PI / 4); // any length
  });
});

describe('unitVector', () => {
  it('points along each cardinal direction', () => {
    const east = unitVector(0);
    expect(east.x).toBeCloseTo(1);
    expect(east.y).toBeCloseTo(0);
    const north = unitVector(Math.PI / 2);
    expect(north.x).toBeCloseTo(0);
    expect(north.y).toBeCloseTo(1);
    const west = unitVector(Math.PI);
    expect(west.x).toBeCloseTo(-1);
    expect(west.y).toBeCloseTo(0);
    const south = unitVector(-Math.PI / 2);
    expect(south.x).toBeCloseTo(0);
    expect(south.y).toBeCloseTo(-1);
  });

  it('is unit length on a diagonal', () => {
    const ne = unitVector(Math.PI / 4);
    expect(ne.x).toBeCloseTo(Math.SQRT1_2);
    expect(ne.y).toBeCloseTo(Math.SQRT1_2);
    expect(dot(ne, ne)).toBeCloseTo(1);
  });
});

describe('normalize', () => {
  it('rescales a vector to unit length, keeping its direction', () => {
    const unit = normalize({x: 3, y: 4}); // 3-4-5
    expect(unit.x).toBeCloseTo(0.6);
    expect(unit.y).toBeCloseTo(0.8);
    expect(Math.hypot(unit.x, unit.y)).toBeCloseTo(1);
  });

  it('returns the zero vector for a degenerate input', () => {
    expect(normalize({x: 0, y: 0})).toEqual({x: 0, y: 0});
  });
});

describe('advance', () => {
  it('moves along each quadrant from a non-origin point', () => {
    const east = advance({x: 1, y: 1}, 0, 4);
    expect(east.x).toBeCloseTo(5);
    expect(east.y).toBeCloseTo(1);
    const north = advance({x: 1, y: 1}, Math.PI / 2, 5);
    expect(north.x).toBeCloseTo(1);
    expect(north.y).toBeCloseTo(6);
    // 225° at distance √2 steps one unit down and one unit left.
    const southwest = advance({x: 2, y: 2}, (5 * Math.PI) / 4, Math.SQRT2);
    expect(southwest.x).toBeCloseTo(1);
    expect(southwest.y).toBeCloseTo(1);
  });
});

// ── Angles ──

describe('degToRad / radToDeg', () => {
  it('converts known angles in both directions', () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI);
    expect(degToRad(-90)).toBeCloseTo(-Math.PI / 2);
    expect(radToDeg(Math.PI)).toBeCloseTo(180);
  });

  it('round-trips an off-grid angle', () => {
    expect(radToDeg(degToRad(37))).toBeCloseTo(37);
  });
});

describe('normalizeAngle', () => {
  it('wraps negatives and angles past a full turn', () => {
    expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2);
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeAngle((5 * Math.PI) / 2)).toBeCloseTo(Math.PI / 2);
  });

  it('maps exact full turns to zero', () => {
    expect(normalizeAngle(0)).toBeCloseTo(0);
    expect(normalizeAngle(2 * Math.PI)).toBeCloseTo(0);
    expect(normalizeAngle(-2 * Math.PI)).toBeCloseTo(0);
  });
});

// ── Poses ──

describe('posesEqual', () => {
  const origin: Pose = {position: {x: 0, y: 0}, heading: 0};

  it('matches a pose with itself', () => {
    expect(posesEqual(origin, origin, 1e-6, 1e-6)).toBe(true);
  });

  it('treats headings a full turn apart as equal', () => {
    const spun: Pose = {position: {x: 0, y: 0}, heading: 2 * Math.PI};
    expect(posesEqual(origin, spun, 1e-6, 1e-6)).toBe(true);
  });

  it('measures the heading gap across the 0 / 2π seam', () => {
    const a: Pose = {position: {x: 0, y: 0}, heading: 0.05};
    const b: Pose = {position: {x: 0, y: 0}, heading: 2 * Math.PI - 0.05};
    expect(posesEqual(a, b, 1e-6, 0.2)).toBe(true); // gap 0.1
    expect(posesEqual(a, b, 1e-6, 0.05)).toBe(false);
  });

  it('accepts a separation exactly at the position tolerance but not beyond', () => {
    const moved: Pose = {position: {x: 0.5, y: 0}, heading: 0};
    expect(posesEqual(origin, moved, 0.5, 1e-6)).toBe(true);
    expect(posesEqual(origin, moved, 0.4, 1e-6)).toBe(false);
  });

  it('rejects poses beyond the heading tolerance', () => {
    const turned: Pose = {position: {x: 0, y: 0}, heading: 0.5};
    expect(posesEqual(origin, turned, 1e-6, 0.1)).toBe(false);
  });
});

describe('reversePose', () => {
  it('keeps the position and turns the heading a half-turn', () => {
    const pose: Pose = {position: {x: 3, y: -4}, heading: Math.PI / 6};
    const reversed = reversePose(pose);
    expect(reversed.position).toEqual({x: 3, y: -4});
    expect(normalizeAngle(reversed.heading)).toBeCloseTo(Math.PI / 6 + Math.PI);
  });
});

describe('posesAlign', () => {
  const east: Pose = {position: {x: 10, y: 5}, heading: 0};

  it('aligns poses facing the same way at the same place', () => {
    const same: Pose = {position: {x: 10, y: 5}, heading: 2 * Math.PI};
    expect(posesAlign(east, same, 1e-6, 1e-6)).toBe(true);
  });

  it('aligns poses facing exactly opposite ways — same line', () => {
    const west: Pose = {position: {x: 10, y: 5}, heading: Math.PI};
    expect(posesAlign(east, west, 1e-6, 1e-6)).toBe(true);
    // posesEqual, which demands the same heading, would not.
    expect(posesEqual(east, west, 1e-6, 1e-6)).toBe(false);
  });

  it('rejects a heading off the line by more than the tolerance', () => {
    const skew: Pose = {position: {x: 10, y: 5}, heading: 0.2};
    expect(posesAlign(east, skew, 1e-6, 0.1)).toBe(false);
  });

  it('rejects a separated position even when headings match', () => {
    const moved: Pose = {position: {x: 11, y: 5}, heading: Math.PI};
    expect(posesAlign(east, moved, 0.5, 1e-6)).toBe(false);
  });
});

describe('composePose', () => {
  const IDENTITY: Pose = {position: {x: 0, y: 0}, heading: 0};

  it('leaves a local pose unchanged under the identity frame', () => {
    const local: Pose = {position: {x: 3, y: -4}, heading: degToRad(50)};
    const composed = composePose(IDENTITY, local);
    expect(composed.position.x).toBeCloseTo(3);
    expect(composed.position.y).toBeCloseTo(-4);
    expect(composed.heading).toBeCloseTo(degToRad(50));
  });

  // A frame with both a nonzero position and heading maps a hand-computed local
  // pose to its known world pose, from an off-axis frame in each quadrant. The
  // world position is the frame's position plus the local position rotated by the
  // frame's heading; the world heading is the sum. A dropped rotation, a swapped
  // translate/rotate order, or a sign slip fails.
  const local: Pose = {position: {x: 2, y: 1}, heading: degToRad(20)};
  const frameHeadings = [
    degToRad(35),
    degToRad(125),
    degToRad(215),
    degToRad(305),
  ];
  for (const heading of frameHeadings) {
    const frame: Pose = {position: {x: -6, y: 8}, heading};
    it(`applies the frame's rotation then translation (${Math.round(radToDeg(heading))}°)`, () => {
      const cos = Math.cos(heading);
      const sin = Math.sin(heading);
      const expectedX =
        frame.position.x + (local.position.x * cos - local.position.y * sin);
      const expectedY =
        frame.position.y + (local.position.x * sin + local.position.y * cos);
      const composed = composePose(frame, local);
      expect(composed.position.x).toBeCloseTo(expectedX);
      expect(composed.position.y).toBeCloseTo(expectedY);
      expect(composed.heading).toBeCloseTo(heading + local.heading);
    });
  }
});

describe('inversePose', () => {
  // Composed with its own inverse either way, a frame is the identity motion.
  const frames: Pose[] = [
    {position: {x: 5, y: -3}, heading: degToRad(40)},
    {position: {x: -7, y: 2}, heading: degToRad(160)},
    {position: {x: -1, y: -9}, heading: degToRad(250)},
    {position: {x: 8, y: 6}, heading: degToRad(310)},
  ];
  for (const frame of frames) {
    const label = `${Math.round(radToDeg(frame.heading))}°`;
    it(`undoes the frame from the left (${label})`, () => {
      const identity = composePose(inversePose(frame), frame);
      expect(identity.position.x).toBeCloseTo(0);
      expect(identity.position.y).toBeCloseTo(0);
      expect(Math.sin(identity.heading)).toBeCloseTo(0);
      expect(Math.cos(identity.heading)).toBeCloseTo(1);
    });

    it(`undoes the frame from the right (${label})`, () => {
      const identity = composePose(frame, inversePose(frame));
      expect(identity.position.x).toBeCloseTo(0);
      expect(identity.position.y).toBeCloseTo(0);
      expect(Math.sin(identity.heading)).toBeCloseTo(0);
      expect(Math.cos(identity.heading)).toBeCloseTo(1);
    });
  }
});

// ── Lines ──

describe('lineIntersection', () => {
  it('finds where a horizontal and a vertical line meet', () => {
    const horizontal: Line = {origin: {x: 0, y: 5}, direction: {x: 1, y: 0}};
    const vertical: Line = {origin: {x: 3, y: 0}, direction: {x: 0, y: 1}};
    expect(lineIntersection(horizontal, vertical)).toEqual({x: 3, y: 5});
  });

  it('finds the crossing of two tilted lines', () => {
    // y = x crosses y = -x + 4 at (2, 2).
    const up: Line = {origin: {x: 0, y: 0}, direction: {x: 1, y: 1}};
    const down: Line = {origin: {x: 0, y: 4}, direction: {x: 1, y: -1}};
    const p = lineIntersection(up, down);
    expect(p?.x).toBeCloseTo(2);
    expect(p?.y).toBeCloseTo(2);
  });

  it('is unaffected by the sign of a direction', () => {
    const horizontal: Line = {origin: {x: 0, y: 5}, direction: {x: -2, y: 0}};
    const vertical: Line = {origin: {x: 3, y: 0}, direction: {x: 0, y: 1}};
    expect(lineIntersection(horizontal, vertical)).toEqual({x: 3, y: 5});
  });

  it('returns null for parallel and for coincident lines', () => {
    const a: Line = {origin: {x: 0, y: 0}, direction: {x: 1, y: 1}};
    const parallel: Line = {origin: {x: 1, y: 0}, direction: {x: 1, y: 1}};
    const coincident: Line = {origin: {x: 5, y: 5}, direction: {x: 2, y: 2}};
    expect(lineIntersection(a, parallel)).toBeNull();
    expect(lineIntersection(a, coincident)).toBeNull();
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

  it('returns a point already on the line unchanged', () => {
    const foot = projectOntoLine(
      {x: 4, y: 4},
      {origin: {x: 1, y: 1}, direction: {x: 1, y: 1}}
    );
    expect(foot.x).toBeCloseTo(4);
    expect(foot.y).toBeCloseTo(4);
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
  const tilted: Line = {origin: {x: 1, y: 1}, direction: {x: 1, y: 1}};

  it('accepts points on the line, either side of the origin', () => {
    expect(onLine({x: 5, y: 5}, tilted)).toBe(true);
    expect(onLine({x: -3, y: -3}, tilted)).toBe(true);
  });

  it('rejects a point a hair off the line', () => {
    expect(onLine({x: 5, y: 5.001}, tilted)).toBe(false);
  });
});

describe('nearestLineTo', () => {
  // A horizontal line y = 50 and a vertical line x = 100.
  const horizontal: Line = {origin: {x: 0, y: 50}, direction: {x: 1, y: 0}};
  const vertical: Line = {origin: {x: 100, y: 0}, direction: {x: 0, y: 1}};

  it('picks the nearest line, carrying the projection onto it', () => {
    // (103, 250): 3 from the vertical, 200 from the horizontal.
    const found = nearestLineTo({x: 103, y: 250}, [horizontal, vertical], 6);
    expect(found?.line).toBe(vertical);
    expect(found?.point.x).toBeCloseTo(100);
    expect(found?.point.y).toBeCloseTo(250);
  });

  it('picks the nearer when both are in range, regardless of order', () => {
    // (98, 53): 2 from the vertical, 3 from the horizontal.
    const point = {x: 98, y: 53};
    expect(nearestLineTo(point, [horizontal, vertical], 6)?.line).toBe(
      vertical
    );
    expect(nearestLineTo(point, [vertical, horizontal], 6)?.line).toBe(
      vertical
    );
  });

  it('takes a gap exactly at the tolerance, not one past it', () => {
    expect(nearestLineTo({x: 300, y: 56}, [horizontal], 6)).not.toBeNull();
    expect(nearestLineTo({x: 300, y: 56.01}, [horizontal], 6)).toBeNull();
  });

  it('finds nothing among no lines', () => {
    expect(nearestLineTo({x: 100, y: 50}, [], 6)).toBeNull();
  });
});

describe('colinear', () => {
  const xAxis: Line = {origin: {x: 0, y: 0}, direction: {x: 1, y: 0}};

  it('holds when the pose lies on the line and heads along it (either way)', () => {
    expect(colinear({position: {x: 5, y: 0}, heading: 0}, xAxis)).toBe(true);
    expect(colinear({position: {x: 5, y: 0}, heading: Math.PI}, xAxis)).toBe(
      true
    );
  });

  it('fails when the pose is on the line but heads across it', () => {
    expect(
      colinear({position: {x: 5, y: 0}, heading: Math.PI / 2}, xAxis)
    ).toBe(false);
  });

  it('fails when the pose heads along the line but sits off it', () => {
    expect(colinear({position: {x: 5, y: 3}, heading: 0}, xAxis)).toBe(false);
  });
});

describe('tangentAndNormalLines', () => {
  it('returns the heading line and the line square to it, through the pose', () => {
    // Facing 30° off +x at (2, 3): the tangent runs along 30°, the normal at 120°.
    const pose: Pose = {position: {x: 2, y: 3}, heading: degToRad(30)};
    const [tangent, normal] = tangentAndNormalLines(pose);

    expect(tangent.origin).toEqual({x: 2, y: 3});
    expect(normal.origin).toEqual({x: 2, y: 3});
    // Directions are unit and orthogonal.
    expect(Math.hypot(tangent.direction.x, tangent.direction.y)).toBeCloseTo(1);
    expect(Math.hypot(normal.direction.x, normal.direction.y)).toBeCloseTo(1);
    expect(dot(tangent.direction, normal.direction)).toBeCloseTo(0);
    // The tangent points along the heading; the normal a quarter-turn past it.
    expect(tangent.direction.x).toBeCloseTo(Math.cos(degToRad(30)));
    expect(tangent.direction.y).toBeCloseTo(Math.sin(degToRad(30)));
    expect(normal.direction.x).toBeCloseTo(Math.cos(degToRad(120)));
    expect(normal.direction.y).toBeCloseTo(Math.sin(degToRad(120)));
  });
});

// ── Bounds ──

describe('boundsOfPoints', () => {
  it('bounds a set spanning all quadrants', () => {
    const b = boundsOfPoints([
      {x: 1, y: 2},
      {x: -3, y: 5},
      {x: 4, y: -1},
    ]);
    expect(b).toEqual({minX: -3, minY: -1, maxX: 4, maxY: 5});
  });

  it('bounds a single point to a degenerate box', () => {
    expect(boundsOfPoints([{x: 3, y: -2}])).toEqual({
      minX: 3,
      minY: -2,
      maxX: 3,
      maxY: -2,
    });
  });

  it('throws on an empty list', () => {
    expect(() => boundsOfPoints([])).toThrow(RangeError);
  });
});

describe('unionBounds', () => {
  it('covers two overlapping boxes', () => {
    const a = {minX: 0, minY: 0, maxX: 2, maxY: 2};
    const b = {minX: 1, minY: -1, maxX: 5, maxY: 1};
    expect(unionBounds(a, b)).toEqual({minX: 0, minY: -1, maxX: 5, maxY: 2});
  });

  it('covers disjoint boxes', () => {
    const a = {minX: 0, minY: 0, maxX: 1, maxY: 1};
    const b = {minX: 5, minY: 5, maxX: 6, maxY: 6};
    expect(unionBounds(a, b)).toEqual({minX: 0, minY: 0, maxX: 6, maxY: 6});
  });

  it('returns the outer box when one contains the other', () => {
    const outer = {minX: -1, minY: -1, maxX: 9, maxY: 9};
    const inner = {minX: 2, minY: 2, maxX: 3, maxY: 3};
    expect(unionBounds(outer, inner)).toEqual(outer);
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
    expect(segmentEndPoint(segment).x).toBeCloseTo(2);
    expect(segmentEndPoint(segment).y).toBeCloseTo(13);
    expect(segmentEndPose(segment).heading).toBeCloseTo(Math.PI / 2);
  });

  it('runs into the negative quadrant for a westward segment', () => {
    const west: PlacedSegment = {
      kind: 'segment',
      start: {position: {x: 0, y: 0}, heading: Math.PI},
      length: 10,
    };
    expect(segmentEndPoint(west).x).toBeCloseTo(-10);
    expect(segmentEndPoint(west).y).toBeCloseTo(0);
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
  });
});

describe('unitArcChord', () => {
  it('gives the start→end offset of a unit-radius quarter arc', () => {
    // A 90° left arc from east ends at (1, 1); a right arc at (1, -1).
    const left = unitArcChord(0, Math.PI / 2);
    expect(left.x).toBeCloseTo(1);
    expect(left.y).toBeCloseTo(1);
    const right = unitArcChord(0, -Math.PI / 2);
    expect(right.x).toBeCloseTo(1);
    expect(right.y).toBeCloseTo(-1);
  });

  it('spans a half turn', () => {
    // 180° left from east lands abreast: chord (0, 2).
    const chord = unitArcChord(0, Math.PI);
    expect(chord.x).toBeCloseTo(0);
    expect(chord.y).toBeCloseTo(2);
  });

  it('respects a non-zero entry heading', () => {
    // 90° left from north ends a unit up and to the left: chord (-1, 1).
    const chord = unitArcChord(Math.PI / 2, Math.PI / 2);
    expect(chord.x).toBeCloseTo(-1);
    expect(chord.y).toBeCloseTo(1);
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

  it('ends a quarter-turn to the left, through the midpoint, turning the heading', () => {
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

  it('bounds a quarter arc by its endpoints alone', () => {
    // East→north quarter from the origin: it bulges through no compass extreme
    // beyond its ends, so the box is just (0,0)–(100,100).
    const b = arcBounds(left);
    expect(b.minX).toBeCloseTo(0);
    expect(b.maxX).toBeCloseTo(100);
    expect(b.minY).toBeCloseTo(0);
    expect(b.maxY).toBeCloseTo(100);
  });

  it('bounds a semicircle by its bulge, past the endpoints', () => {
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
