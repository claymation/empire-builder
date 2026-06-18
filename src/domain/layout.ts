/**
 * Placing track in the plane (US-3, US-4, US-5).
 *
 * The atomic operation is {@link placePiece}: given an entry pose and a piece,
 * it locates that piece, and {@link exitPoses} reports where a train leaves it.
 * Connected pieces share a pose at their join, so tangency (US-5) holds by
 * construction — there is no way to express a kink.
 *
 * For now a layout is a single route: an ordered run of pieces, each placed at
 * the previous one's exit ({@link placeRoute}). A straight or curve has exactly
 * one exit; a turnout will have two. `exitPoses` already returns a list so that
 * turnouts (US-6) slot in behind a future graph traversal without reshaping the
 * placement primitive — only this linear driver is provisional.
 */

import {
  arc,
  arcBounds,
  arcEndPose,
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
import {CurvedTrack, StraightTrack} from './track';
import {assertNever, requirePositive} from './validate';

/**
 * A piece as authored into a route: which track, and — for a curve — which way
 * it is laid. `kind` is the top-level discriminant (it mirrors the track's kind)
 * so a placed piece narrows by a plain switch without reaching through `track`,
 * which TypeScript will not narrow on its own.
 */
export type RoutePiece =
  | {readonly kind: 'straight'; readonly track: StraightTrack}
  | {
      readonly kind: 'curved';
      readonly track: CurvedTrack;
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
  return {
    kind: 'straight',
    track: {kind: 'straight', length: requirePositive(length, 'length')},
  };
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
  return {
    kind: 'curved',
    track: {kind: 'curved', arc: arc(radius, degToRad(sweepDegrees))},
    handedness,
  };
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
      return {
        kind: 'segment',
        start: placed.entry,
        length: placed.track.length,
      };
    case 'curved': {
      const sweep =
        (placed.handedness === 'left' ? 1 : -1) * placed.track.arc.sweep;
      return {
        kind: 'arc',
        start: placed.entry,
        radius: placed.track.arc.radius,
        sweep,
      };
    }
    default:
      return assertNever(placed);
  }
}

/**
 * Where a train can leave the piece. A straight or curve has one exit; a turnout
 * will have more, which is why this returns a list.
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
    // A single route follows the one through-exit; a turnout's extra exits are
    // for a future graph traversal, not this fold.
    pose = exits[0];
  }
  return {pieces: placedPieces, exit: pose};
}
