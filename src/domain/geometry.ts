/**
 * Plane geometry primitives. The domain uses standard math conventions: +x
 * points right, +y points up, and angles are measured in radians
 * counter-clockwise from the +x axis. The rendering edge is responsible for
 * mapping this onto a y-down canvas.
 */

import {requireFinite, requirePositive} from './validate';

const TWO_PI = Math.PI * 2;
const QUARTER_TURN = Math.PI / 2;
/** Floating-point comparison tolerance: values closer than this count as equal. */
export const EPSILON = 1e-9;

// ── Points ──

/** A point in the plane. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The Euclidean distance between two points. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ── Vectors ──

/**
 * A displacement in the plane: the components (x, y) of an offset, free of any
 * anchor point — the same shape as a {@link Point}, with the distinct name
 * marking intent (an offset, not a position). A direction is usually carried as
 * a heading angle (see {@link Pose}); a unit `Vector` from {@link unitVector} is
 * the components form of one.
 */
export type Vector = Point;

/** The dot product of two vectors. */
export function dot(a: Vector, b: Vector): number {
  return a.x * b.x + a.y * b.y;
}

/**
 * The 2D cross product `a.x·b.y − a.y·b.x`: the signed area of the parallelogram
 * the two vectors span, zero exactly when they are parallel.
 */
export function cross(a: Vector, b: Vector): number {
  return a.x * b.y - a.y * b.x;
}

/** The component-wise sum — a point translated by a vector, or two vectors added. */
export function add(a: Point, b: Vector): Point {
  return {x: a.x + b.x, y: a.y + b.y};
}

/** The vector from `b` to `a` (their component-wise difference). */
export function subtract(a: Point, b: Point): Vector {
  return {x: a.x - b.x, y: a.y - b.y};
}

/** `v` scaled by `factor`. */
export function scale(v: Vector, factor: number): Vector {
  return {x: v.x * factor, y: v.y * factor};
}

/** The unit vector pointing along `heading` (radians, counter-clockwise from +x). */
export function unitVector(heading: number): Vector {
  return {x: Math.cos(heading), y: Math.sin(heading)};
}

/** `v` rescaled to unit length, or the zero vector when `v` is degenerate. */
export function normalize(v: Vector): Vector {
  const length = Math.hypot(v.x, v.y);
  return length < EPSILON ? {x: 0, y: 0} : scale(v, 1 / length);
}

/** The point reached by travelling `distance` from `origin` along `heading`. */
export function advance(
  origin: Point,
  heading: number,
  distance: number
): Point {
  return add(origin, scale(unitVector(heading), distance));
}

// ── Angles ──

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

// ── Poses ──

/** A position together with the direction of travel through it. */
export interface Pose {
  readonly position: Point;
  /** Direction of travel, in radians counter-clockwise from +x. */
  readonly heading: number;
}

/**
 * Whether two poses are equal within the given tolerances (EPSILON by default):
 * the same position, and the same heading compared modulo a full turn (so two
 * poses facing the same way match, two facing opposite ways do not).
 */
export function posesEqual(
  a: Pose,
  b: Pose,
  positionTolerance = EPSILON,
  headingTolerance = EPSILON
): boolean {
  if (distance(a.position, b.position) > positionTolerance) {
    return false;
  }
  const headingDelta = normalizeAngle(a.heading - b.heading);
  const gap = Math.min(headingDelta, TWO_PI - headingDelta);
  return gap <= headingTolerance;
}

/** The same position facing the opposite way: heading turned a half-turn. */
export function reversePose(pose: Pose): Pose {
  return {position: pose.position, heading: pose.heading + Math.PI};
}

/**
 * Whether two poses align within the given tolerances (EPSILON by default): the
 * same position, with headings parallel — pointing the same way or exactly
 * opposite. Two section ends meeting at a join align when they sit at one place
 * on one line, whichever way each was reached by threading.
 */
export function posesAlign(
  a: Pose,
  b: Pose,
  positionTolerance = EPSILON,
  headingTolerance = EPSILON
): boolean {
  return (
    posesEqual(a, b, positionTolerance, headingTolerance) ||
    posesEqual(a, reversePose(b), positionTolerance, headingTolerance)
  );
}

