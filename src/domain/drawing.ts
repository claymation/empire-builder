/**
 * Interactive authoring geometry (US-3, US-4): turning a pointer position into
 * the next track piece. This is the math behind the "lay track" tool's
 * tangent-follow preview, kept pure so it can be unit tested apart from any
 * pointer or canvas handling.
 */

import {normalizeAngle, Point, Pose, radToDeg} from './geometry';
import {curveLeft, curveRight, RoutePiece, straight} from './layout';

// Distances (mm) and dot products (mm²) below this are treated as zero.
const EPSILON = 1e-9;

/**
 * The piece that continues tangentially from `from` and ends at `target`: a
 * straight when `target` lies straight ahead, otherwise the unique arc that
 * leaves `from` along its heading and curves around to reach `target`.
 *
 * @throws RangeError if `target` is the start point, or lies straight behind it
 *   (no tangent continuation reaches it).
 */
export function tangentPieceTo(from: Pose, target: Point): RoutePiece {
  const heading = from.heading;
  const forward = {x: Math.cos(heading), y: Math.sin(heading)};
  const left = {x: -Math.sin(heading), y: Math.cos(heading)};

  const toTarget = {
    x: target.x - from.position.x,
    y: target.y - from.position.y,
  };
  const distanceSquared = toTarget.x * toTarget.x + toTarget.y * toTarget.y;
  if (distanceSquared < EPSILON) {
    throw new RangeError('target coincides with the start');
  }

  const ahead = forward.x * toTarget.x + forward.y * toTarget.y;
  const sideways = left.x * toTarget.x + left.y * toTarget.y;

  // On the heading line there is no curvature: the piece is a straight, and a
  // straight only reaches a point ahead.
  if (Math.abs(sideways) < EPSILON) {
    if (ahead <= 0) {
      throw new RangeError('cannot reach a point directly behind the start');
    }
    return straight(ahead);
  }

  // The center lies on the normal at `from`, equidistant from start and target.
  // Solving |center - target| = |center - start| gives this signed offset along
  // the left normal; its sign is which way the track bends.
  const offset = distanceSquared / (2 * sideways);
  const radius = Math.abs(offset);
  const center = {
    x: from.position.x + offset * left.x,
    y: from.position.y + offset * left.y,
  };

  const startAngle = Math.atan2(
    from.position.y - center.y,
    from.position.x - center.x
  );
  const endAngle = Math.atan2(target.y - center.y, target.x - center.x);

  // A center to the left bends the track left (counter-clockwise); the swept
  // angle is measured in that direction.
  if (offset > 0) {
    return curveLeft(radius, radToDeg(normalizeAngle(endAngle - startAngle)));
  }
  return curveRight(radius, radToDeg(normalizeAngle(startAngle - endAngle)));
}
