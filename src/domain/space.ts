/**
 * The available space for the empire (US-1). For v1 this is a single
 * rectangular sheet of benchwork with its lower-left corner at the origin and
 * its far corner at (width, height), measured in millimetres.
 *
 * Keep-out zones (a fireplace, a doorway, a support column) are coming — the
 * shape of this module anticipates them — but the bare sheet is all an oval on a
 * 4'x8' sheet of plywood needs, so that is all this slice builds.
 */

import {Bounds} from './geometry';
import {requirePositive} from './validate';

/** The width and height of a rectangular region, in millimetres. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/** A rectangular sheet of benchwork, anchored with its lower-left at the origin. */
export interface Space {
  readonly size: Size;
}

/**
 * Builds a {@link Space} from its dimensions in millimetres.
 *
 * @throws RangeError if either dimension is not a positive, finite number.
 */
export function makeSpace(width: number, height: number): Space {
  return {
    size: {
      width: requirePositive(width, 'width'),
      height: requirePositive(height, 'height'),
    },
  };
}

/**
 * Whether `bounds` fits entirely within the sheet. `tolerance` (in millimetres)
 * allows a hair of overhang to count as fitting, absorbing floating-point dust;
 * pass 0 for a strict check.
 */
export function spaceContains(
  space: Space,
  bounds: Bounds,
  tolerance = 0
): boolean {
  const {width, height} = space.size;
  return (
    bounds.minX >= -tolerance &&
    bounds.minY >= -tolerance &&
    bounds.maxX <= width + tolerance &&
    bounds.maxY <= height + tolerance
  );
}
