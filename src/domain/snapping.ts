/**
 * Turning a pointer gesture into the next section to lay (US-4, US-5).
 *
 * {@link resolveSnap} reads how a section laid from a pose toward a target snaps
 * onto the layout's open ends — their points and alignment lines — from
 * proximity alone; {@link resolveAnchorSnap} reads where a dropped anchor
 * pulls onto those same lines. {@link shapeForSnap} turns a snap into the
 * section, spending any freedom the snap leaves on a tidy sweep angle. An open end is a
 * {@link SectionEndPose}: the snap reads each end's pose for the geometry and
 * names the end it latched onto, so the caller can act on it (record a join).
 *
 * Each section below leads with its public surface and ends with the private
 * helpers behind it.
 */

import {
  arc,
  colinear,
  distance,
  dot,
  EPSILON,
  Line,
  lineIntersection,
  nearestLineTo,
  normalizeAngle,
  onLine,
  Point,
  Pose,
  posesEqual,
  radToDeg,
  reversePose,
  subtract,
  tangentAndNormalLines,
  unitArcChord,
  unitVector,
} from './geometry';
import {SectionEnd, SectionEndPose} from './layout';
import {
  Curved,
  curve,
  endPose,
  placeSection,
  SectionShape,
  Straight,
  straight,
} from './section';
import {assertNever} from './validate';

/**
 * What the pointer's target snapped to. Every kind carries the resolved `point`
 * the section is then built toward; `end` and `line` also carry the open-end
 * feature they latched onto, which the editor draws.
 *
 * - `end`: an open end — drawn as a ring at its `point`. Carries the `end` it
 *   latched onto, so the caller can act on it (e.g. record a join).
 * - `line`: one of an open end's normal or tangent lines (carries the `line`) —
 *   drawn as a guide.
 * - `angle`: no open end in range; the sweep angle-snaps toward `point`. There is
 *   no feature to carry — the snapped sweep is fixed when the arc is built.
 */
export type Snap =
  | {readonly kind: 'end'; readonly point: Point; readonly end: SectionEnd}
  | {readonly kind: 'line'; readonly point: Point; readonly line: Line}
  | {readonly kind: 'angle'; readonly point: Point};

/**
 * Resolves how a section laid from `from` toward `target` snaps: onto an open
 * end's point within `pointTolerance`, else the nearest tangent/normal line —
 * an open end's or `from`'s own — within `lineTolerance`, a point winning over
 * a line. Failing both it returns the `angle` snap, leaving the sweep to snap
 * toward `target`.
 *
 * An end snap lands the section's end on the open end itself, so it is offered
 * only when the section reaching that end meets it tangentially back-to-back —
 * its end pose the reverse of the open end's, the facing join threading seats —
 * so a connection never kinks. A near miss declines the point and falls through
 * to the line and angle snaps, which help align the heading until the approach
 * is tangent.
 *
 * Two cases offer no alignment and are skipped:
 * - An end at `from`: a section to it would be zero-length.
 * - A line `from` runs along (on it and parallel): a section there is trivially
 *   on it, so its guide would be redundant.
 *
 * A line `from` merely crosses stays a candidate: the section can still end back
 * on it (a 180° arc onto the start's normal). {@link shownSnap} decides whether
 * that guide is drawn, from the built section's end.
 */
