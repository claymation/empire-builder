/**
 * Placing track in the plane (US-3, US-4, US-5).
 *
 * The atomic operation is {@link placePiece}: it locates a piece at an entry
 * pose, and {@link exitPoses} reports the poses at which a train can leave it.
 * Because connected pieces share a pose at their join, tangency (US-5) holds by
 * construction — there is no way to express a kink.
 *
 * {@link placeRoute} follows a single path, threading each piece's exit into the
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
  Handedness,
  PlacedArc,
  PlacedSegment,
  Pose,
  segmentBounds,
  segmentEndPose,
  unionBounds,
} from './geometry';
import {assertNever, requirePositive} from './validate';

/**
 * A piece as authored into a route: a straight of a given length, or a curve of
 * a given arc, laid to bend left or right. A curve piece is symmetric — its
 * handedness is chosen when laying it, so it lives here rather than on the arc.
 */
export type RoutePiece =
  | {readonly kind: 'straight'; readonly length: number}
  | {
      readonly kind: 'curved';
      readonly arc: Arc;
      readonly handedness: Handedness;
    };

/** A route piece located in the plane: it gains an entry pose, and nothing else. */
export type PlacedPiece = RoutePiece & {readonly entry: Pose};

/** The placed geometry of a piece: a segment for straights, an arc for curves. */
export type PieceGeometry = PlacedSegment | PlacedArc;

/** The result of placing a whole route: the placed pieces and where they end. */
export interface PlacedRoute {
  readonly pieces: readonly PlacedPiece[];
  /** The pose a train would have on leaving the final piece. */
  readonly exit: Pose;
}

/** Builds a straight route piece of the given length. */
export function straight(length: number): RoutePiece {
  return {kind: 'straight', length: requirePositive(length, 'length')};
}

/** Builds a curve of the given radius (mm) bending left through `sweepDegrees`. */
export function curveLeft(radius: number, sweepDegrees: number): RoutePiece {
  return curve(radius, sweepDegrees, 'left');
}

/** Builds a curve of the given radius (mm) bending right through `sweepDegrees`. */
export function curveRight(radius: number, sweepDegrees: number): RoutePiece {
  return curve(radius, sweepDegrees, 'right');
}

function curve(
  radius: number,
  sweepDegrees: number,
  handedness: Handedness
): RoutePiece {
  return {kind: 'curved', arc: arc(radius, degToRad(sweepDegrees)), handedness};
}

/** The running length of a piece — the distance a train travels across it. */
export function pieceLength(piece: RoutePiece): number {
  switch (piece.kind) {
    case 'straight':
      return requirePositive(piece.length, 'length');
    case 'curved':
      return arcLength(piece.arc);
    default:
      return assertNever(piece);
  }
}

/**
 * Locates a piece at `entry`. A PlacedPiece stays a plain, serializable value,
 * so its geometry is computed from it by {@link pieceGeometry} rather than
 * stored — nothing to keep in sync as pieces move.
 */
export function placePiece(entry: Pose, piece: RoutePiece): PlacedPiece {
  return {...piece, entry};
}

/**
 * The placed geometry of a piece, derived from its entry pose. A curve's
 * handedness becomes the sign of the arc's sweep — left counter-clockwise,
 * right clockwise.
 */
export function pieceGeometry(placed: PlacedPiece): PieceGeometry {
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
 * The poses at which a train can leave the piece. The result is a list because a
 * piece may have more than one exit; a straight or curve has exactly one.
 */
export function exitPoses(placed: PlacedPiece): Pose[] {
  const geometry = pieceGeometry(placed);
  switch (geometry.kind) {
    case 'segment':
      return [segmentEndPose(geometry)];
    case 'arc':
      return [arcEndPose(geometry)];
    default:
      return assertNever(geometry);
  }
}

/** The bounding box of a placed piece. Arcs account for their bulge. */
export function pieceBounds(placed: PlacedPiece): Bounds {
  const geometry = pieceGeometry(placed);
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
 * The bounding box covering every placed piece. Throws on an empty route, which
 * has no extent to bound.
 */
export function routeBounds(pieces: readonly PlacedPiece[]): Bounds {
  if (pieces.length === 0) {
    throw new RangeError('routeBounds requires at least one piece');
  }
  return pieces.map(pieceBounds).reduce(unionBounds);
}

/**
 * Places an ordered run of pieces starting from `anchor`, threading each piece's
 * exit into the next.
 */
export function placeRoute(
  anchor: Pose,
  route: readonly RoutePiece[]
): PlacedRoute {
  const placedPieces: PlacedPiece[] = [];
  let pose = anchor;
  for (const piece of route) {
    const placed = placePiece(pose, piece);
    placedPieces.push(placed);
    const exits = exitPoses(placed);
    // Follow the through route: a piece's first exit continues the path.
    pose = exits[0];
  }
  return {pieces: placedPieces, exit: pose};
}
