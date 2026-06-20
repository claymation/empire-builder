import {describe, it, expect} from 'vitest';
import {
  degToRad,
  posesCoincide,
  radToDeg,
  type Point,
  type Pose,
} from './geometry';
import {
  curveLeft,
  curveRight,
  EMPTY_LAYOUT,
  exitPoses,
  placedSections,
  railhead,
  sectionBounds,
  sectionGeometry,
  sectionLength,
  placeSection,
  placeRoute,
  routeBounds,
  snappedSectionTo,
  snapToIncrement,
  straight,
  tangentSectionTo,
  type Layout,
  type RouteSection,
} from './layout';
import {makeSpace, spaceContains} from './space';
import {feet, inches} from './units';

/** A pose at the origin, facing east (+x). */
const ORIGIN: Pose = {position: {x: 0, y: 0}, heading: 0};

describe('Layout', () => {
  it('an empty layout has no railhead and no placed sections', () => {
    expect(railhead(EMPTY_LAYOUT)).toBeNull();
    expect(placedSections(EMPTY_LAYOUT)).toHaveLength(0);
  });

  it('the railhead of an anchor-only layout is the anchor', () => {
    const layout: Layout = {anchor: ORIGIN, sections: []};
    expect(railhead(layout)).toEqual(ORIGIN);
  });

  it('places its sections and advances the railhead', () => {
    const layout: Layout = {anchor: ORIGIN, sections: [straight(100)]};
    expect(placedSections(layout)).toHaveLength(1);
    expect(railhead(layout)?.position.x).toBeCloseTo(100);
  });
});

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
    const placed = placeSection(ORIGIN, straight(100));
    expect(sectionGeometry(placed).kind).toBe('segment');
    const [exit] = exitPoses(placed);
    expect(exit.position.x).toBeCloseTo(100);
    expect(exit.position.y).toBeCloseTo(0);
    expect(exit.heading).toBeCloseTo(0);
  });

  it('works from a non-axis pose', () => {
    const facingNorth: Pose = {position: {x: 5, y: 5}, heading: Math.PI / 2};
    const [exit] = exitPoses(placeSection(facingNorth, straight(10)));
    expect(exit.position.x).toBeCloseTo(5);
    expect(exit.position.y).toBeCloseTo(15);
    expect(exit.heading).toBeCloseTo(Math.PI / 2);
  });
});

describe('placeSection — curve', () => {
  it('turns left counter-clockwise', () => {
    const placed = placeSection(ORIGIN, curveLeft(100, 90));
    expect(sectionGeometry(placed).kind).toBe('arc');
    const [exit] = exitPoses(placed);
    expect(exit.position.x).toBeCloseTo(100);
    expect(exit.position.y).toBeCloseTo(100);
    expect(exit.heading).toBeCloseTo(Math.PI / 2);
  });

  it('turns right clockwise', () => {
    const [exit] = exitPoses(placeSection(ORIGIN, curveRight(100, 90)));
    expect(exit.position.x).toBeCloseTo(100);
    expect(exit.position.y).toBeCloseTo(-100);
    expect(exit.heading).toBeCloseTo(-Math.PI / 2);
  });

  it('curves correctly from a start heading off the axes', () => {
    // Facing north, a left quarter turn lands a quarter-circle to the west,
    // exiting due west.
    const facingNorth: Pose = {position: {x: 10, y: 10}, heading: Math.PI / 2};
    const [exit] = exitPoses(placeSection(facingNorth, curveLeft(100, 90)));
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
    const b = sectionBounds(placeSection(ORIGIN, curveLeft(100, 180)));
    expect(b.minX).toBeCloseTo(0);
    expect(b.maxX).toBeCloseTo(100);
    expect(b.minY).toBeCloseTo(0);
    expect(b.maxY).toBeCloseTo(200);
  });
});

/** The canonical first layout: two straights joined by two 180° curves. */
function oval(straightLength: number, radius: number): RouteSection[] {
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
    const {sections} = placeRoute(ORIGIN, oval(inches(48), inches(18)));
    const b = routeBounds(sections);
    expect(b.maxX - b.minX).toBeCloseTo(inches(48) + 2 * inches(18));
    expect(b.maxY - b.minY).toBeCloseTo(2 * inches(18));
  });

  it('exactly fills the sheet at the limiting radius', () => {
    // A 24" radius makes the oval 96"×48" — flush with an 8'×4' sheet.
    const sheet = makeSpace(feet(8), feet(4));
    const anchor: Pose = {position: {x: inches(24), y: 0}, heading: 0};
    const {sections} = placeRoute(anchor, oval(inches(48), inches(24)));
    expect(spaceContains(sheet, routeBounds(sections), 1e-6)).toBe(true);
  });

  it('overflows when the radius is a hair too large for the depth', () => {
    // 24.001" radius needs 48.002" of depth; the sheet is only 48" deep.
    const sheet = makeSpace(feet(8), feet(4));
    const anchor: Pose = {position: {x: inches(24.001), y: 0}, heading: 0};
    const {sections} = placeRoute(anchor, oval(inches(48), inches(24.001)));
    expect(spaceContains(sheet, routeBounds(sections))).toBe(false);
  });
});