export function resolveSnap(
  from: Pose,
  target: Point,
  openEnds: readonly SectionEndPose[],
  pointTolerance: number,
  lineTolerance: number
): Snap {
  // An end wins over any line, so look for the nearest open end first and skip
  // the line search entirely when one is in range.
  let nearest: {end: SectionEnd; pose: Pose; gap: number} | null = null;
  for (const {sectionEnd, pose} of openEnds) {
    // The railhead can't snap to itself: a section to its own start is empty.
    if (distance(pose.position, from.position) <= EPSILON) {
      continue;
    }
    const gap = distance(target, pose.position);
    if (gap > pointTolerance || (nearest && gap >= nearest.gap)) {
      continue;
    }
    // An end snap lays a section straight onto the end, so only offer it when
    // that section meets the end tangentially back-to-back — otherwise the
    // join would kink, which a run never permits. The connecting section
    // reaches the end's position; it qualifies when its far end (B) seats as
    // the reverse of the open end's pose, the facing join threading seats.
    const connector = shapeTo(from, pose.position);
    if (!connector) {
      continue;
    }
    const b = endPose(placeSection(connector, 'A', from), 'B');
    if (posesEqual(b, reversePose(pose))) {
      nearest = {end: sectionEnd, pose, gap};
    }
  }
  if (nearest) {
    return {kind: 'end', point: nearest.pose.position, end: nearest.end};
  }

  // `from` offers its own lines alongside the open ends': an anchor stands at
  // no open end, and the 180° arc back onto its start's normal must snap
  // wherever drawing starts. The tangent `from` runs along is dropped as
  // redundant, like any other line `from` lies along.
  const lines = [from, ...openEnds.map(({pose}) => pose)]
    .flatMap(pose => tangentAndNormalLines(pose))
    .filter(line => !colinear(from, line));
  const nearestLine = nearestLineTo(target, lines, lineTolerance);
  if (nearestLine) {
    return {kind: 'line', point: nearestLine.point, line: nearestLine.line};
  }
  return {kind: 'angle', point: target};
}

/**
 * Resolves where a dropped anchor pulls: onto the nearest of the open ends'
 * tangent/normal lines within `tolerance`, or nowhere (null). This is the
 * snap that aligns a new network with existing track — its anchor abreast of
 * a straight's end, say, so the two parallel legs of an oval start exactly
 * opposite.
 *
 * A separate resolver from {@link resolveSnap} because an anchor is a bare
 * point where a section will later start, not a section being laid: no end
 * point is on offer (a click near an open end belongs to the select gesture),
 * and there is no sweep to angle-snap when no line is in range — the anchor
 * simply drops where the pointer is.
 */
export function resolveAnchorSnap(
  target: Point,
  openEnds: readonly SectionEndPose[],
  tolerance: number
): Snap | null {
  const lines = openEnds.flatMap(({pose}) => tangentAndNormalLines(pose));
  const nearestLine = nearestLineTo(target, lines, tolerance);
  return nearestLine
    ? {kind: 'line', point: nearestLine.point, line: nearestLine.line}
    : null;
}

/**
 * The open end that `shape`, laid from `from`, seats on: the shape's far (`B`)
 * end poses as the reverse of the open end's — one place, opposite facings,
 * the back-to-back join threading seats — or null when it seats on none. This
 * is a fact of the laid geometry, not a snap: whatever shaped the section —
 * an end latch, a slide onto a guideline, or freehand placement — a far end
 * seated on an open end is a join, and the caller records it. The tolerance
 * is {@link posesEqual}'s ({@link EPSILON}): a near miss or a kinked meeting
 * seats on nothing, since a join demands tangency.
 */
export function findSeatedEnd(
  from: Pose,
  shape: SectionShape,
  openEnds: readonly SectionEndPose[]
): SectionEnd | null {
  const far = endPose(placeSection(shape, 'A', from), 'B');
  for (const {sectionEnd, pose} of openEnds) {
    if (posesEqual(far, reversePose(pose))) {
      return sectionEnd;
    }
  }
  return null;
}

/**
 * Builds the section a {@link Snap} calls for. The snap decides *what* to aim at
 * from pointer proximity alone; turning that into a section — which needs the
 * angle `increment` and `threshold` (radians) — lives here, so {@link resolveSnap}
 * stays a pure proximity test, free of section geometry. Angle-snapping shapes
 * the section only where the snap leaves room for it:
 *
 * - `angle`: the end is free, so the sweep angle-snaps toward the target — the
 *   ordinary drawing behavior, used whenever no end is in range.
 * - `line`: the end must land on a line, which leaves one degree of freedom;
 *   {@link shapeOntoLine} angle-snaps the shape, then spends that freedom
 *   sliding the end onto the line.
 * - `end`: pinned to an open end, so the section just reaches it.
 */
