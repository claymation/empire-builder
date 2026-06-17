/**
 * Domain model for track pieces. Pure geometry only — no Paper.js and no DOM —
 * so this logic stays unit-testable in isolation.
 *
 * A piece is its intrinsic shape and nothing about where or how it is laid. In
 * particular a curve has no handedness: a symmetric piece of sectional track can
 * be installed bending either way, so which way it bends is a property of the
 * placement (see ./layout), not of the piece.
 */

import {Arc} from './geometry';
import {assertNever, requirePositive} from './validate';

/** Which way a curve bends, relative to the direction of travel through it. */
export type Handedness = 'left' | 'right';

/** A straight piece of track of a fixed length. */
export interface StraightTrack {
  readonly kind: 'straight';
  /** Length of the piece, in millimetres. */
  readonly length: number;
}

/** A curved piece of track, shaped by its arc. */
export interface CurvedTrack {
  readonly kind: 'curved';
  readonly arc: Arc;
}

/** Any single piece of track. */
export type Track = StraightTrack | CurvedTrack;

/**
 * Returns the running length of a track piece in millimetres — the distance a
 * train travels across it. For curves this is the arc length (radius × sweep),
 * not the chord.
 *
 * @throws RangeError if any dimension is not a positive, finite number.
 */
export function trackLength(track: Track): number {
  switch (track.kind) {
    case 'straight':
      return requirePositive(track.length, 'length');
    case 'curved': {
      const radius = requirePositive(track.arc.radius, 'radius');
      const sweep = requirePositive(track.arc.sweep, 'sweep');
      return radius * sweep;
    }
    default:
      return assertNever(track);
  }
}