/**
 * Composes two poses as rigid plane motions. A {@link Pose} doubles as a rigid
 * motion — rotate the plane by its heading, then translate it to its position;
 * distances and orientation are preserved (the group of such motions is SE(2)).
 * `composePose(outer, inner)` is the single motion that applies `inner`, then
 * `outer`: it rotates `inner`'s position by `outer`'s heading, translates by
 * `outer`'s position, and adds the headings.
 */
export function composePose(outer: Pose, inner: Pose): Pose {
  return {
    position: add(outer.position, rotateVector(inner.position, outer.heading)),
    heading: outer.heading + inner.heading,
  };
}

/**
 * The rigid motion that undoes `pose`: its inverse in SE(2). {@link
 * composePose}`(inversePose(p), p)` and `composePose(p, inversePose(p))` are both
 * the identity pose — the origin, heading 0.
 */
export function inversePose(pose: Pose): Pose {
  const heading = -pose.heading;
  return {
    position: rotateVector(scale(pose.position, -1), heading),
    heading,
  };
}

/** `v` rotated counter-clockwise by `angle` radians about the origin. */
function rotateVector(v: Vector, angle: number): Vector {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos};
}

/**
 * A pose's two characteristic lines: the tangent line along its heading and the
 * normal line square to it, both through its position.
 */
export function tangentAndNormalLines(pose: Pose): [Line, Line] {
  return [
    {origin: pose.position, direction: unitVector(pose.heading)},
    {origin: pose.position, direction: unitVector(pose.heading + QUARTER_TURN)},
  ];
}

// ── Lines ──

/**
 * An infinite, undirected line through `origin` along `direction`. `direction`
 * need not be a unit vector, and its sign carries no meaning — both signs give
 * the same line; operations along or across it normalize as needed.
 */
export interface Line {
  readonly origin: Point;
  readonly direction: Vector;
}

/**
 * The point where two infinite lines cross, or null when they are parallel
 * (including coincident).
 */
export function lineIntersection(a: Line, b: Line): Point | null {
  // Solve `a.origin + t·a.direction = b.origin + s·b.direction` for the
  // crossing. The cross product of the directions is the linear system's
  // determinant — zero exactly when the lines are parallel — and Cramer's rule
  // gives t = ((b.origin − a.origin) × b.direction) / (a.direction × b.direction).
  const determinant = cross(a.direction, b.direction);
  if (Math.abs(determinant) < EPSILON) {
    return null;
  }
  const t = cross(subtract(b.origin, a.origin), b.direction) / determinant;
  return add(a.origin, scale(a.direction, t));
}

/**
 * The orthogonal projection of `point` onto `line`: the closest point on it,
 * where the perpendicular dropped from `point` meets it. A degenerate
 * (zero-length) direction has no line, so its origin is the best answer.
 */
export function projectOntoLine(point: Point, line: Line): Point {
  const {origin, direction} = line;
  const lengthSquared = dot(direction, direction);
  if (lengthSquared < EPSILON) {
    return origin;
  }
  // The foot is `origin` plus the component of `point − origin` along the line.
  const along = dot(subtract(point, origin), direction) / lengthSquared;
  return add(origin, scale(direction, along));
}

/** Whether `point` lies on `line` (to within floating-point slack). */
export function onLine(point: Point, line: Line): boolean {
  return distance(point, projectOntoLine(point, line)) < EPSILON;
}

/**
 * Whether `pose` is colinear with `line`: its position lies on the line and its
 * heading runs along it (either direction).
 */
export function colinear(pose: Pose, line: Line): boolean {
  return (
    onLine(pose.position, line) &&
    Math.abs(cross(unitVector(pose.heading), line.direction)) < EPSILON
  );
}

/**
 * The nearest of `lines` within `tolerance` of `point`, carrying the point's
 * projection onto it ({@link projectOntoLine}); null when none is in range.
 */