export function shapeForSnap(
  from: Pose,
  snap: Snap,
  increment: number,
  threshold: number
): SectionShape | null {
  switch (snap.kind) {
    case 'angle':
      return snappedShapeTo(from, snap.point, increment, threshold);
    case 'line':
      return shapeOntoLine(from, snap.point, snap.line, increment, threshold);
    case 'end':
      return shapeTo(from, snap.point);
    default:
      return assertNever(snap);
  }
}

/**
 * The snap whose feedback should be drawn for `section`, or null when there is
 * none. A line's guide is shown only where the section's end actually lands on
 * the line: an active alignment always lands there, while a line the railhead
 * lies on lands only when the section curves back onto it (a 180° arc onto the
 * start's normal). An end's ring and the featureless `angle` snap carry through
 * unchanged; a null section (nothing to lay) shows nothing.
 */
export function shownSnap(
  from: Pose,
  snap: Snap,
  section: SectionShape | null
): Snap | null {
  if (!section) {
    return null;
  }
  if (snap.kind !== 'line') {
    return snap;
  }
  // The section is laid from `from` by its A end; its far end B is where the guide lands.
  const end = endPose(placeSection(section, 'A', from), 'B');
  return onLine(end.position, snap.line) ? snap : null;
}

/**
 * The section from `from` to `target`: the unique straight or arc that leaves
 * `from` tangent to its heading and ends at `target` — or `null` when none
 * exists (the target is `from`'s own position, or lies straight behind it).
 * This is the exact geometry, with no snapping; {@link snappedShapeTo} and
 * {@link shapeOntoLine} layer the angle and line snaps onto it, and a point
 * snap, which already names an exact target, uses it as is.
 *
 * The arc lies on the circle tangent to `from`'s heading at its position and
 * passing through `target`: that circle's center is on the normal at `from`,
 * equidistant from the two points. The signed perpendicular offset of `target`
 * from the heading therefore fixes the radius, its sign fixes the bend
 * direction, and the angle subtended at the center is the sweep. A target on the
 * heading line has no such circle — it is a straight, or, if behind, unreachable.
 */
export function shapeTo(from: Pose, target: Point): SectionShape | null {
  const forward = unitVector(from.heading);
  const left = unitVector(from.heading + Math.PI / 2);
  const toTarget = subtract(target, from.position);

  const distanceSquared = dot(toTarget, toTarget);
  if (distanceSquared < EPSILON) {
    return null; // target coincides with `from`
  }

  const ahead = dot(forward, toTarget);
  const sideways = dot(left, toTarget);

  // A target with no perpendicular offset lies on the heading line: a straight,
  // whose length is the target's forward distance `ahead`, reachable only when
  // the target is in front. This test is exact — a target just off the line
  // yields a valid (large-radius) arc, and any snap-to-straight tolerance
  // belongs to the UI, not here.
  if (Math.abs(sideways) < EPSILON) {
    return ahead > 0 ? straight(ahead) : null;
  }

  const offset = distanceSquared / (2 * sideways);
  const radius = Math.abs(offset);
  const center: Point = {
    x: from.position.x + offset * left.x,
    y: from.position.y + offset * left.y,
  };
  const startAngle = Math.atan2(
    from.position.y - center.y,
    from.position.x - center.x
  );
  const endAngle = Math.atan2(target.y - center.y, target.x - center.x);

  // A center to the left of travel bends the track counter-clockwise.
  const sweep =
    offset > 0
      ? normalizeAngle(endAngle - startAngle)
      : -normalizeAngle(startAngle - endAngle);
  return curve(radius, radToDeg(sweep));
}

/**
 * Snaps `value` to the nearest multiple of `increment` if it lands within
 * `threshold` of one, otherwise leaves it untouched — so a value set
 * deliberately off-grid stands, while one nudged close to a multiple snaps
 * onto it.
 */
export function snapToIncrement(
  value: number,
  increment: number,
  threshold: number
): number {
  const nearest = Math.round(value / increment) * increment;
  return Math.abs(value - nearest) <= threshold ? nearest : value;
}

