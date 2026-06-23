/**
 * Placing track in the plane (US-3, US-4, US-5).
 *
 * The atomic operation is {@link placeSection}: it locates a section at an entry
 * pose, and {@link exitPoses} reports the poses at which a train can leave it.
 * Because connected sections share a pose at their join, tangency (US-5) holds by
 * construction — there is no way to express a kink.
 *
 * {@link placeRoute} follows a single path, threading each section's exit into the
 * next.
 */

import {
  arc,
  Arc,
  arcBounds,
  arcEndPose,
  arcLength,
  Bounds,
  degToRad,
  distance,
  dot,
  Handedness,
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
  unionBounds,
  unitArcChord,
  unitVector,
  Vector,
} from './geometry';
import {assertNever, requirePositive} from './validate';

// Distances (mm) and dot products (mm²) below this are treated as zero.
const EPSILON = 1e-9;

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

function curve(
  radius: number,
  sweepDegrees: number,
  handedness: Handedness
): RouteSection {
  return {kind: 'curved', arc: arc(radius, degToRad(sweepDegrees)), handedness};
}

/**
 * The plain section from `from` to `target`: the unique straight or arc that
 * leaves `from` tangent to its heading and passes through `target` — or `null`
 * when none exists (the target is the start point, or lies straight behind it).
 * This is the exact geometry, with no snapping; {@link snappedSectionTo} and
 * {@link alignedSectionTo} are this same section with the angle or line snap
 * layered on, and the cases that want neither (a point snap, or ⌥) use it raw.
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
  const toTarget: Vector = {
    x: target.x - from.position.x,
    y: target.y - from.position.y,
  };

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
 * `threshold` of one, otherwise leaves it untouched. The gentle threshold is
 * what lets a deliberate off-grid value stand while still clicking onto tidy
 * ones — a 38° curve stays 38°, but one dragged near 180° snaps to it.
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
 * jumping. A sweep that snaps to zero flattens into a straight; an unsnapped or
 * already-straight section passes through. `increment`/`threshold` are radians.
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

  const toTarget: Vector = {
    x: target.x - from.position.x,
    y: target.y - from.position.y,
  };
  if (sweep === 0) {
    // Flatten to a straight reaching the pointer's forward projection.
    const ahead = dot(unitVector(from.heading), toTarget);
    return ahead > EPSILON ? straight(ahead) : raw;
  }

  // With the sweep fixed, the arc's end rides a ray out of `from`: it is
  // `from + radius·chord`, where `chord` is the unit-radius arc's straight
  // start→end (see {@link unitArcChord}). The radius whose end is nearest the
  // pointer is the pointer's projection onto that ray; a negative projection
  // means the pointer is behind `from`, so leave the curve raw.
  //
  //            · end       chord: the unit-radius arc's straight start→end.
  //           /            The end rides the ray  from + radius·chord,
  //   from ·──→ heading     sliding out as the radius grows.
  const signed = (raw.handedness === 'left' ? 1 : -1) * sweep;
  const chord = unitArcChord(from.heading, signed);
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
 * What the pointer's target snapped to. Every kind carries the resolved `point`
 * the section is then built toward; `point` and `line` also carry the open-end
 * feature they latched onto, which the editor draws.
 *
 * - `point`: an open end's point (carries the `end`) — drawn as a ring.
 * - `line`: one of an open end's lines (carries the `line`) — drawn as a guide.
 * - `angle`: no open end in range, so the sweep will snap toward `point`. There
 *   is no feature to carry: the snapped sweep is resolved later, with the arc.
 * - `none`: snapping is suspended, so nothing snapped and the section is raw.
 *   Only suspension yields `none` — a pointer near no end is `angle`, not `none`.
 */
export type Snap =
  | {readonly kind: 'point'; readonly point: Point; readonly end: Pose}
  | {readonly kind: 'line'; readonly point: Point; readonly line: Line}
  | {readonly kind: 'angle'; readonly point: Point}
  | {readonly kind: 'none'; readonly point: Point};

// An open end's tangent line (along its heading) and normal line (square to it)
// — the two lines a section can align to there.
function tangentAndNormalLines(end: Pose): Line[] {
  return [
    {origin: end.position, direction: unitVector(end.heading)},
    {origin: end.position, direction: unitVector(end.heading + Math.PI / 2)},
  ];
}

