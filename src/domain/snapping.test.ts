import {describe, it, expect} from 'vitest';
import {degToRad, radToDeg, type Point, type Pose} from './geometry';
import {type SectionEnd, type SectionEndPose} from './layout';
import {curve, endPose, placeSection, straight} from './section';
import {
  resolveAnchorSnap,
  resolveSnap,
  shapeForSnap,
  shapeOntoLine,
  shapeTo,
  snappedShapeTo,
  snapToIncrement,
  shownSnap,
} from './snapping';

/** A pose at the origin, facing east (+x). */
const ORIGIN: Pose = {position: {x: 0, y: 0}, heading: 0};

/** A section end; its identity is immaterial to these snap tests. */
const SOME_END: SectionEnd = {sectionId: 'e', end: 'B'};

/** Pairs an open-end pose with a section end, as the editor passes them in. */
const oe = (pose: Pose): SectionEndPose => ({sectionEnd: SOME_END, pose});

/** Asserts the section from `from` actually ends at `target`. */
function reaches(from: Pose, target: Point): void {
  const section = shapeTo(from, target);
  if (!section) throw new Error('expected a section');
  const b = endPose(placeSection(section, 'A', from), 'B');
  expect(b.position.x).toBeCloseTo(target.x);
  expect(b.position.y).toBeCloseTo(target.y);
}

