import {describe, it, expect} from 'vitest';
import {type Pose} from './geometry';
import {
  curveLeft,
  curveRight,
  endPose,
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

  it('returns the arc length of a curve, regardless of handedness', () => {
    const expected = (Math.PI * 360) / 2; // a quarter of a circle of radius 360
    expect(sectionLength(curveLeft(360, 90))).toBeCloseTo(expected);
    expect(sectionLength(curveRight(360, 90))).toBeCloseTo(expected);
  });

  it('rejects a non-positive length', () => {
    expect(() => sectionLength({kind: 'straight', length: 0})).toThrow(
      RangeError
    );
  });
});

describe('placeSection — straight', () => {
  it('advances along the heading and keeps the heading', () => {
    const placed = placeSection(straight(100), ORIGIN);
    expect(placed.geometry[0].kind).toBe('segment');
    const exit = endPose(placed, 'exit');
    expect(exit.position.x).toBeCloseTo(100);
    expect(exit.position.y).toBeCloseTo(0);
    expect(exit.heading).toBeCloseTo(0);
  });

  it('locates the entry end at the placing pose', () => {
    const placed = placeSection(straight(100), ORIGIN);
    expect(endPose(placed, 'entry')).toEqual(ORIGIN);
  });

  it('works from a non-axis pose', () => {
    const facingNorth: Pose = {position: {x: 5, y: 5}, heading: Math.PI / 2};
    const exit = endPose(placeSection(straight(10), facingNorth), 'exit');
    expect(exit.position.x).toBeCloseTo(5);
    expect(exit.position.y).toBeCloseTo(15);
    expect(exit.heading).toBeCloseTo(Math.PI / 2);
  });
});

describe('placeSection — curve', () => {
  it('turns left counter-clockwise', () => {
    const placed = placeSection(curveLeft(100, 90), ORIGIN);
    expect(placed.geometry[0].kind).toBe('arc');
    const exit = endPose(placed, 'exit');
    expect(exit.position.x).toBeCloseTo(100);
    expect(exit.position.y).toBeCloseTo(100);
    expect(exit.heading).toBeCloseTo(Math.PI / 2);
  });

  it('turns right clockwise', () => {
    const exit = endPose(placeSection(curveRight(100, 90), ORIGIN), 'exit');
    expect(exit.position.x).toBeCloseTo(100);
    expect(exit.position.y).toBeCloseTo(-100);
    expect(exit.heading).toBeCloseTo(-Math.PI / 2);
  });

  it('curves correctly from a start heading off the axes', () => {
    // Facing north, a left quarter turn lands a quarter-circle to the west,
    // exiting due west.
    const facingNorth: Pose = {position: {x: 10, y: 10}, heading: Math.PI / 2};
    const exit = endPose(placeSection(curveLeft(100, 90), facingNorth), 'exit');
    expect(exit.position.x).toBeCloseTo(-90);
    expect(exit.position.y).toBeCloseTo(110);
    expect(exit.heading).toBeCloseTo(Math.PI);
  });

  it('rejects non-positive radius and sweep at build time', () => {
    expect(() => curveLeft(0, 90)).toThrow(RangeError);
    expect(() => curveLeft(100, 0)).toThrow(RangeError);
  });
});

describe('sectionBounds — curve', () => {
  it('accounts for the arc bulge, not just the endpoints', () => {
    // A left 180° semicircle from the origin heading east bulges out to +x = R
    // and spans y from 0 to 2R, even though both endpoints sit on x = 0.
    const b = sectionBounds(placeSection(curveLeft(100, 180), ORIGIN));
    expect(b.minX).toBeCloseTo(0);
    expect(b.maxX).toBeCloseTo(100);
    expect(b.minY).toBeCloseTo(0);
    expect(b.maxY).toBeCloseTo(200);
  });
});

describe('endPose', () => {
  it('throws for a name the section has no end for', () => {
    const placed = placeSection(straight(10), ORIGIN);
    // @ts-expect-error — only 'entry' and 'exit' are valid end names.
    expect(() => endPose(placed, 'diverging')).toThrow(RangeError);
  });
});
