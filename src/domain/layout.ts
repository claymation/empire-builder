/**
 * Placing track in the plane (US-3, US-4, US-5).
 *
 * The atomic operation is {@link placeSection}: it locates a section at an entry
 * pose, and {@link exitPoses} reports the poses at which a train can leave it.
 * Because connected sections share a pose at their join, tangency (US-5) holds by
 * construction — there is no way to express a kink.
 *
 * {@link placeRoute} follows a single path, threading each section's exit into the
 * next. {@link sectionForSnap} turns a pointer gesture into the next section to
 * lay, optionally snapping it to tidy angles and to the layout's open ends.
 *
 * Each section below leads with its public surface and ends with the private
 * helpers behind it.
 */

import {
  arc,
  Arc,
  arcBounds,
  arcEndPose,
  arcLength,
  Bounds,
  cross,
  degToRad,
  distance,
  dot,
  Handedness,
  handednessSign,
  Line,
  lineIntersection,
  normalizeAngle,
  onLine,
  PlacedArc,
  PlacedSegment,
  Point,
  Pose,
  projectOntoLine,
  radToDeg,
  segmentBounds,
  segmentEndPose,
  subtract,
  tangentAndNormalLines,
  unionBounds,
  unitArcChord,
  unitVector,
  Vector,
} from './geometry';
import {assertNever, requirePositive} from './validate';

// Distances (mm) and dot products (mm²) below this are treated as zero.
const EPSILON = 1e-9;

// ── Section shapes ──

/**
 * A section as authored into a route: a straight of a given length, or a curve of
 * a given arc, laid to bend left or right. A curve section is symmetric — its
 * handedness is chosen when laying it, so it lives here rather than on the arc.
 */
export type RouteSection =
  | {readonly kind: 'straight'; readonly length: number}
  | {
      readonly kind: 'curved';
      readonly arc: Arc;
      readonly handedness: Handedness;
    };

/** A route section located in the plane: it gains an entry pose, and nothing else. */
export type PlacedSection = RouteSection & {readonly entry: Pose};

/** The placed geometry of a section: a segment for straights, an arc for curves. */
export type SectionGeometry = PlacedSegment | PlacedArc;

/** The result of placing a whole route: the placed sections and where they end. */
export interface PlacedRoute {
  readonly sections: readonly PlacedSection[];
  /** The pose a train would have on leaving the final section. */
  readonly exit: Pose;
}

/** Builds a straight route section of the given length. */
export function straight(length: number): RouteSection {
  return {kind: 'straight', length: requirePositive(length, 'length')};
}

/** Builds a curve of the given radius (mm) bending left through `sweepDegrees`. */
export function curveLeft(radius: number, sweepDegrees: number): RouteSection {
  return curve(radius, sweepDegrees, 'left');
}

/** Builds a curve of the given radius (mm) bending right through `sweepDegrees`. */
export function curveRight(radius: number, sweepDegrees: number): RouteSection {
  return curve(radius, sweepDegrees, 'right');
}

/** The running length of a section — the distance a train travels across it. */
export function sectionLength(section: RouteSection): number {
  switch (section.kind) {
    case 'straight':
      return requirePositive(section.length, 'length');
    case 'curved':
      return arcLength(section.arc);
    default:
      return assertNever(section);
  }
}

function curve(
  radius: number,
  sweepDegrees: number,
  handedness: Handedness
): RouteSection {
  return {kind: 'curved', arc: arc(radius, degToRad(sweepDegrees)), handedness};
}

// ── Placing sections ──

/**
 * Locates a section at `entry`. A PlacedSection stays a plain, serializable value,
 * so its geometry is computed from it by {@link sectionGeometry} rather than
 * stored — nothing to keep in sync as sections move.
 */
export function placeSection(
  entry: Pose,
  section: RouteSection
): PlacedSection {
  return {...section, entry};
}

/**
 * The placed geometry of a section, derived from its entry pose. A curve's
 * handedness becomes the sign of the arc's sweep — left counter-clockwise,
 * right clockwise.
 */
export function sectionGeometry(placed: PlacedSection): SectionGeometry {
  switch (placed.kind) {
    case 'straight':
      return {kind: 'segment', start: placed.entry, length: placed.length};
    case 'curved': {
      const sweep = handednessSign(placed.handedness) * placed.arc.sweep;
      return {
        kind: 'arc',
        start: placed.entry,
        radius: placed.arc.radius,
        sweep,
      };
    }
    default:
      return assertNever(placed);
  }
}

