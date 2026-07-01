import {describe, it, expect} from 'vitest';
import {
  cross,
  degToRad,
  posesEqual,
  radToDeg,
  subtract,
  unitVector,
  type Pose,
} from './geometry';
import {
  curve,
  endPose,
  endsOf,
  placeSection,
  sectionBounds,
  sectionLength,
  straight,
} from './section';

/** A pose at the origin, facing east (+x). */
const ORIGIN: Pose = {position: {x: 0, y: 0}, heading: 0};

describe('sectionLength', () => {
  it('returns a straight section length unchanged', () => {
    expect(sectionLength(straight(168))).toBe(168);
  });

  it('returns the arc length of a curve, regardless of turn', () => {
    const expected = (Math.PI * 360) / 2; // a quarter of a circle of radius 360
    expect(sectionLength(curve(360, 90, 'ccw'))).toBeCloseTo(expected);
    expect(sectionLength(curve(360, 90, 'cw'))).toBeCloseTo(expected);
  });

  it('rejects a non-positive length', () => {
    expect(() => sectionLength({kind: 'straight', length: 0})).toThrow(
      RangeError
    );
  });
});

describe('endsOf', () => {
  it('names both ends A and B for a straight', () => {
    expect(endsOf(straight(100))).toEqual(['A', 'B']);
  });

  it('names both ends A and B for a curve', () => {
    expect(endsOf(curve(100, 90, 'ccw'))).toEqual(['A', 'B']);
  });
});

describe('curve', () => {
  it('carries its turn on the shape', () => {
    expect(curve(100, 90, 'ccw')).toMatchObject({kind: 'curved', turn: 'ccw'});
    expect(curve(100, 90, 'cw')).toMatchObject({kind: 'curved', turn: 'cw'});
  });

  it('rejects non-positive radius and sweep at build time', () => {
    expect(() => curve(0, 90, 'ccw')).toThrow(RangeError);
    expect(() => curve(100, 0, 'cw')).toThrow(RangeError);
  });
});

describe('placeSection — straight', () => {
  it('advances along the heading and keeps the heading', () => {
    const placed = placeSection(straight(100), 'A', ORIGIN);
    expect(placed.geometry[0].kind).toBe('segment');
    const b = endPose(placed, 'B');
    expect(b.position.x).toBeCloseTo(100);
    expect(b.position.y).toBeCloseTo(0);
    expect(b.heading).toBeCloseTo(0);
  });

  it('seats end A at the placing pose', () => {
    const placed = placeSection(straight(100), 'A', ORIGIN);
    expect(endPose(placed, 'A')).toEqual(ORIGIN);
  });

  it('sits end B a length back along the heading from a non-axis pose', () => {
    const facingNorth: Pose = {position: {x: 5, y: 5}, heading: Math.PI / 2};
    const b = endPose(placeSection(straight(10), 'A', facingNorth), 'B');
    expect(b.position.x).toBeCloseTo(5);
    expect(b.position.y).toBeCloseTo(15);
    expect(b.heading).toBeCloseTo(Math.PI / 2);
  });
});

describe('placeSection — curve', () => {
  it('a ccw curve bends counter-clockwise (left of travel)', () => {
    const placed = placeSection(curve(100, 90, 'ccw'), 'A', ORIGIN);
    expect(placed.geometry[0].kind).toBe('arc');
    const b = endPose(placed, 'B');
    expect(b.position.x).toBeCloseTo(100);
    expect(b.position.y).toBeCloseTo(100);
    expect(b.heading).toBeCloseTo(Math.PI / 2);
  });

  it('a cw curve bends clockwise (right of travel)', () => {
    const b = endPose(placeSection(curve(100, 90, 'cw'), 'A', ORIGIN), 'B');
    expect(b.position.x).toBeCloseTo(100);
    expect(b.position.y).toBeCloseTo(-100);
    expect(b.heading).toBeCloseTo(-Math.PI / 2);
  });

  // The turn is defined by A→B travel, so it must hold from any start heading,
  // not just along an axis: one off-axis heading per quadrant.
  const headings = [degToRad(30), degToRad(120), degToRad(210), degToRad(300)];
  const sweepDeg = 90;
  for (const heading of headings) {
    const from: Pose = {position: {x: 3, y: -2}, heading};
    const label = `${Math.round(radToDeg(heading))}°`;

    it(`turns the heading left by the sweep, ccw, from ${label}`, () => {
      const b = endPose(
        placeSection(curve(120, sweepDeg, 'ccw'), 'A', from),
        'B'
      );
      expect(b.heading).toBeCloseTo(heading + degToRad(sweepDeg));
      // B lands to the left of travel (a positive cross with the forward ray).
      const toB = subtract(b.position, from.position);
      expect(cross(unitVector(heading), toB)).toBeGreaterThan(0);
    });

    it(`turns the heading right by the sweep, cw, from ${label}`, () => {
      const b = endPose(
        placeSection(curve(120, sweepDeg, 'cw'), 'A', from),
        'B'
      );
      expect(b.heading).toBeCloseTo(heading - degToRad(sweepDeg));
      const toB = subtract(b.position, from.position);
      expect(cross(unitVector(heading), toB)).toBeLessThan(0);
    });
  }
});

describe('placeSection — by either end', () => {
  // A shape occupies one spot in the plane, named by whichever end. Seating it by
  // B at the pose its B lands on (when seated by A) must reproduce that very
  // placement — the mirror of seating by A. Straights and both curve turns, from
  // an off-axis heading in each quadrant.
  const shapes = [straight(120), curve(90, 60, 'ccw'), curve(90, 60, 'cw')];
  const headings = [degToRad(25), degToRad(115), degToRad(205), degToRad(295)];
  for (const shape of shapes) {
    for (const heading of headings) {
      const from: Pose = {position: {x: -4, y: 7}, heading};
      const label = `${shape.kind} from ${Math.round(radToDeg(heading))}°`;
      it(`seated by B reproduces the placement seated by A (${label})`, () => {
        const byA = placeSection(shape, 'A', from);
        const b = endPose(byA, 'B');
        const byB = placeSection(shape, 'B', b);
        expect(posesEqual(endPose(byB, 'A'), from)).toBe(true);
        expect(posesEqual(endPose(byB, 'B'), b)).toBe(true);
      });
    }
  }

  it('rejects an end the shape does not have', () => {
    // @ts-expect-error — only 'A' and 'B' are valid end names.
    expect(() => placeSection(straight(10), 'diverging', ORIGIN)).toThrow(
      RangeError
    );
  });
});

describe('sectionBounds — curve', () => {
  it('accounts for the arc bulge, not just the endpoints', () => {
    // A ccw 180° semicircle from the origin heading east bulges out to +x = R
    // and spans y from 0 to 2R, even though both endpoints sit on x = 0.
    const b = sectionBounds(placeSection(curve(100, 180, 'ccw'), 'A', ORIGIN));
    expect(b.minX).toBeCloseTo(0);
    expect(b.maxX).toBeCloseTo(100);
    expect(b.minY).toBeCloseTo(0);
    expect(b.maxY).toBeCloseTo(200);
  });
});

describe('endPose', () => {
  it('throws for a name the section has no end for', () => {
    const placed = placeSection(straight(10), 'A', ORIGIN);
    // @ts-expect-error — only 'A' and 'B' are valid end names.
    expect(() => endPose(placed, 'diverging')).toThrow(RangeError);
  });
});
