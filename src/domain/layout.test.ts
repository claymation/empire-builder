import {describe, it, expect} from 'vitest';
import {posesCoincide, type Pose} from './geometry';
import {
  curveLeft,
  curveRight,
  exitPoses,
  pieceBounds,
  pieceGeometry,
  placePiece,
  placeRoute,
  routeBounds,
  straight,
  type RoutePiece,
} from './layout';
import {makeSpace, spaceContains} from './space';
import {feet, inches} from './units';

/** A pose at the origin, facing east (+x). */
const ORIGIN: Pose = {position: {x: 0, y: 0}, heading: 0};

describe('placePiece — straight', () => {
  it('advances along the heading and keeps the heading', () => {
    const placed = placePiece(ORIGIN, straight(100));
    expect(pieceGeometry(placed).kind).toBe('segment');
    const [exit] = exitPoses(placed);
    expect(exit.position.x).toBeCloseTo(100);
    expect(exit.position.y).toBeCloseTo(0);
    expect(exit.heading).toBeCloseTo(0);
  });

  it('works from a non-axis pose', () => {
    const facingNorth: Pose = {position: {x: 5, y: 5}, heading: Math.PI / 2};
    const [exit] = exitPoses(placePiece(facingNorth, straight(10)));
    expect(exit.position.x).toBeCloseTo(5);
    expect(exit.position.y).toBeCloseTo(15);
    expect(exit.heading).toBeCloseTo(Math.PI / 2);
  });
});

describe('placePiece — curve', () => {
  it('turns left counter-clockwise', () => {
    const placed = placePiece(ORIGIN, curveLeft(100, 90));
    expect(pieceGeometry(placed).kind).toBe('arc');
    const [exit] = exitPoses(placed);
    expect(exit.position.x).toBeCloseTo(100);
    expect(exit.position.y).toBeCloseTo(100);
    expect(exit.heading).toBeCloseTo(Math.PI / 2);
  });

  it('turns right clockwise', () => {
    const [exit] = exitPoses(placePiece(ORIGIN, curveRight(100, 90)));
    expect(exit.position.x).toBeCloseTo(100);
    expect(exit.position.y).toBeCloseTo(-100);
    expect(exit.heading).toBeCloseTo(-Math.PI / 2);
  });

  it('curves correctly from a start heading off the axes', () => {
    // Facing north, a left quarter turn lands a quarter-circle to the west,
    // exiting due west.
    const facingNorth: Pose = {position: {x: 10, y: 10}, heading: Math.PI / 2};
    const [exit] = exitPoses(placePiece(facingNorth, curveLeft(100, 90)));
    expect(exit.position.x).toBeCloseTo(-90);
    expect(exit.position.y).toBeCloseTo(110);
    expect(exit.heading).toBeCloseTo(Math.PI);
  });

  it('rejects non-positive radius and sweep at build time', () => {
    expect(() => curveLeft(0, 90)).toThrow(RangeError);
    expect(() => curveLeft(100, 0)).toThrow(RangeError);
  });
});

describe('pieceBounds — curve', () => {
  it('accounts for the arc bulge, not just the endpoints', () => {
    // A left 180° semicircle from the origin heading east bulges out to +x = R
    // and spans y from 0 to 2R, even though both endpoints sit on x = 0.
    const b = pieceBounds(placePiece(ORIGIN, curveLeft(100, 180)));
    expect(b.minX).toBeCloseTo(0);
    expect(b.maxX).toBeCloseTo(100);
    expect(b.minY).toBeCloseTo(0);
    expect(b.maxY).toBeCloseTo(200);
  });
});

/** The canonical first layout: two straights joined by two 180° curves. */
function oval(straightLength: number, radius: number): RoutePiece[] {
  return [
    straight(straightLength),
    curveLeft(radius, 180),
    straight(straightLength),
    curveLeft(radius, 180),
  ];
}

describe('placeRoute — the oval', () => {
  it('closes back onto its anchor to form a loop', () => {
    const {exit} = placeRoute(ORIGIN, oval(inches(48), inches(18)));
    expect(posesCoincide(exit, ORIGIN, 1e-6, 1e-6)).toBe(true);
  });

  it('has bounds of (straight + 2·radius) by (2·radius)', () => {
    const {pieces} = placeRoute(ORIGIN, oval(inches(48), inches(18)));
    const b = routeBounds(pieces);
    expect(b.maxX - b.minX).toBeCloseTo(inches(48) + 2 * inches(18));
    expect(b.maxY - b.minY).toBeCloseTo(2 * inches(18));
  });

  it('exactly fills the sheet at the limiting radius', () => {
    // A 24" radius makes the oval 96"×48" — flush with an 8'×4' sheet.
    const sheet = makeSpace(feet(8), feet(4));
    const anchor: Pose = {position: {x: inches(24), y: 0}, heading: 0};
    const {pieces} = placeRoute(anchor, oval(inches(48), inches(24)));
    expect(spaceContains(sheet, routeBounds(pieces), 1e-6)).toBe(true);
  });

  it('overflows when the radius is a hair too large for the depth', () => {
    // 24.001" radius needs 48.002" of depth; the sheet is only 48" deep.
    const sheet = makeSpace(feet(8), feet(4));
    const anchor: Pose = {position: {x: inches(24.001), y: 0}, heading: 0};
    const {pieces} = placeRoute(anchor, oval(inches(48), inches(24.001)));
    expect(spaceContains(sheet, routeBounds(pieces))).toBe(false);
  });
});