export function nearestLineTo(
  point: Point,
  lines: readonly Line[],
  tolerance: number
): {point: Point; line: Line} | null {
  let nearest: {point: Point; line: Line; gap: number} | null = null;
  for (const line of lines) {
    const foot = projectOntoLine(point, line);
    const gap = distance(point, foot);
    if (gap <= tolerance && (!nearest || gap < nearest.gap)) {
      nearest = {point: foot, line, gap};
    }
  }
  return nearest ? {point: nearest.point, line: nearest.line} : null;
}

// ── Bounds ──

/** An axis-aligned bounding box. */
export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
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

// ── Placed segments ──

/**
 * A straight segment placed in the plane: anchored at a start pose and running
 * `length` along its heading.
 */
export interface PlacedSegment {
  readonly kind: 'segment';
  readonly start: Pose;
  readonly length: number;
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

// ── Arcs ──

/** The shape of a circular arc: a radius and the (unsigned) angle it sweeps. */
export interface Arc {
  /** Radius of the arc. */
  readonly radius: number;
  /** Angle the arc subtends, in radians; always positive. */
  readonly sweep: number;
}

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

/**
 * The start→end offset of a unit-radius arc with the given entry `heading` and
 * signed sweep (counter-clockwise positive). A placed arc's end is its start
 * plus `radius` times this vector, so a caller can solve for the radius that
 * lands the end on a target line.
 */
export function unitArcChord(heading: number, signedSweep: number): Vector {
  const side = bendSign(signedSweep);
  return {
    x: side * (Math.sin(heading + signedSweep) - Math.sin(heading)),
    y: side * (Math.cos(heading) - Math.cos(heading + signedSweep)),
  };
}

/**
 * An arc placed in the plane: anchored at a start pose (its entry point and
 * tangent), with a signed `sweep` — counter-clockwise positive, clockwise
 * negative.
 */
export interface PlacedArc {
  readonly kind: 'arc';
  readonly start: Pose;
  readonly radius: number;
  readonly sweep: number;
}

/** The point halfway along a placed arc. */
export function arcMidpoint(arc: PlacedArc): Point {
  return arcPoint(arc, arc.sweep / 2);
}

/** Where a placed arc ends. */
export function arcEndPoint(arc: PlacedArc): Point {
  return arcPoint(arc, arc.sweep);
}

/** The exit pose of a placed arc: its end point, heading rotated by the sweep. */
export function arcEndPose(arc: PlacedArc): Pose {
  return {
    position: arcEndPoint(arc),
    heading: arc.start.heading + arc.sweep,
  };
}

/**
 * The center of a placed arc's circle — one radius off the start, square to the
 * direction of travel, on the side the arc bends toward.
 */
export function arcCenter(arc: PlacedArc): Point {
  return advance(
    arc.start.position,
    arc.start.heading + bendSign(arc.sweep) * QUARTER_TURN,
    arc.radius
  );
}

/**
 * The bounding box of a placed arc. The extreme x and y lie at the endpoints and
 * at whichever compass directions the arc sweeps through, which are the center
 * offset by a radius.
 */
export function arcBounds(arc: PlacedArc): Bounds {
  const center = arcCenter(arc);
  const startAngle = arc.start.heading - bendSign(arc.sweep) * QUARTER_TURN;
  const points: Point[] = [arc.start.position, arcEndPoint(arc)];
  for (let q = 0; q < 4; q++) {
    const angle = q * QUARTER_TURN;
    if (arcCoversAngle(startAngle, arc.sweep, angle)) {
      points.push(advance(center, angle, arc.radius));
    }
  }
  return boundsOfPoints(points);
}

// +1 for a counter-clockwise sweep, -1 for a clockwise one.
function bendSign(sweep: number): number {
  return sweep >= 0 ? 1 : -1;
}

/**
 * A point `swept` (signed) radians along the placed arc from its start: the
 * start position plus `radius` along the unit-arc chord for that partial sweep.
 */
function arcPoint(arc: PlacedArc, swept: number): Point {
  return add(
    arc.start.position,
    scale(unitArcChord(arc.start.heading, swept), arc.radius)
  );
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