/**
 * The poses at which a train can leave the section. The result is a list because a
 * section may have more than one exit; a straight or curve has exactly one.
 */
export function exitPoses(placed: PlacedSection): Pose[] {
  const geometry = sectionGeometry(placed);
  switch (geometry.kind) {
    case 'segment':
      return [segmentEndPose(geometry)];
    case 'arc':
      return [arcEndPose(geometry)];
    default:
      return assertNever(geometry);
  }
}

/** The bounding box of a placed section. Arcs account for their bulge. */
export function sectionBounds(placed: PlacedSection): Bounds {
  const geometry = sectionGeometry(placed);
  switch (geometry.kind) {
    case 'segment':
      return segmentBounds(geometry);
    case 'arc':
      return arcBounds(geometry);
    default:
      return assertNever(geometry);
  }
}

/**
 * The bounding box covering every placed section. Throws on an empty route, which
 * has no extent to bound.
 */
export function routeBounds(sections: readonly PlacedSection[]): Bounds {
  if (sections.length === 0) {
    throw new RangeError('routeBounds requires at least one section');
  }
  return sections.map(sectionBounds).reduce(unionBounds);
}

/**
 * Places an ordered run of sections starting from `anchor`, threading each section's
 * exit into the next.
 */
export function placeRoute(
  anchor: Pose,
  route: readonly RouteSection[]
): PlacedRoute {
  const placed: PlacedSection[] = [];
  let pose = anchor;
  for (const section of route) {
    const placedSection = placeSection(pose, section);
    placed.push(placedSection);
    const exits = exitPoses(placedSection);
    // Follow the through route: a section's first exit continues the path.
    pose = exits[0];
  }
  return {sections: placed, exit: pose};
}

// ── The layout ──

/**
 * A track plan: where it starts, and the sections laid from there. A null anchor
 * is an empty plan, before the start has been placed.
 */
export interface Layout {
  readonly anchor: Pose | null;
  readonly sections: readonly RouteSection[];
}

/** The empty plan: no start placed, no sections. */
export const EMPTY_LAYOUT: Layout = {anchor: null, sections: []};

/**
 * The open end the next section would extend from, or null before the start has
 * been placed.
 */
export function railhead(layout: Layout): Pose | null {
  return layout.anchor ? placeRoute(layout.anchor, layout.sections).exit : null;
}

/**
 * The open ends a new section can snap onto. Today a layout is a single chain, so
 * this is its anchor, the fixed start the chain grows from. The result is a list
 * because a layout may expose several open ends.
 *
 * The railhead is not filtered out here; {@link resolveSnap} and
 * {@link realizedSnap} decline the snaps that would do nothing from it. An open
 * end at the railhead still guides what it can — the anchor's normal aligns a
 * 180° curve drawn from it, even before any section is laid.
 */
export function openEnds(layout: Layout): Pose[] {
  return layout.anchor ? [layout.anchor] : [];
}

/** The layout's sections placed in the plane. */
export function placedSections(layout: Layout): readonly PlacedSection[] {
  return layout.anchor
    ? placeRoute(layout.anchor, layout.sections).sections
    : [];
}

// ── Drawing the next section ──

/**
 * What the pointer's target snapped to. Every kind carries the resolved `point`
 * the section is then built toward; `point` and `line` also carry the open-end
 * feature they latched onto, which the editor draws.
 *
 * - `point`: an open end's point (carries the `end`) — drawn as a ring.
 * - `line`: one of an open end's normal or tangent lines (carries the `line`) —
 *   drawn as a guide.
 * - `angle`: no open end in range; the sweep angle-snaps toward `point`. There is
 *   no feature to carry — the snapped sweep is fixed when the arc is built.
 */
export type Snap =
  | {readonly kind: 'point'; readonly point: Point; readonly end: Pose}
  | {readonly kind: 'line'; readonly point: Point; readonly line: Line}
  | {readonly kind: 'angle'; readonly point: Point};

/**
 * Resolves how a section laid from `from` toward `target` snaps. It tries the
 * open ends first — onto an end's point within `pointTolerance`, else its
 * nearest line within `lineTolerance`; a point wins over a line, being where an
 * end's two lines cross (aligning to the end itself, not merely a line through
 * it). Failing that it returns the `angle` snap, leaving the sweep to snap
 * toward `target`.
 *
 * Two cases offer no alignment and are skipped:
 * - An end at `from`: a section to its point would be zero-length.
 * - A line `from` runs along (lies on and heads parallel to): a section there is
 *   trivially on it, so its guide would be redundant — the first straight laid
 *   along the anchor's own heading line.
 *
 * A line `from` merely crosses is kept as a candidate even though `from` lies on
 * it, because the section can still end back on it — a 180° arc onto the start's
 * normal. Whether that candidate's guide is actually drawn is left to
 * {@link realizedSnap}, which checks the built section's end against the line.
 */