/**
 * Like {@link shapeTo}, but with the curve's sweep snapped to a tidy
 * angle (clean angles, arbitrary radii — the flex/handlaid promise). When the
 * sweep snaps, the radius is *fitted* so the snapped arc still ends as near the
 * pointer as it can, so the preview keeps tracking the pointer instead of
 * jumping. A sweep that snaps to zero flattens into a straight; a curve whose
 * sweep lands on no tidy multiple, and a section already straight, pass through
 * unchanged. `increment`/`threshold` are radians.
 */
export function snappedShapeTo(
  from: Pose,
  target: Point,
  increment: number,
  threshold: number
): SectionShape | null {
  const raw = shapeTo(from, target);
  if (!raw || raw.kind === 'straight') {
    return raw;
  }
  const sweep = snapToIncrement(raw.arc.sweep, increment, threshold);
  if (sweep === raw.arc.sweep) {
    return raw;
  }

  const toTarget = subtract(target, from.position);
  if (sweep === 0) {
    // Flatten to a straight reaching the pointer's forward projection.
    const ahead = dot(unitVector(from.heading), toTarget);
    return ahead > EPSILON ? straight(ahead) : raw;
  }

  // With the sweep fixed, the arc's end rides a ray out of `from`: it is
  // `from + radius·chord`, where `chord` is the unit-radius arc's start→end
  // vector ({@link unitArcChord}). The end slides out along that ray as the
  // radius grows, so the radius whose end is nearest the pointer is the
  // pointer's projection onto the ray; a negative projection means the pointer
  // is behind `from`, so leave the curve raw.
  const chord = unitArcChord(from.heading, sweep);
  const chordLengthSquared = dot(chord, chord); // ~0 only for a full-circle sweep
  const radius =
    chordLengthSquared > EPSILON
      ? dot(toTarget, chord) / chordLengthSquared
      : 0;
  return radius > 0 ? {kind: 'curved', arc: arc(radius, sweep)} : raw;
}

/**
 * The section laid from `from` toward `target` once `target` has snapped onto
 * `line`, composing the two snaps: the angle snap picks the shape, then
 * alignment slides that shape's end onto the line. A straight slides its length
 * to where its heading line crosses `line`; a curve keeps its snapped sweep and
 * slides its radius to where its chord ray crosses `line` — each keeping its
 * clean shape while meeting the line. When the crossing lies behind or is
 * parallel, the angle-snapped section is kept. `increment`/`threshold` are
 * radians.
 */
export function shapeOntoLine(
  from: Pose,
  target: Point,
  line: Line,
  increment: number,
  threshold: number
): SectionShape | null {
  const shaped = snappedShapeTo(from, target, increment, threshold);
  if (!shaped) {
    return null;
  }
  const alignedShape =
    shaped.kind === 'straight'
      ? straightOntoLine(from, line)
      : curveOntoLine(from, line, shaped.arc.sweep);
  return alignedShape ?? shaped;
}

/**
 * The straight from `from` ending where its heading line crosses `line` — the
 * length that lands the end exactly on the line while the heading stands.
 * Null when the crossing lies behind `from` or the lines are parallel.
 */
export function straightOntoLine(from: Pose, line: Line): Straight | null {
  const forward = unitVector(from.heading);
  const meeting = lineIntersection(
    {origin: from.position, direction: forward},
    line
  );
  if (!meeting) {
    return null;
  }
  const reach = dot(forward, subtract(meeting, from.position));
  return reach > EPSILON ? straight(reach) : null;
}

// A curve of the signed `sweep` from `from` whose end meets `line`, or null.
// The end rides the ray `from + radius·chord`, so the radius that lands it on
// the line is where that ray crosses the line.
function curveOntoLine(from: Pose, line: Line, sweep: number): Curved | null {
  const chord = unitArcChord(from.heading, sweep);
  const meeting = lineIntersection(
    {origin: from.position, direction: chord},
    line
  );
  if (!meeting) {
    return null;
  }
  const radius =
    dot(subtract(meeting, from.position), chord) / dot(chord, chord);
  return radius > EPSILON ? {kind: 'curved', arc: arc(radius, sweep)} : null;
}
