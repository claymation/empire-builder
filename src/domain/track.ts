/**
 * Domain model for track pieces. Pure geometry only — no Paper.js and no DOM —
 * so this logic stays unit-testable in isolation.
 *
 * A piece is its intrinsic shape and nothing about where or how it is laid.
 */

import {Arc, arcLength} from './geometry';
import {assertNever, requirePositive} from './validate';

/** A straight piece of track of a fixed length. */
export interface StraightTrack {
  readonly kind: 'straight';
  /** Length of the piece, in millimeters. */
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
 * Returns the running length of a track piece in millimeters — the distance a
 * train travels across it. For curves this is the arc length, not the chord.
 *
 * @throws RangeError if any dimension is not a positive, finite number.
 */
export function trackLength(track: Track): number {
  switch (track.kind) {
    case 'straight':
      return requirePositive(track.length, 'length');
    case 'curved':
      return arcLength(track.arc);
    default:
      return assertNever(track);
  }
}