export function resolveSnap(
  from: Pose,
  target: Point,
  openEnds: readonly Pose[],
  pointTolerance: number,
  lineTolerance: number
): Snap {
  let nearestPoint: {end: Pose; gap: number} | null = null;
  let nearestLine: {point: Point; line: Line; gap: number} | null = null;
  for (const end of openEnds) {
    const pointGap = distance(target, end.position);
    if (
      distance(from.position, end.position) > EPSILON &&
      pointGap <= pointTolerance &&
      (!nearestPoint || pointGap < nearestPoint.gap)
    ) {
      nearestPoint = {end, gap: pointGap};
    }
    for (const line of tangentAndNormalLines(end)) {
      if (runsAlong(from, line)) {
        continue;
      }
      const foot = projectOntoLine(target, line);
      const lineGap = distance(target, foot);
      if (
        lineGap <= lineTolerance &&
        (!nearestLine || lineGap < nearestLine.gap)
      ) {
        nearestLine = {point: foot, line, gap: lineGap};
      }
    }
  }
  if (nearestPoint) {
    return {
      kind: 'point',
      point: nearestPoint.end.position,
      end: nearestPoint.end,
    };
  }
  if (nearestLine) {
    return {kind: 'line', point: nearestLine.point, line: nearestLine.line};
  }
  return {kind: 'angle', point: target};
}

/**
 * The section laid from `from` for a given {@link Snap}. Angle-snapping shapes
 * the section only where the snap leaves room for it:
 *
 * - `angle`: the end is free, so the sweep angle-snaps toward the target — the
 *   ordinary drawing behavior, used whenever no end is in range.
 * - `line`: the end must land on a line, which leaves one degree of freedom;
 *   {@link sectionOntoLine} angle-snaps the shape, then spends that freedom
 *   sliding the end onto the line.
 * - `point`: the end is pinned to an open end, so the section just reaches it.
 *
 * `increment`/`threshold` are radians.
 */
export function sectionForSnap(
  from: Pose,
  snap: Snap,
  increment: number,
  threshold: number
): RouteSection | null {
  switch (snap.kind) {
    case 'angle':
      return snappedSectionTo(from, snap.point, increment, threshold);
    case 'line':
      return sectionOntoLine(from, snap.point, snap.line, increment, threshold);
    case 'point':
      return sectionTo(from, snap.point);
    default:
      return assertNever(snap);
  }
}

/**
 * The snap whose feedback `section` actually earns, or null when it earns none.
 * A line guide is drawn only where the section's end lands on the line: an active
 * alignment always lands there, and a line the railhead lies on realizes only
 * when the section curves back onto it — a 180° arc onto the start's normal —
 * never for the idle case of merely starting on it. Point and angle snaps pass
 * through; a {@link sectionForSnap} that returned null leaves nothing to draw.
 */
export function realizedSnap(
  from: Pose,
  snap: Snap,
  section: RouteSection | null
): Snap | null {
  if (!section || snap.kind !== 'line') {
    return section ? snap : null;
  }
  const [end] = exitPoses(placeSection(from, section));
  return onLine(end.position, snap.line) ? snap : null;
}

/**
 * The plain section from `from` to `target`: the unique straight or arc that
 * leaves `from` tangent to its heading and passes through `target` — or `null`
 * when none exists (the target is the start point, or lies straight behind it).
 * This is the exact geometry, with no snapping; {@link snappedSectionTo} and
 * {@link sectionOntoLine} layer the angle and line snaps onto it, and a point
 * snap, which already names an exact target, uses it as is.
 *
 * The arc is the circle tangent to `from`'s heading at its position and passing
 * through `target`: its center lies on the normal at `from`, equidistant from
 * the two points. The signed perpendicular offset of `target` from the heading
 * therefore fixes the radius, its sign fixes the bend direction, and the angle
 * subtended at the center is the sweep. A target on the heading line has no such
 * circle — it is a straight, or, if behind, unreachable.
 */
