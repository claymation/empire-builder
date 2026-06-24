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
  openEnds,
  placedRoute,
  railhead,
  sectionBounds,
  sectionGeometry,
  sectionLength,
  placeSection,
  placeRoute,
  routeBounds,
  sectionOntoLine,
  sectionForSnap,
  snappedSectionTo,
  snapToIncrement,
  shownSnap,
  resolveSnap,
  straight,
  sectionTo,
  type Layout,
  type RouteSection,
} from './layout';
import {makeSpace, spaceContains} from './space';
import {feet, inches} from './units';

/** A pose at the origin, facing east (+x). */
const ORIGIN: Pose = {position: {x: 0, y: 0}, heading: 0};

describe('Layout', () => {
  it('an empty layout has no placed route', () => {
    expect(placedRoute(EMPTY_LAYOUT)).toBeNull();
    expect(railhead(EMPTY_LAYOUT)).toBeNull();
  });

  it('the railhead of an anchor-only layout is the anchor', () => {
    const layout: Layout = {anchor: ORIGIN, sections: []};
    expect(railhead(layout)).toEqual(ORIGIN);
  });

  it('places its sections and advances the railhead', () => {
    const layout: Layout = {anchor: ORIGIN, sections: [straight(100)]};
    expect(placedRoute(layout)?.sections).toHaveLength(1);
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

/** Asserts the section from `from` actually ends at `target`. */
function reaches(from: Pose, target: Point): void {
  const section = sectionTo(from, target);
  if (!section) throw new Error('expected a section');
  const [exit] = exitPoses(placeSection(from, section));
  expect(exit.position.x).toBeCloseTo(target.x);
  expect(exit.position.y).toBeCloseTo(target.y);
}

describe('sectionTo', () => {
  it('returns a straight to a point dead ahead', () => {
    expect(sectionTo(ORIGIN, {x: 100, y: 0})?.kind).toBe('straight');
    reaches(ORIGIN, {x: 100, y: 0});
  });

  it('curves left toward a point off to the left', () => {
    expect(sectionTo(ORIGIN, {x: 100, y: 100})).toMatchObject({
      kind: 'curved',
      handedness: 'left',
    });
    reaches(ORIGIN, {x: 100, y: 100});
  });

  it('curves right toward a point off to the right', () => {
    expect(sectionTo(ORIGIN, {x: 100, y: -100})).toMatchObject({
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
    // Headings deliberately include an off-grid 45° to catch line-only bugs.
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
    expect(sectionTo(ORIGIN, {x: 0, y: 0})).toBeNull();
    expect(sectionTo(ORIGIN, {x: -100, y: 0})).toBeNull();
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
      sectionTo(ORIGIN, target)
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

describe('openEnds', () => {
  it('has no open end before the start is placed', () => {
    expect(openEnds(EMPTY_LAYOUT)).toEqual([]);
  });

  it('exposes the anchor from the moment it is placed', () => {
    // The anchor is a snap reference even before the first section, so its
    // alignment lines guide that first section too.
    expect(openEnds({anchor: ORIGIN, sections: []})).toEqual([ORIGIN]);
    const laid: Layout = {anchor: ORIGIN, sections: [straight(feet(2))]};
    expect(openEnds(laid)).toEqual([ORIGIN]);
  });
});

describe('resolveSnap', () => {
  // One open end at (100, 50) facing east: its heading line is the line y = 50,
  // its normal line the line x = 100. The railhead is off both lines, so both
  // are on offer.
  const end: Pose = {position: {x: 100, y: 50}, heading: 0};
  const ends = [end];
  const from: Pose = {position: {x: 0, y: 0}, heading: 0};
  const pointTolerance = 10;
  const lineTolerance = 6;

  it('latches onto the end when the target is within the point magnet', () => {
    const snap = resolveSnap(
      from,
      {x: 104, y: 53},
      ends,
      pointTolerance,
      lineTolerance
    );
    expect(snap.kind).toBe('point');
    expect(snap.point).toEqual({x: 100, y: 50});
  });

  it('projects onto the heading line when running alongside it', () => {
    const snap = resolveSnap(
      from,
      {x: 300, y: 53},
      ends,
      pointTolerance,
      lineTolerance
    );
    expect(snap.kind).toBe('line');
    expect(snap.point.x).toBeCloseTo(300);
    expect(snap.point.y).toBeCloseTo(50);
  });

  it('projects onto the normal line when squared up across it', () => {
    const snap = resolveSnap(
      from,
      {x: 103, y: 250},
      ends,
      pointTolerance,
      lineTolerance
    );
    expect(snap.kind).toBe('line');
    expect(snap.point.x).toBeCloseTo(100);
    expect(snap.point.y).toBeCloseTo(250);
  });

  it('prefers the point even when a line is strictly nearer', () => {
    // (100, 58): sits exactly on the normal line (gap 0) yet 8 from the end's
    // point. The line is the closer feature, but latching the end itself wins.
    const snap = resolveSnap(
      from,
      {x: 100, y: 58},
      ends,
      pointTolerance,
      lineTolerance
    );
    expect(snap.kind).toBe('point');
    expect(snap.point).toEqual({x: 100, y: 50});
  });

  it('leaves a target clear of every magnet unsnapped', () => {
    const snap = resolveSnap(
      from,
      {x: 300, y: 250},
      ends,
      pointTolerance,
      lineTolerance
    );
    expect(snap.kind).toBe('angle');
    expect(snap.point).toEqual({x: 300, y: 250});
  });

  it('skips a line the railhead already lies on', () => {
    // Railhead on the end's heading line (y = 50) — as after a first straight
    // laid along the anchor's heading. A target running along that line no
    // longer snaps to it, so no redundant guide appears.
    const onHeadingLine: Pose = {position: {x: 0, y: 50}, heading: 0};
    const snap = resolveSnap(
      onHeadingLine,
      {x: 300, y: 53},
      ends,
      pointTolerance,
      lineTolerance
    );
    expect(snap.kind).toBe('angle');
  });

  it('still offers the other line when the railhead lies on one', () => {
    // On the heading line, but the normal line (x = 100) is unaffected.
    const onHeadingLine: Pose = {position: {x: 0, y: 50}, heading: 0};
    const snap = resolveSnap(
      onHeadingLine,
      {x: 103, y: 250},
      ends,
      pointTolerance,
      lineTolerance
    );
    expect(snap.kind).toBe('line');
    expect(snap.point.x).toBeCloseTo(100);
  });

  it('keeps a line the railhead crosses as a candidate', () => {
    // The railhead sits on the normal line (x = 100) facing east, across it. A
    // section can still curve back onto it (a 180° arc), so resolveSnap offers
    // the candidate; shownSnap later decides whether its guide is drawn.
    const acrossNormal: Pose = {position: {x: 100, y: 0}, heading: 0};
    const snap = resolveSnap(
      acrossNormal,
      {x: 103, y: 250},
      ends,
      pointTolerance,
      lineTolerance
    );
    expect(snap.kind).toBe('line');
    expect(snap.point.x).toBeCloseTo(100);
  });

  it('latches onto the nearer of two ends within the point magnet', () => {
    // The nearer end is listed second, so a first-wins bug would pick the wrong
    // one. Both sit within the magnet (gaps 4 and 2).
    const nearer: Pose = {position: {x: 100, y: 100}, heading: 0};
    const farther: Pose = {position: {x: 106, y: 100}, heading: 0};
    const snap = resolveSnap(
      from,
      {x: 102, y: 100},
      [farther, nearer],
      pointTolerance,
      lineTolerance
    );
    expect(snap.kind).toBe('point');
    expect(snap.point).toEqual({x: 100, y: 100});
  });

  it('projects onto the nearer of two ends’ lines', () => {
    // Two normal lines, x = 100 and x = 104; the target sits 3 from the first
    // (listed first) and 1 from the second, so the nearer must win.
    const left: Pose = {position: {x: 100, y: 50}, heading: 0};
    const right: Pose = {position: {x: 104, y: 50}, heading: 0};
    const snap = resolveSnap(
      from,
      {x: 103, y: 250},
      [left, right],
      pointTolerance,
      lineTolerance
    );
    expect(snap.kind).toBe('line');
    expect(snap.point.x).toBeCloseTo(104);
  });

  it('snaps a point gap exactly at the magnet edge, not one past it', () => {
    // A 6-8-10 offset lands the target exactly pointTolerance (10) from the end;
    // pin the `<=` boundary. (The point wins over the normal line it grazes.)
    const justInside = {x: 106, y: 58}; // distance 10
    const justOutside = {x: 106.06, y: 58.08}; // distance 10.1, clear of both lines
    expect(
      resolveSnap(from, justInside, ends, pointTolerance, lineTolerance).kind
    ).toBe('point');
    expect(
      resolveSnap(from, justOutside, ends, pointTolerance, lineTolerance).kind
    ).toBe('angle');
  });

  it('snaps a line gap exactly at the magnet edge, not one past it', () => {
    // Far along the heading line (y = 50), clear of the point magnet, so only
    // the line magnet is in play; pin the `<=` boundary.
    const justInside = {x: 300, y: 50 + lineTolerance};
    const justOutside = {x: 300, y: 50 + lineTolerance + 0.01};
    expect(
      resolveSnap(from, justInside, ends, pointTolerance, lineTolerance).kind
    ).toBe('line');
    expect(
      resolveSnap(from, justOutside, ends, pointTolerance, lineTolerance).kind
    ).toBe('angle');
  });

  it('skips the zero-length point on an end at the railhead', () => {
    // Drawing from the anchor itself: a target within the point magnet but off
    // its lines must not latch the end (that section would be zero-length); it
    // falls through to the angle snap.
    const onlyEnd: Pose = {position: {x: 0, y: 0}, heading: 0};
    const snap = resolveSnap(
      onlyEnd,
      {x: 8, y: 2}, // 8.2 from the point (inside the magnet), 8 off the normal
      [onlyEnd],
      pointTolerance,
      lineTolerance
    );
    expect(snap.kind).toBe('angle');
  });
});

describe('sectionOntoLine', () => {
  const increment = degToRad(15);
  const threshold = degToRad(5);
  // The anchor's normal line: the vertical line x = 0.
  const normalLine = {origin: {x: 0, y: 0}, direction: {x: 0, y: 1}};

  it('lands a straight return leg on the line without bowing', () => {
    // Railhead heading west, level above the anchor. A target a hair off the
    // heading line still yields a perfectly straight section ending on the line.
    const from: Pose = {position: {x: 200, y: 100}, heading: Math.PI};
    const section = sectionOntoLine(
      from,
      {x: 0, y: 103},
      normalLine,
      increment,
      threshold
    );
    if (section?.kind !== 'straight') throw new Error('expected a straight');
    const [exit] = exitPoses(placeSection(from, section));
    expect(exit.position.x).toBeCloseTo(0);
    expect(exit.position.y).toBeCloseTo(100); // the heading line, not the target's y
    expect(exit.heading).toBeCloseTo(Math.PI);
  });

  it('meets the line where an oblique heading line crosses it', () => {
    // Heading up-left at 135°: a plain flatten would miss the line, but the
    // crossing of the heading line with x = 0 is (0, 100).
    const from: Pose = {position: {x: 100, y: 0}, heading: (3 * Math.PI) / 4};
    const section = sectionOntoLine(
      from,
      {x: 0, y: 98},
      normalLine,
      increment,
      threshold
    );
    if (section?.kind !== 'straight') throw new Error('expected a straight');
    const [exit] = exitPoses(placeSection(from, section));
    expect(exit.position.x).toBeCloseTo(0);
    expect(exit.position.y).toBeCloseTo(100);
  });

  it('keeps a clean-angle curve, ending where its chord meets the line', () => {
    // A 90° arc from the origin: its chord ray crosses x = 100 at (100, 100).
    const from: Pose = {position: {x: 0, y: 0}, heading: 0};
    const line = {origin: {x: 100, y: 0}, direction: {x: 0, y: 1}};
    const section = sectionOntoLine(
      from,
      {x: 100, y: 100},
      line,
      increment,
      threshold
    );
    if (section?.kind !== 'curved') throw new Error('expected a curve');
    expect(radToDeg(section.arc.sweep)).toBeCloseTo(90);
    const [exit] = exitPoses(placeSection(from, section));
    expect(exit.position.x).toBeCloseTo(100);
    expect(exit.position.y).toBeCloseTo(100);
  });

  it("snaps a curve's sweep and slides its radius onto the line", () => {
    // A target at (100, 105) is a ~92.8° arc; the sweep snaps to 90° and the
    // radius slides so the end lands on x = 100 — at (100, 100), not the target.
    const from: Pose = {position: {x: 0, y: 0}, heading: 0};
    const line = {origin: {x: 100, y: 0}, direction: {x: 0, y: 1}};
    const section = sectionOntoLine(
      from,
      {x: 100, y: 105},
      line,
      increment,
      threshold
    );
    if (section?.kind !== 'curved') throw new Error('expected a curve');
    expect(radToDeg(section.arc.sweep)).toBeCloseTo(90);
    const [exit] = exitPoses(placeSection(from, section));
    expect(exit.position.x).toBeCloseTo(100);
    expect(exit.position.y).toBeCloseTo(100);
  });

  it('slides a right-handed curve onto the line', () => {
    // Mirror of the left case below the axis: a ~93° right arc snaps to 90° and
    // its radius slides so the end lands on x = 100, at (100, -100).
    const from: Pose = {position: {x: 0, y: 0}, heading: 0};
    const line = {origin: {x: 100, y: 0}, direction: {x: 0, y: 1}};
    const section = sectionOntoLine(
      from,
      {x: 100, y: -105},
      line,
      increment,
      threshold
    );
    if (section?.kind !== 'curved') throw new Error('expected a curve');
    expect(section.handedness).toBe('right');
    expect(radToDeg(section.arc.sweep)).toBeCloseTo(90);
    const [exit] = exitPoses(placeSection(from, section));
    expect(exit.position.x).toBeCloseTo(100);
    expect(exit.position.y).toBeCloseTo(-100);
  });

  it('keeps the angle-snapped section when the line never crosses', () => {
    // The snap line runs parallel to the heading, so there is no crossing to
    // slide the end onto; the plain angle-snapped section stands.
    const from: Pose = {position: {x: 0, y: 0}, heading: 0};
    const parallel = {origin: {x: 0, y: 100}, direction: {x: 1, y: 0}};
    const section = sectionOntoLine(
      from,
      {x: 50, y: 0},
      parallel,
      increment,
      threshold
    );
    expect(section).toEqual(
      snappedSectionTo(from, {x: 50, y: 0}, increment, threshold)
    );
  });

  it('returns null when there is no section to lay', () => {
    const from: Pose = {position: {x: 0, y: 0}, heading: 0};
    expect(
      sectionOntoLine(from, from.position, normalLine, increment, threshold)
    ).toBeNull();
  });
});

describe('sectionForSnap', () => {
  const increment = degToRad(15);
  const threshold = degToRad(5);

  it('angle-snaps toward the target when no end is in range', () => {
    const snap = {kind: 'angle' as const, point: {x: 100, y: 95}};
    expect(sectionForSnap(ORIGIN, snap, increment, threshold)).toEqual(
      snappedSectionTo(ORIGIN, snap.point, increment, threshold)
    );
  });

  it('aims straight at a snapped open-end point', () => {
    const end: Pose = {position: {x: 100, y: 40}, heading: Math.PI};
    const snap = {kind: 'point' as const, point: end.position, end};
    expect(sectionForSnap(ORIGIN, snap, increment, threshold)).toEqual(
      sectionTo(ORIGIN, end.position)
    );
  });

  it('aligns a snapped line, landing the end on it', () => {
    const from: Pose = {position: {x: 200, y: 100}, heading: Math.PI};
    const line = {origin: {x: 0, y: 0}, direction: {x: 0, y: 1}};
    const snap = {kind: 'line' as const, point: {x: 0, y: 103}, line};
    const section = sectionForSnap(from, snap, increment, threshold);
    if (!section) throw new Error('expected a section');
    const [exit] = exitPoses(placeSection(from, section));
    expect(exit.position.x).toBeCloseTo(0); // landed on the line x = 0
    expect(section).toEqual(
      sectionOntoLine(from, snap.point, line, increment, threshold)
    );
  });
});

describe('shownSnap', () => {
  const line = {origin: {x: 0, y: 0}, direction: {x: 0, y: 1}}; // x = 0
  const lineSnap = {kind: 'line' as const, point: {x: 0, y: 100}, line};

  it('keeps a line guide the section ends on', () => {
    // A 180° curve from the origin ends on the start's normal (x = 0).
    const half = curveLeft(50, 180);
    expect(shownSnap(ORIGIN, lineSnap, half)).toEqual(lineSnap);
  });

  it('drops a line guide the section does not end on', () => {
    // A 90° curve ends at (100, 100), off x = 0 — the guide would be idle.
    const quarter = curveLeft(100, 90);
    expect(shownSnap(ORIGIN, lineSnap, quarter)).toBeNull();
  });

  it('passes point and angle snaps through', () => {
    const end: Pose = {position: {x: 100, y: 40}, heading: Math.PI};
    const point = {kind: 'point' as const, point: end.position, end};
    const angle = {kind: 'angle' as const, point: {x: 100, y: 95}};
    expect(shownSnap(ORIGIN, point, straight(10))).toEqual(point);
    expect(shownSnap(ORIGIN, angle, straight(10))).toEqual(angle);
  });

  it('shows nothing when there is no section', () => {
    expect(shownSnap(ORIGIN, lineSnap, null)).toBeNull();
  });
});