describe('shapeTo', () => {
  it('returns a straight to a point dead ahead', () => {
    expect(shapeTo(ORIGIN, {x: 100, y: 0})?.kind).toBe('straight');
    reaches(ORIGIN, {x: 100, y: 0});
  });

  it('curves left toward a point off to the left', () => {
    expect(shapeTo(ORIGIN, {x: 100, y: 100})).toMatchObject({
      kind: 'curved',
      turn: 'ccw',
    });
    reaches(ORIGIN, {x: 100, y: 100});
  });

  it('curves right toward a point off to the right', () => {
    expect(shapeTo(ORIGIN, {x: 100, y: -100})).toMatchObject({
      kind: 'curved',
      turn: 'cw',
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
    expect(shapeTo(ORIGIN, {x: 0, y: 0})).toBeNull();
    expect(shapeTo(ORIGIN, {x: -100, y: 0})).toBeNull();
  });
});

describe('snappedShapeTo', () => {
  const increment = degToRad(15);
  const threshold = degToRad(5);

  it('snaps the sweep and fits the radius so the end stays near the pointer', () => {
    // From the origin heading east, a pointer just shy of the 90° arc's corner
    // snaps to 90°, with the radius fitted to the pointer's projection (97.5).
    const section = snappedShapeTo(
      ORIGIN,
      {x: 100, y: 95},
      increment,
      threshold
    );
    if (section?.kind !== 'curved') throw new Error('expected a curve');
    expect(radToDeg(section.arc.sweep)).toBeCloseTo(90);
    const b = endPose(placeSection(section, 'A', ORIGIN), 'B');
    expect(b.position.x).toBeCloseTo(97.5);
    expect(b.position.y).toBeCloseTo(97.5);
  });

  it('leaves an off-grid sweep (and its radius) alone', () => {
    const target = {x: 100, y: 90}; // ~84° — outside the snap threshold
    expect(snappedShapeTo(ORIGIN, target, increment, threshold)).toEqual(
      shapeTo(ORIGIN, target)
    );
  });

  it('flattens a near-straight curve to the pointer projection', () => {
    const section = snappedShapeTo(
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
      snappedShapeTo(ORIGIN, {x: 0, y: 0}, increment, threshold)
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

describe('resolveSnap', () => {
  // One open end at (100, 50) facing east: its heading line is the line y = 50,
  // its normal line the line x = 100. The railhead is off both lines, so both
  // are on offer.
  const end: Pose = {position: {x: 100, y: 50}, heading: 0};
  const ends = [oe(end)];
  const from: Pose = {position: {x: 0, y: 0}, heading: 0};
  const pointTolerance = 10;
  const lineTolerance = 6;

  // An end whose pose faces north — its section stands north of (100, 100).
  // From the east-facing railhead, the arc to (100, 100) arrives heading north,
  // into that section: a facing, back-to-back arrival, so its point is on
  // offer. Its heading line is x = 100, its normal line y = 100.
  const tangentEnd: Pose = {position: {x: 100, y: 100}, heading: Math.PI / 2};

  it('latches onto an end the section can reach facing it', () => {
    const snap = resolveSnap(
      from,
      {x: 104, y: 103},
      [oe(tangentEnd)],
      pointTolerance,
      lineTolerance
    );
    expect(snap.kind).toBe('end');
    expect(snap.point).toEqual({x: 100, y: 100});
  });

  it('declines a point the section cannot reach facing it', () => {
    // `end` faces east at (100, 50); the single arc from the railhead arrives
    // there banking, not along the end's line, so the point is refused — the
    // join would kink. The target falls through to the end's lines instead.
    const snap = resolveSnap(
      from,
      {x: 100, y: 53},
      ends,
      pointTolerance,
      lineTolerance
    );
    expect(snap.kind).toBe('line');
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

  it("latches onto a placed section's open B end, arriving facing it", () => {
    // A section standing north of (100, 100): its open B end's pose faces back
    // into it, north. The quarter-turn arc from the railhead arrives heading
    // north — into the section, seating the ends back-to-back — so the point
    // is on offer.
    const standing = placeSection(straight(100), 'A', {
      position: {x: 100, y: 200},
      heading: -Math.PI / 2,
    });
    const bEnd: SectionEndPose = {
      sectionEnd: {sectionId: 't', end: 'B'},
      pose: endPose(standing, 'B'),
    };
    const snap = resolveSnap(
      from,
      {x: 104, y: 103},
      [bEnd],
      pointTolerance,
      lineTolerance
    );
    expect(snap.kind).toBe('end');
    expect(snap.point.x).toBeCloseTo(100);
    expect(snap.point.y).toBeCloseTo(100);
  });

  it('prefers the point even when a line is strictly nearer', () => {
    // (108, 100): sits exactly on the tangent end's normal line (gap 0) yet 8
    // from its point. The line is the closer feature, but latching the end
    // itself wins.
    const snap = resolveSnap(
      from,
      {x: 108, y: 100},
      [oe(tangentEnd)],
      pointTolerance,
      lineTolerance
    );
    expect(snap.kind).toBe('end');
    expect(snap.point).toEqual({x: 100, y: 100});
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

  it('latches onto the nearer of two reachable ends within the point magnet', () => {
    // Two quarter-turn exits, both tangent-reachable; the nearer is listed
    // second, so a first-wins bug would pick the wrong one.
    const nearer: Pose = {position: {x: 100, y: 100}, heading: Math.PI / 2};
    const farther: Pose = {position: {x: 97, y: 97}, heading: Math.PI / 2};
    const snap = resolveSnap(
      from,
      {x: 101, y: 101},
      [oe(farther), oe(nearer)],
      pointTolerance,
      lineTolerance
    );
    expect(snap.kind).toBe('end');
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
      [oe(left), oe(right)],
      pointTolerance,
      lineTolerance
    );
    expect(snap.kind).toBe('line');
    expect(snap.point.x).toBeCloseTo(104);
  });

  it('snaps a point gap exactly at the magnet edge, not one past it', () => {
    // A 6-8-10 offset lands the target exactly pointTolerance (10) from the
    // tangent end; pin the `<=` boundary. (The point wins over the normal line
    // it grazes.)
    const justInside = {x: 106, y: 108}; // distance 10
    const justOutside = {x: 106.06, y: 108.08}; // distance 10.1, clear of both lines
    expect(
      resolveSnap(
        from,
        justInside,
        [oe(tangentEnd)],
        pointTolerance,
        lineTolerance
      ).kind
    ).toBe('end');
    expect(
      resolveSnap(
        from,
        justOutside,
        [oe(tangentEnd)],
        pointTolerance,
        lineTolerance
      ).kind
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

  it("offers `from`'s own normal: the 180° arc from an anchor snaps", () => {
    // Drawing from a bare anchor — no open end anywhere. A target just off
    // abreast of the anchor projects onto the anchor's normal line (x = 0),
    // and the section built onto it is the exact half-circle.
    const snap = resolveSnap(
      from,
      {x: 4, y: 200},
      [],
      pointTolerance,
      lineTolerance
    );
    expect(snap.kind).toBe('line');
    expect(snap.point.x).toBeCloseTo(0);
    expect(snap.point.y).toBeCloseTo(200);
    const section = shapeForSnap(from, snap, degToRad(15), degToRad(5));
    if (section?.kind !== 'curved') throw new Error('expected a curve');
    expect(radToDeg(section.arc.sweep)).toBeCloseTo(180);
    expect(section.arc.radius).toBeCloseTo(100);
    expect(shownSnap(from, snap, section)).toEqual(snap); // guide is drawn
  });

  it("offers `from`'s normal at an off-grid pose", () => {
    const heading = degToRad(30);
    const anchor: Pose = {position: {x: 3, y: -2}, heading};
    const normal = {x: -Math.sin(heading), y: Math.cos(heading)};
    const forward = {x: Math.cos(heading), y: Math.sin(heading)};
    // 100 out along the normal, nudged 4 forward — inside the line magnet.
    const target = {
      x: 3 + 100 * normal.x + 4 * forward.x,
      y: -2 + 100 * normal.y + 4 * forward.y,
    };
    const snap = resolveSnap(anchor, target, [], pointTolerance, lineTolerance);
    expect(snap.kind).toBe('line');
    expect(snap.point.x).toBeCloseTo(3 + 100 * normal.x);
    expect(snap.point.y).toBeCloseTo(-2 + 100 * normal.y);
  });

  it('does not offer the tangent `from` runs along', () => {
    // The anchor's own heading line would pull on every dead-ahead target —
    // a guide with nothing to align. A target alongside it stays unsnapped.
    const snap = resolveSnap(
      from,
      {x: 200, y: 4},
      [],
      pointTolerance,
      lineTolerance
    );
    expect(snap.kind).toBe('angle');
  });

  it('skips the zero-length point on an end at the railhead', () => {
    // Drawing from the anchor itself: a target within the point magnet but off
    // its lines must not latch the end (that section would be zero-length); it
    // falls through to the angle snap.
    const onlyEnd: Pose = {position: {x: 0, y: 0}, heading: 0};
    const snap = resolveSnap(
      onlyEnd,
      {x: 8, y: 2}, // 8.2 from the point (inside the magnet), 8 off the normal
      [oe(onlyEnd)],
      pointTolerance,
      lineTolerance
    );
    expect(snap.kind).toBe('angle');
  });
});

describe('resolveAnchorSnap', () => {
  // One open end at (100, 50) facing east: its heading line is y = 50, its
  // normal line x = 100.
  const ends = [oe({position: {x: 100, y: 50}, heading: 0})];
  const tolerance = 6;

  it("pulls onto an end's normal line", () => {
    const snap = resolveAnchorSnap({x: 103, y: 250}, ends, tolerance);
    expect(snap?.kind).toBe('line');
    expect(snap?.point.x).toBeCloseTo(100);
    expect(snap?.point.y).toBeCloseTo(250);
  });

  it("pulls onto an end's heading line", () => {
    const snap = resolveAnchorSnap({x: 300, y: 47}, ends, tolerance);
    expect(snap?.kind).toBe('line');
    expect(snap?.point.x).toBeCloseTo(300);
    expect(snap?.point.y).toBeCloseTo(50);
  });

  it('pulls onto the nearer of two lines', () => {
    // Two normal lines, x = 100 and x = 104; the point sits 3 from the first
    // (listed first) and 1 from the second, so the nearer must win.
    const pair = [
      oe({position: {x: 100, y: 50}, heading: 0}),
      oe({position: {x: 104, y: 50}, heading: 0}),
    ];
    const snap = resolveAnchorSnap({x: 103, y: 250}, pair, tolerance);
    expect(snap?.point.x).toBeCloseTo(104);
  });

  it("pulls onto an off-grid end's lines", () => {
    // An end heading 30°: its normal runs perpendicular through (3, -2). A
    // point 100 out along the normal, nudged 4 forward, projects back onto it.
    const heading = degToRad(30);
    const normal = {x: -Math.sin(heading), y: Math.cos(heading)};
    const forward = {x: Math.cos(heading), y: Math.sin(heading)};
    const target = {
      x: 3 + 100 * normal.x + 4 * forward.x,
      y: -2 + 100 * normal.y + 4 * forward.y,
    };
    const snap = resolveAnchorSnap(
      target,
      [oe({position: {x: 3, y: -2}, heading})],
      tolerance
    );
    expect(snap?.kind).toBe('line');
    expect(snap?.point.x).toBeCloseTo(3 + 100 * normal.x);
    expect(snap?.point.y).toBeCloseTo(-2 + 100 * normal.y);
  });

  it('snaps a gap exactly at the tolerance, not one past it', () => {
    expect(
      resolveAnchorSnap({x: 300, y: 50 + tolerance}, ends, tolerance)
    ).not.toBeNull();
    expect(
      resolveAnchorSnap({x: 300, y: 50 + tolerance + 0.01}, ends, tolerance)
    ).toBeNull();
  });

  it('snaps nowhere when clear of every line, or with no open ends', () => {
    expect(resolveAnchorSnap({x: 300, y: 250}, ends, tolerance)).toBeNull();
    expect(resolveAnchorSnap({x: 100, y: 250}, [], tolerance)).toBeNull();
  });
});

describe('shapeOntoLine', () => {
  const increment = degToRad(15);
  const threshold = degToRad(5);
  // The anchor's normal line: the vertical line x = 0.
  const normalLine = {origin: {x: 0, y: 0}, direction: {x: 0, y: 1}};

  it('lands a straight return leg on the line without bowing', () => {
    // Railhead heading west, level above the anchor. A target a hair off the
    // heading line still yields a perfectly straight section ending on the line.
    const from: Pose = {position: {x: 200, y: 100}, heading: Math.PI};
    const section = shapeOntoLine(
      from,
      {x: 0, y: 103},
      normalLine,
      increment,
      threshold
    );
    if (section?.kind !== 'straight') throw new Error('expected a straight');
    const b = endPose(placeSection(section, 'A', from), 'B');
    expect(b.position.x).toBeCloseTo(0);
    expect(b.position.y).toBeCloseTo(100); // the heading line, not the target's y
    // B faces back into the westward leg: east, a full turn from the heading.
    expect(b.heading).toBeCloseTo(2 * Math.PI);
  });

  it('meets the line where an oblique heading line crosses it', () => {
    // Heading up-left at 135°: a plain flatten would miss the line, but the
    // crossing of the heading line with x = 0 is (0, 100).
    const from: Pose = {position: {x: 100, y: 0}, heading: (3 * Math.PI) / 4};
    const section = shapeOntoLine(
      from,
      {x: 0, y: 98},
      normalLine,
      increment,
      threshold
    );
    if (section?.kind !== 'straight') throw new Error('expected a straight');
    const b = endPose(placeSection(section, 'A', from), 'B');
    expect(b.position.x).toBeCloseTo(0);
    expect(b.position.y).toBeCloseTo(100);
  });

  it('keeps a clean-angle curve, ending where its chord meets the line', () => {
    // A 90° arc from the origin: its chord ray crosses x = 100 at (100, 100).
    const from: Pose = {position: {x: 0, y: 0}, heading: 0};
    const line = {origin: {x: 100, y: 0}, direction: {x: 0, y: 1}};
    const section = shapeOntoLine(
      from,
      {x: 100, y: 100},
      line,
      increment,
      threshold
    );
    if (section?.kind !== 'curved') throw new Error('expected a curve');
    expect(radToDeg(section.arc.sweep)).toBeCloseTo(90);
    const b = endPose(placeSection(section, 'A', from), 'B');
    expect(b.position.x).toBeCloseTo(100);
    expect(b.position.y).toBeCloseTo(100);
  });

  it("snaps a curve's sweep and slides its radius onto the line", () => {
    // A target at (100, 105) is a ~92.8° arc; the sweep snaps to 90° and the
    // radius slides so the end lands on x = 100 — at (100, 100), not the target.
    const from: Pose = {position: {x: 0, y: 0}, heading: 0};
    const line = {origin: {x: 100, y: 0}, direction: {x: 0, y: 1}};
    const section = shapeOntoLine(
      from,
      {x: 100, y: 105},
      line,
      increment,
      threshold
    );
    if (section?.kind !== 'curved') throw new Error('expected a curve');
    expect(radToDeg(section.arc.sweep)).toBeCloseTo(90);
    const b = endPose(placeSection(section, 'A', from), 'B');
    expect(b.position.x).toBeCloseTo(100);
    expect(b.position.y).toBeCloseTo(100);
  });

  it('slides a clockwise curve onto the line', () => {
    // Mirror of the ccw case below the axis: a ~93° cw arc snaps to 90° and
    // its radius slides so the end lands on x = 100, at (100, -100).
    const from: Pose = {position: {x: 0, y: 0}, heading: 0};
    const line = {origin: {x: 100, y: 0}, direction: {x: 0, y: 1}};
    const section = shapeOntoLine(
      from,
      {x: 100, y: -105},
      line,
      increment,
      threshold
    );
    if (section?.kind !== 'curved') throw new Error('expected a curve');
    expect(section.turn).toBe('cw');
    expect(radToDeg(section.arc.sweep)).toBeCloseTo(90);
    const b = endPose(placeSection(section, 'A', from), 'B');
    expect(b.position.x).toBeCloseTo(100);
    expect(b.position.y).toBeCloseTo(-100);
  });

  it('keeps the angle-snapped section when the line never crosses', () => {
    // The snap line runs parallel to the heading, so there is no crossing to
    // slide the end onto; the plain angle-snapped section stands.
    const from: Pose = {position: {x: 0, y: 0}, heading: 0};
    const parallel = {origin: {x: 0, y: 100}, direction: {x: 1, y: 0}};
    const section = shapeOntoLine(
      from,
      {x: 50, y: 0},
      parallel,
      increment,
      threshold
    );
    expect(section).toEqual(
      snappedShapeTo(from, {x: 50, y: 0}, increment, threshold)
    );
  });

  it('returns null when there is no section to lay', () => {
    const from: Pose = {position: {x: 0, y: 0}, heading: 0};
    expect(
      shapeOntoLine(from, from.position, normalLine, increment, threshold)
    ).toBeNull();
  });
});

describe('shapeForSnap', () => {
  const increment = degToRad(15);
  const threshold = degToRad(5);

  it('angle-snaps toward the target when no end is in range', () => {
    const snap = {kind: 'angle' as const, point: {x: 100, y: 95}};
    expect(shapeForSnap(ORIGIN, snap, increment, threshold)).toEqual(
      snappedShapeTo(ORIGIN, snap.point, increment, threshold)
    );
  });

  it('aims straight at a snapped open-end point', () => {
    const end: Pose = {position: {x: 100, y: 40}, heading: Math.PI};
    const snap = {kind: 'end' as const, point: end.position, end: SOME_END};
    expect(shapeForSnap(ORIGIN, snap, increment, threshold)).toEqual(
      shapeTo(ORIGIN, end.position)
    );
  });

  it('aligns a snapped line, landing the end on it', () => {
    const from: Pose = {position: {x: 200, y: 100}, heading: Math.PI};
    const line = {origin: {x: 0, y: 0}, direction: {x: 0, y: 1}};
    const snap = {kind: 'line' as const, point: {x: 0, y: 103}, line};
    const section = shapeForSnap(from, snap, increment, threshold);
    if (!section) throw new Error('expected a section');
    const b = endPose(placeSection(section, 'A', from), 'B');
    expect(b.position.x).toBeCloseTo(0); // landed on the line x = 0
    expect(section).toEqual(
      shapeOntoLine(from, snap.point, line, increment, threshold)
    );
  });
});

describe('shownSnap', () => {
  const line = {origin: {x: 0, y: 0}, direction: {x: 0, y: 1}}; // x = 0
  const lineSnap = {kind: 'line' as const, point: {x: 0, y: 100}, line};

  it('keeps a line guide the section ends on', () => {
    // A 180° curve from the origin ends on the start's normal (x = 0).
    const half = curve(50, 180, 'ccw');
    expect(shownSnap(ORIGIN, lineSnap, half)).toEqual(lineSnap);
  });

  it('drops a line guide the section does not end on', () => {
    // A 90° curve ends at (100, 100), off x = 0 — the guide would be idle.
    const quarter = curve(100, 90, 'ccw');
    expect(shownSnap(ORIGIN, lineSnap, quarter)).toBeNull();
  });

  it('passes point and angle snaps through', () => {
    const end: Pose = {position: {x: 100, y: 40}, heading: Math.PI};
    const point = {kind: 'end' as const, point: end.position, end: SOME_END};
    const angle = {kind: 'angle' as const, point: {x: 100, y: 95}};
    expect(shownSnap(ORIGIN, point, straight(10))).toEqual(point);
    expect(shownSnap(ORIGIN, angle, straight(10))).toEqual(angle);
  });

  it('shows nothing when there is no section', () => {
    expect(shownSnap(ORIGIN, lineSnap, null)).toBeNull();
  });
});
