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

const EAST: Pose = {position: {x: 0, y: 0}, heading: 0};

describe('placePiece — straight', () => {
  it('advances along the heading and keeps the heading', () => {
    const placed = placePiece(EAST, straight(100));
    const geometry = pieceGeometry(placed);
    expect(geometry.kind).toBe('straight');
    const [exit] = exitPoses(placed);
    expect(exit.position.x).toBeCloseTo(100);
    expect(exit.position.y).toBeCloseTo(0);
    expect(exit.heading).toBeCloseTo(0);
  });
});

describe('placePiece — curve', () => {
  it('turns left counter-clockwise', () => {
    const placed = placePiece(EAST, curveLeft(100, 90));
    const geometry = pieceGeometry(placed);
    if (geometry.kind !== 'curved') throw new Error('expected a curve');
    expect(geometry.arc.center.x).toBeCloseTo(0);
    expect(geometry.arc.center.y).toBeCloseTo(100);
    const [exit] = exitPoses(placed);
    expect(exit.position.x).toBeCloseTo(100);
    expect(exit.position.y).toBeCloseTo(100);
    expect(exit.heading).toBeCloseTo(Math.PI / 2);
  });

  it('turns right clockwise', () => {
    const placed = placePiece(EAST, curveRight(100, 90));
    const geometry = pieceGeometry(placed);
    if (geometry.kind !== 'curved') throw new Error('expected a curve');
    expect(geometry.arc.center.x).toBeCloseTo(0);
    expect(geometry.arc.center.y).toBeCloseTo(-100);
    const [exit] = exitPoses(placed);
    expect(exit.position.x).toBeCloseTo(100);
    expect(exit.position.y).toBeCloseTo(-100);
    expect(exit.heading).toBeCloseTo(-Math.PI / 2);
  });

  it('rejects a non-positive radius at build time', () => {
    expect(() => curveLeft(0, 90)).toThrow(RangeError);
  });
});

describe('pieceBounds — curve', () => {
  it('accounts for the arc bulge, not just the endpoints', () => {
    // A left 180° semicircle from the origin heading east bulges out to +x = R
    // and spans y from 0 to 2R, even though both endpoints sit on x = 0.
    const placed = placePiece(EAST, curveLeft(100, 180));
    const b = pieceBounds(placed);
    expect(b.minX).toBeCloseTo(0);
    expect(b.maxX).toBeCloseTo(100);
    expect(b.minY).toBeCloseTo(0);
    expect(b.maxY).toBeCloseTo(200);
  });
});

/**
 * The canonical first layout: two straight sides joined by two 180° curves —
 * the classic oval. Built to fit a 4'x8' sheet of plywood with an 18" radius.
 */
function oval(straightLength: number, radius: number): RoutePiece[] {
  return [
    straight(straightLength),
    curveLeft(radius, 180),
    straight(straightLength),
    curveLeft(radius, 180),
  ];
}

describe('placeRoute — the oval', () => {
  const radius = inches(18);
  const straightLength = inches(48);

  it('closes back onto its anchor to form a loop', () => {
    const {exit} = placeRoute(EAST, oval(straightLength, radius));
    expect(posesCoincide(exit, EAST, 1e-6, 1e-6)).toBe(true);
  });

  it('has bounds of (straight + 2·radius) by (2·radius)', () => {
    const {pieces} = placeRoute(EAST, oval(straightLength, radius));
    const b = routeBounds(pieces);
    expect(b.maxX - b.minX).toBeCloseTo(straightLength + 2 * radius);
    expect(b.maxY - b.minY).toBeCloseTo(2 * radius);
  });

  it('fits on a 4ft x 8ft sheet when centered', () => {
    const sheet = makeSpace(feet(8), feet(4));
    // Center the oval on the sheet: see main.ts for the same placement.
    const anchor: Pose = {position: {x: inches(24), y: inches(6)}, heading: 0};
    const {pieces} = placeRoute(anchor, oval(straightLength, radius));
    expect(spaceContains(sheet, routeBounds(pieces), 1e-6)).toBe(true);
  });

  it('does not fit when the radius is too large for the sheet depth', () => {
    const sheet = makeSpace(feet(8), feet(4));
    const anchor: Pose = {position: {x: inches(30), y: inches(30)}, heading: 0};
    // A 30" radius needs 60" of depth; the sheet is only 48" deep.
    const {pieces} = placeRoute(anchor, oval(straightLength, inches(30)));
    expect(spaceContains(sheet, routeBounds(pieces))).toBe(false);
  });
});
