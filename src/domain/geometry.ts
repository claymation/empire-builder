/**
 * Plane geometry primitives for the layout, in millimetres. The domain uses
 * standard math conventions: +x points right, +y points up, and angles are
 * measured in radians counter-clockwise from the +x axis. The rendering edge is
 * responsible for mapping this onto a y-down canvas.
 */

import {requireFinite, requirePositive} from './validate';

/** A point in the layout plane, in millimetres. */
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

/** An axis-aligned bounding box, in millimetres. */
export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * The shape of a circular arc: a radius and the (unsigned) angle it sweeps. This
 * is shape only — it has no position, orientation, or direction. A full circle
 * is an arc that sweeps 2π.
 */
export interface Arc {
  /** Radius of the arc, in millimetres. */
  readonly radius: number;
  /** Angle the arc subtends, in radians; always positive. */
  readonly sweep: number;
}

/**
 * An arc placed in the plane: the center of its circle and the angular range it
 * occupies. The signed difference `endAngle - startAngle` gives both the swept
 * magnitude and its direction (counter-clockwise when positive).
 */
export interface PlacedArc {
  readonly center: Point;
  readonly radius: number;
  readonly startAngle: number;
  readonly endAngle: number;
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

/**
 * The point reached by travelling `distance` from `origin` in direction
 * `heading`. This is the one polar-offset primitive: a point on a circle of
 * radius r at angle θ about a center c is simply `advance(c, θ, r)`.
 */
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

/** The point where the placed arc begins. */
export function arcStart(placed: PlacedArc): Point {
  return advance(placed.center, placed.startAngle, placed.radius);
}

/** The point where the placed arc ends. */
export function arcEnd(placed: PlacedArc): Point {
  return advance(placed.center, placed.endAngle, placed.radius);
}

/** The point halfway along the placed arc. */
export function arcMidpoint(placed: PlacedArc): Point {
  const midAngle = (placed.startAngle + placed.endAngle) / 2;
  return advance(placed.center, midAngle, placed.radius);
}

/**
 * The bounding box of a placed arc. The extreme x and y of a circular arc occur
 * at its endpoints and at whichever of the four compass directions (angles 0,
 * ½π, π, 1½π) the arc actually passes through, so we include only those.
 */
export function arcBounds(placed: PlacedArc): Bounds {
  const sweep = placed.endAngle - placed.startAngle; // signed
  const points: Point[] = [arcStart(placed), arcEnd(placed)];
  for (let q = 0; q < 4; q++) {
    const angle = q * QUARTER_TURN;
    if (arcCoversAngle(placed.startAngle, sweep, angle)) {
      points.push(advance(placed.center, angle, placed.radius));
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
 * whether a chain of pieces closes back on its anchor to form a loop. Headings
 * are compared modulo a full turn.
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