/** Asserts the tangent section from `from` actually ends at `target`. */
function reaches(from: Pose, target: Point): void {
  const section = tangentSectionTo(from, target);
  if (!section) throw new Error('expected a section');
  const [exit] = exitPoses(placeSection(from, section));
  expect(exit.position.x).toBeCloseTo(target.x);
  expect(exit.position.y).toBeCloseTo(target.y);
}

describe('tangentSectionTo', () => {
  it('returns a straight to a point dead ahead', () => {
    expect(tangentSectionTo(ORIGIN, {x: 100, y: 0})?.kind).toBe('straight');
    reaches(ORIGIN, {x: 100, y: 0});
  });

  it('curves left toward a point off to the left', () => {
    expect(tangentSectionTo(ORIGIN, {x: 100, y: 100})).toMatchObject({
      kind: 'curved',
      handedness: 'left',
    });
    reaches(ORIGIN, {x: 100, y: 100});
  });

  it('curves right toward a point off to the right', () => {
    expect(tangentSectionTo(ORIGIN, {x: 100, y: -100})).toMatchObject({
      kind: 'curved',
      handedness: 'right',
    });
    reaches(ORIGIN, {x: 100, y: -100});
  });

  it('loops 180° to a point abreast of the start', () => {
    // Directly left of an east-facing railhead: a half-circle reaches it.
    reaches(ORIGIN, {x: 0, y: 200});
  });

  it('reaches targets across quadrants and start headings', () => {
    // Headings deliberately include an off-grid 45° to catch axis-only bugs.
    const poses: Pose[] = [
      {position: {x: 0, y: 0}, heading: 0},
      {position: {x: 5, y: -3}, heading: Math.PI / 2},
      {position: {x: -2, y: 4}, heading: Math.PI},
      {position: {x: 1, y: 1}, heading: -Math.PI / 4},
    ];
    const targets: Point[] = [
      {x: 120, y: 40},
      {x: 30, y: 150},
      {x: -90, y: -60},
      {x: 200, y: -10},
    ];
    for (const from of poses) {
      for (const target of targets) {
        reaches(from, target);
      }
    }
  });

  it('returns null for a degenerate or unreachable target', () => {
    expect(tangentSectionTo(ORIGIN, {x: 0, y: 0})).toBeNull();
    expect(tangentSectionTo(ORIGIN, {x: -100, y: 0})).toBeNull();
  });
});

describe('snappedSectionTo', () => {
  const increment = degToRad(15);
  const threshold = degToRad(5);

  it('snaps the sweep and fits the radius so the end stays near the pointer', () => {
    // From the origin heading east, a pointer just shy of the 90° arc's corner
    // snaps to 90°, with the radius fitted to the pointer's projection (97.5).
    const section = snappedSectionTo(
      ORIGIN,
      {x: 100, y: 95},
      increment,
      threshold
    );
    if (section?.kind !== 'curved') throw new Error('expected a curve');
    expect(radToDeg(section.arc.sweep)).toBeCloseTo(90);
    const [exit] = exitPoses(placeSection(ORIGIN, section));
    expect(exit.position.x).toBeCloseTo(97.5);
    expect(exit.position.y).toBeCloseTo(97.5);
  });

  it('leaves an off-grid sweep (and its radius) alone', () => {
    const target = {x: 100, y: 90}; // ~84° — outside the snap threshold
    expect(snappedSectionTo(ORIGIN, target, increment, threshold)).toEqual(
      tangentSectionTo(ORIGIN, target)
    );
  });

  it('flattens a near-straight curve to the pointer projection', () => {
    const section = snappedSectionTo(
      ORIGIN,
      {x: 200, y: 3},
      increment,
      threshold
    );
    if (section?.kind !== 'straight') throw new Error('expected a straight');
    expect(section.length).toBeCloseTo(200); // forward projection of the pointer
  });

  it('returns null for a degenerate target', () => {
    expect(
      snappedSectionTo(ORIGIN, {x: 0, y: 0}, increment, threshold)
    ).toBeNull();
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
