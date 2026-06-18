/**
 * The mapping between domain coordinates (millimeters, +y up) and canvas
 * coordinates (pixels, +y down). Pure math, no Paper.js, so it can be unit
 * tested; the scene module wraps the results in Paper.js points.
 *
 * The inverse (`toDomain`) is what pointer-driven editing will need to turn a
 * click into a position on the layout.
 */

import {Point} from '../domain/geometry';
import {Space} from '../domain/space';

/** A two-way mapping between domain and canvas points. */
export interface ViewTransform {
  readonly toCanvas: (point: Point) => Point;
  readonly toDomain: (point: Point) => Point;
}

/**
 * Builds a transform that fits `space` within a `viewWidth` × `viewHeight`
 * canvas, centered, leaving `padding` pixels around it, and flips the y axis.
 */
export function fitTransform(
  space: Space,
  viewWidth: number,
  viewHeight: number,
  padding: number
): ViewTransform {
  const scale = Math.min(
    (viewWidth - 2 * padding) / space.width,
    (viewHeight - 2 * padding) / space.height
  );
  const offsetX = (viewWidth - space.width * scale) / 2;
  const offsetY = (viewHeight - space.height * scale) / 2;
  return {
    toCanvas: point => ({
      x: offsetX + point.x * scale,
      // Flip: domain y grows upward, canvas y grows downward.
      y: offsetY + (space.height - point.y) * scale,
    }),
    toDomain: point => ({
      x: (point.x - offsetX) / scale,
      y: space.height - (point.y - offsetY) / scale,
    }),
  };
}