/**
 * Resolves how a section laid from `from` toward `target` snaps. It tries the
 * open ends first — onto an end's point within `pointTolerance`, else its
 * nearest line within `lineTolerance`; a point wins over a line, being where an
 * end's two lines cross (aligning to the end itself, not merely a line through
 * it). Failing that it returns the `angle` snap, leaving the sweep to snap
 * toward `target`. Other snap sources (parallel track, the sheet edge) may join
 * the open ends later.
 *
 * A line the railhead (`from`) already lies on is skipped: the section is
 * trivially on it, so aligning to it would only draw a redundant guide — the
 * case of a first straight laid out along the anchor's own heading line.
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
      pointGap <= pointTolerance &&
      (!nearestPoint || pointGap < nearestPoint.gap)
    ) {
      nearestPoint = {end, gap: pointGap};
    }
    for (const line of tangentAndNormalLines(end)) {
      if (onLine(from.position, line)) {
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
 * The section laid from `from` toward `target` once `target` has snapped onto
 * `line`, composing the two snaps: the angle snap picks the shape, then
 * alignment slides that shape's end onto the line. A straight slides its length
 * to where its heading line crosses `line`; a curve keeps its snapped sweep and
 * slides its radius to where its chord ray crosses `line` — each keeping its
 * clean shape while meeting the line. When the crossing lies behind or is
 * parallel, the angle-snapped section is kept. `increment`/`threshold` are
 * radians.
 */
export function alignedSectionTo(
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

// A straight from `from` ending where its heading line crosses `line`, or null.
function straightOntoLine(from: Pose, line: Line): RouteSection | null {
  const headingLine: Line = {
    origin: from.position,
    direction: unitVector(from.heading),
  };
  const meeting = lineIntersection(headingLine, line);
  if (!meeting) {
    return null;
  }
  const reach = dot(unitVector(from.heading), {
    x: meeting.x - from.position.x,
    y: meeting.y - from.position.y,
  });
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
  const signed = (handedness === 'left' ? 1 : -1) * sweep;
  const chord = unitArcChord(from.heading, signed);
  const meeting = lineIntersection(
    {origin: from.position, direction: chord},
    line
  );
  if (!meeting) {
    return null;
  }
  const radius =
    dot(
      {x: meeting.x - from.position.x, y: meeting.y - from.position.y},
      chord
    ) / dot(chord, chord);
  return radius > EPSILON
    ? {kind: 'curved', arc: arc(radius, sweep), handedness}
    : null;
}

/**
 * The section laid from `from` for a given {@link Snap}. Angle-snapping shapes
 * the section only where the snap leaves room for it:
 *
 * - `angle`: the end is free, so the sweep angle-snaps toward the target — the
 *   ordinary drawing behavior, used whenever no end is in range.
 * - `line`: the end must land on a line, which leaves one degree of freedom;
 *   {@link alignedSectionTo} angle-snaps the shape, then spends that freedom
 *   sliding the end onto the line.
 * - `point` / `none`: no room to angle-snap, so the section just reaches its
 *   target — a `point` pins the end to an open end, and `none` (only when
 *   snapping is suspended) reaches the raw pointer.
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
      return alignedSectionTo(
        from,
        snap.point,
        snap.line,
        increment,
        threshold
      );
    case 'point':
    case 'none':
      return sectionTo(from, snap.point);
    default:
      return assertNever(snap);
  }
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
      const sweep = (placed.handedness === 'left' ? 1 : -1) * placed.arc.sweep;
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
 * The open ends a new section can snap onto — every free track end except the
 * railhead it extends from. Today a layout is a single chain, so this is its
 * anchor once a section has been laid (before that, the anchor is itself the
 * railhead). It returns a list, named for the general case, because turnouts and
 * multiple runs will add open ends later.
 */
export function openEnds(layout: Layout): Pose[] {
  return layout.anchor && layout.sections.length > 0 ? [layout.anchor] : [];
}

/** The layout's sections placed in the plane. */
export function placedSections(layout: Layout): readonly PlacedSection[] {
  return layout.anchor
    ? placeRoute(layout.anchor, layout.sections).sections
    : [];
}
