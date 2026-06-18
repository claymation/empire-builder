/**
 * Plane geometry primitives for the layout, in millimeters. The domain uses
 * standard math conventions: +x points right, +y points up, and angles are
 * measured in radians counter-clockwise from the +x axis. The rendering edge is
 * responsible for mapping this onto a y-down canvas.
 */

import {requireFinite, requirePositive} from './validate';

/** A point in the layout plane, in millimeters. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * A position together with the direction of travel through it. Two connected
 * track pieces share a pose at their join, which is how the model enforces
 * tangency (US-5): there is no kink because there is only one heading.
 */
export interface Pose {
  readonly position: Point;
  /** Direction of travel, in radians counter-clockwise from +x. */
  readonly heading: number;
}

/** An axis-aligned bounding box, in millimeters. */
export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Left bends counter-clockwise, right bends clockwise, about the travel direction. */
export type Handedness = 'left' | 'right';

/**
 * The shape of a circular arc: a radius and the (unsigned) angle it sweeps. This
 * is shape only — no position, orientation, or direction. A full circle is an
 * arc that sweeps 2π.
 */
export interface Arc {
  /** Radius of the arc, in millimeters. */
  readonly radius: number;
  /** Angle the arc subtends, in radians; always positive. */
  readonly sweep: number;
}

/**
 * A straight segment placed in the plane: anchored at a start pose and running
 * `length` along its heading.
 */
export interface PlacedSegment {
  readonly kind: 'segment';
  readonly start: Pose;
  readonly length: number;
}

/**
 * An arc placed in the plane: anchored at a start pose (its entry point and
 * tangent), with a signed `sweep` — counter-clockwise (left) is positive,
 * clockwise (right) negative. The center is intentionally not stored; the
 * endpoints follow from the start pose by closed form (see {@link arcEnd}).
 */
export interface PlacedArc {
  readonly kind: 'arc';
  readonly start: Pose;
  readonly radius: number;
  readonly sweep: number;
}

const TWO_PI = Math.PI * 2;
const QUARTER_TURN = Math.PI / 2;

/** Builds an {@link Arc}, rejecting non-positive dimensions. */
export function arc(radius: number, sweep: number): Arc {
  return {
    radius: requirePositive(radius, 'radius'),
    sweep: requirePositive(sweep, 'sweep'),
  };
}

/** The running length of an arc: radius × sweep. */
export function arcLength(shape: Arc): number {
  return (
    requirePositive(shape.radius, 'radius') *
    requirePositive(shape.sweep, 'sweep')
  );
}

/** Converts degrees to radians. */
export function degToRad(degrees: number): number {
  return (requireFinite(degrees, 'degrees') * Math.PI) / 180;
}

/** Converts radians to degrees. */
export function radToDeg(radians: number): number {
  return (requireFinite(radians, 'radians') * 180) / Math.PI;
}

/** Normalizes an angle in radians to the half-open range [0, 2π). */
export function normalizeAngle(radians: number): number {
  const remainder = requireFinite(radians, 'radians') % TWO_PI;
  return remainder < 0 ? remainder + TWO_PI : remainder;
}

/** The point reached by travelling `distance` from `origin` in direction `heading`. */
export function advance(
  origin: Point,
  heading: number,
  distance: number
): Point {
  return {
    x: origin.x + Math.cos(heading) * distance,
    y: origin.y + Math.sin(heading) * distance,
  };
}

/** Where a placed segment ends. */
export function segmentEnd(segment: PlacedSegment): Point {
  return advance(segment.start.position, segment.start.heading, segment.length);
}

/** The exit pose of a placed segment: its end point, heading unchanged. */
export function segmentEndPose(segment: PlacedSegment): Pose {
  return {position: segmentEnd(segment), heading: segment.start.heading};
}

/** The bounding box of a placed segment. */
export function segmentBounds(segment: PlacedSegment): Bounds {
  return boundsOfPoints([segment.start.position, segmentEnd(segment)]);
}

/** Where a placed arc begins. */
export function arcStart(placed: PlacedArc): Point {
  return placed.start.position;
}

/** Where a placed arc ends. */
export function arcEnd(placed: PlacedArc): Point {
  return arcPoint(placed, placed.sweep);
}

/** The point halfway along a placed arc. */
export function arcMidpoint(placed: PlacedArc): Point {
  return arcPoint(placed, placed.sweep / 2);
}

/** The exit pose of a placed arc: its end point, heading rotated by the sweep. */
export function arcEndPose(placed: PlacedArc): Pose {
  return {
    position: arcEnd(placed),
    heading: placed.start.heading + placed.sweep,
  };
}

/**
 * A point on the placed arc, `swept` radians of (signed) sweep from the start.
 * Closed form in the start pose, with no center: rotating the start tangent by
 * `swept` and integrating gives this directly.
 */
function arcPoint(placed: PlacedArc, swept: number): Point {
  const side = placed.sweep >= 0 ? 1 : -1;
  const h = placed.start.heading;
  const {x, y} = placed.start.position;
  return {
    x: x + side * placed.radius * (Math.sin(h + swept) - Math.sin(h)),
    y: y + side * placed.radius * (Math.cos(h) - Math.cos(h + swept)),
  };
}

/**
 * The bounding box of a placed arc. The extreme x and y lie at the endpoints and
 * at whichever compass directions the arc sweeps through, which are the center
 * offset by a radius — so this is the one place the center is derived.
 */
export function arcBounds(placed: PlacedArc): Bounds {
  const side = placed.sweep >= 0 ? 1 : -1;
  const center = advance(
    placed.start.position,
    placed.start.heading + side * QUARTER_TURN,
    placed.radius
  );
  const startAngle = placed.start.heading - side * QUARTER_TURN;
  const points: Point[] = [arcStart(placed), arcEnd(placed)];
  for (let q = 0; q < 4; q++) {
    const angle = q * QUARTER_TURN;
    if (arcCoversAngle(startAngle, placed.sweep, angle)) {
      points.push(advance(center, angle, placed.radius));
    }
  }
  return boundsOfPoints(points);
}

/**
 * Whether the arc that starts at `startAngle` and sweeps by the signed `sweep`
 * passes through the direction `angle` (compared modulo a full turn).
 */
function arcCoversAngle(
  startAngle: number,
  sweep: number,
  angle: number
): boolean {
  if (sweep >= 0) {
    return normalizeAngle(angle - startAngle) <= sweep;
  }
  return normalizeAngle(startAngle - angle) <= -sweep;
}

/**
 * The smallest axis-aligned box containing every point. Throws on an empty
 * list, since an empty box has no meaningful extent.
 */
export function boundsOfPoints(points: readonly Point[]): Bounds {
  if (points.length === 0) {
    throw new RangeError('boundsOfPoints requires at least one point');
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const {x, y} of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {minX, minY, maxX, maxY};
}

/** The smallest box containing both inputs. */
export function unionBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/**
 * Whether two poses coincide within the given tolerances — used to decide
 * whether a chain of pieces closes back on its anchor, and (soon) whether two
 * open ends snap together. Headings are compared modulo a full turn.
 */
export function posesCoincide(
  a: Pose,
  b: Pose,
  positionTolerance: number,
  headingTolerance: number
): boolean {
  const dx = a.position.x - b.position.x;
  const dy = a.position.y - b.position.y;
  if (Math.hypot(dx, dy) > positionTolerance) {
    return false;
  }
  const headingDelta = normalizeAngle(a.heading - b.heading);
  const gap = Math.min(headingDelta, TWO_PI - headingDelta);
  return gap <= headingTolerance;
}
