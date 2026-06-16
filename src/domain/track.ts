/**
 * Domain model for track pieces. Pure geometry only — no Paper.js and no DOM —
 * so this logic stays unit-testable in isolation.
 */

/** A straight piece of track of a fixed length. */
export interface StraightTrack {
  readonly kind: 'straight';
  /** Length of the piece, in millimetres. */
  readonly length: number;
}

/** A curved piece of track defined by its radius and the arc it subtends. */
export interface CurvedTrack {
  readonly kind: 'curved';
  /** Radius of the curve, in millimetres. */
  readonly radius: number;
  /** Arc angle the piece sweeps through, in degrees. */
  readonly sweepDegrees: number;
}

/** Any single piece of track. */
export type Track = StraightTrack | CurvedTrack;

/**
 * Returns the running length of a track piece in millimetres — the distance a
 * train travels across it. For curves this is the arc length, not the chord.
 *
 * @throws RangeError if any dimension is not a positive, finite number.
 */
export function trackLength(track: Track): number {
  switch (track.kind) {
    case 'straight':
      return requirePositive(track.length, 'length');
    case 'curved': {
      const radius = requirePositive(track.radius, 'radius');
      const sweep = requirePositive(track.sweepDegrees, 'sweepDegrees');
      return (radius * sweep * Math.PI) / 180;
    }
    default:
      return assertNever(track);
  }
}

function requirePositive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive, finite number`);
  }
  return value;
}

/** Compile-time exhaustiveness guard for discriminated unions. */
function assertNever(value: never): never {
  throw new Error(`Unhandled track kind: ${JSON.stringify(value)}`);
}