export function sectionTo(from: Pose, target: Point): RouteSection | null {
  const forward = unitVector(from.heading);
  const left = unitVector(from.heading + Math.PI / 2);
  const toTarget = subtract(target, from.position);

  const distanceSquared = dot(toTarget, toTarget);
  if (distanceSquared < EPSILON) {
    return null; // target coincides with the start
  }

  const ahead = dot(forward, toTarget);
  const sideways = dot(left, toTarget);

  // A target with no perpendicular offset lies on the heading line: a straight,
  // which reaches only a point ahead. This test is exact — a target just off the
  // line yields a valid (large-radius) arc, and any snap-to-straight tolerance
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

  // A center to the left of travel bends the track left (counter-clockwise).
  return offset > 0
    ? curveLeft(radius, radToDeg(normalizeAngle(endAngle - startAngle)))
    : curveRight(radius, radToDeg(normalizeAngle(startAngle - endAngle)));
}

/**
 * Snaps `value` to the nearest multiple of `increment` if it lands within
 * `threshold` of one, otherwise leaves it untouched — so a value set
 * deliberately off-grid stands, while one nudged close to a multiple clicks
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
 * Like {@link sectionTo}, but with the curve's sweep snapped to a tidy
 * angle (clean angles, arbitrary radii — the flex/handlaid promise). When the
 * sweep snaps, the radius is *fitted* so the snapped arc still ends as near the
 * pointer as it can, so the preview keeps tracking the pointer instead of
 * jumping. A sweep that snaps to zero flattens into a straight; a curve whose
 * sweep lands on no tidy multiple, and a section already straight, pass through
 * unchanged. `increment`/`threshold` are radians.
 */
export function snappedSectionTo(
  from: Pose,
  target: Point,
  increment: number,
  threshold: number
): RouteSection | null {
  const raw = sectionTo(from, target);
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
  // `from + radius·chord`, where `chord` is the unit-radius arc's straight
  // start→end (see {@link arcChord}). The end slides out along that ray as the
  // radius grows, so the radius whose end is nearest the pointer is the
  // pointer's projection onto the ray; a negative projection means the pointer
  // is behind `from`, so leave the curve raw.
  const chord = arcChord(from, sweep, raw.handedness);
  const chordLengthSquared = dot(chord, chord); // ~0 only for a full-circle sweep
  const radius =
    chordLengthSquared > EPSILON
      ? dot(toTarget, chord) / chordLengthSquared
      : 0;
  return radius > 0
    ? {kind: 'curved', arc: arc(radius, sweep), handedness: raw.handedness}
    : raw;
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
export function sectionOntoLine(
  from: Pose,
  target: Point,
  line: Line,
  increment: number,
  threshold: number
): RouteSection | null {
  const shaped = snappedSectionTo(from, target, increment, threshold);
  if (!shaped) {
    return null;
  }
  const aligned =
    shaped.kind === 'straight'
      ? straightOntoLine(from, line)
      : curveOntoLine(from, line, shaped.arc.sweep, shaped.handedness);
  return aligned ?? shaped;
}

// Whether a section leaving `from` would merely run along `line`: `from` lies on
// it and heads parallel to it (either direction), so the section never departs.
function runsAlong(from: Pose, line: Line): boolean {
  return (
    onLine(from.position, line) &&
    Math.abs(cross(unitVector(from.heading), line.direction)) < EPSILON
  );
}

/**
 * The straight start→end of the unit-radius `sweep`/`handedness` arc leaving
 * `from`: the direction the placed arc's end rides out along as its radius grows.
 * Vanishes (length ~0) only for a full-circle sweep.
 */
function arcChord(from: Pose, sweep: number, handedness: Handedness): Vector {
  return unitArcChord(from.heading, handednessSign(handedness) * sweep);
}

// A straight from `from` ending where its heading line crosses `line`, or null.
function straightOntoLine(from: Pose, line: Line): RouteSection | null {
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

// A `sweep`/`handedness` curve from `from` whose end meets `line`, or null. The
// end rides the ray `from + radius·chord`, so the radius that lands it on the
// line is where that ray crosses the line.
function curveOntoLine(
  from: Pose,
  line: Line,
  sweep: number,
  handedness: Handedness
): RouteSection | null {
  const chord = arcChord(from, sweep, handedness);
  const meeting = lineIntersection(
    {origin: from.position, direction: chord},
    line
  );
  if (!meeting) {
    return null;
  }
  const radius =
    dot(subtract(meeting, from.position), chord) / dot(chord, chord);
  return radius > EPSILON
    ? {kind: 'curved', arc: arc(radius, sweep), handedness}
    : null;
}
