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
  dot,
  Handedness,
  normalizeAngle,
  PlacedArc,
  PlacedSegment,
  Point,
  Pose,
  radToDeg,
  segmentBounds,
  segmentEndPose,
  snapToIncrement,
  unionBounds,
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
 * The section that continues tangentially from `from` to `target` — the geometry
 * behind the lay-track tool's pointer-follow preview — or `null` when no such
 * section exists (the target is the start point, or lies straight behind it).
 *
 * The arc is the circle tangent to `from`'s heading at its position and passing
 * through `target`: its center lies on the normal at `from`, equidistant from
 * the two points. The signed perpendicular offset of `target` from the heading
 * therefore fixes the radius, its sign fixes the bend direction, and the angle
 * subtended at the center is the sweep. A target on the heading line has no such
 * circle — it is a straight, or, if behind, unreachable.
 */
export function tangentSectionTo(
  from: Pose,
  target: Point
): RouteSection | null {
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
 * Like {@link tangentSectionTo}, but with the curve's sweep snapped to a tidy
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
  const raw = tangentSectionTo(from, target);
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

  // The snapped arc's end is `from + radius·w` for a fixed direction `w`; the
  // radius that puts it nearest the pointer is the pointer's projection onto
  // that ray. Negative means the pointer is behind it, so leave the curve raw.
  const turn = raw.handedness === 'left' ? 1 : -1;
  const signed = turn * sweep;
  const h = from.heading;
  const w: Vector = {
    x: turn * (Math.sin(h + signed) - Math.sin(h)),
    y: turn * (Math.cos(h) - Math.cos(h + signed)),
  };
  const wLengthSquared = dot(w, w); // ~0 only for a full-circle sweep
  const radius =
    wLengthSquared > EPSILON ? dot(toTarget, w) / wLengthSquared : 0;
  return radius > 0
    ? {kind: 'curved', arc: arc(radius, sweep), handedness: raw.handedness}
    : raw;
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

/** The layout's sections placed in the plane. */
export function placedSections(layout: Layout): readonly PlacedSection[] {
  return layout.anchor
    ? placeRoute(layout.anchor, layout.sections).sections
    : [];
}
