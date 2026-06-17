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
  advance,
  arc,
  arcBounds,
  arcEnd,
  Bounds,
  boundsOfPoints,
  degToRad,
  PlacedArc,
  Point,
  Pose,
  unionBounds,
} from './geometry';
import {CurvedTrack, Handedness, StraightTrack} from './track';
import {requirePositive} from './validate';

const QUARTER_TURN = Math.PI / 2;

/**
 * A piece as authored into a route: which track, and — for a curve — which way
 * it is laid. Handedness lives here, on the placement, not on the piece.
 */
export type RoutePiece =
  | {readonly track: StraightTrack}
  | {readonly track: CurvedTrack; readonly handedness: Handedness};

/** A route piece located in the plane: it gains an entry pose, and nothing else. */
export type PlacedPiece = RoutePiece & {readonly entry: Pose};

/** The placed geometry of a piece: a segment for straights, an arc for curves. */
export type PieceGeometry =
  | {readonly kind: 'straight'; readonly start: Point; readonly end: Point}
  | {readonly kind: 'curved'; readonly arc: PlacedArc};

/** The result of placing a whole route: the placed pieces and where they end. */
export interface PlacedRoute {
  readonly pieces: readonly PlacedPiece[];
  /** The pose a train would have on leaving the final piece. */
  readonly exit: Pose;
}

/** A straight route piece of the given length. */
export function straight(length: number): RoutePiece {
  return {track: {kind: 'straight', length: requirePositive(length, 'length')}};
}

/** A curve of the given radius (mm) bending left through `sweepDegrees`. */
export function curveLeft(radius: number, sweepDegrees: number): RoutePiece {
  return curve(radius, sweepDegrees, 'left');
}

/** A curve of the given radius (mm) bending right through `sweepDegrees`. */
export function curveRight(radius: number, sweepDegrees: number): RoutePiece {
  return curve(radius, sweepDegrees, 'right');
}

function curve(
  radius: number,
  sweepDegrees: number,
  handedness: Handedness
): RoutePiece {
  return {
    track: {kind: 'curved', arc: arc(radius, degToRad(sweepDegrees))},
    handedness,
  };
}

/** Locates a piece at `entry`. Geometry is derived on demand, not stored. */
export function placePiece(entry: Pose, piece: RoutePiece): PlacedPiece {
  return {...piece, entry};
}

/**
 * The placed geometry of a piece, derived from its entry pose. For a curve the
 * center sits one radius off to the side it bends toward, square to the
 * direction of travel; sweeping from the start angle traces the arc.
 *
 * @throws RangeError if the piece has a non-positive dimension.
 */
export function pieceGeometry(placed: PlacedPiece): PieceGeometry {
  if (!('handedness' in placed)) {
    const start = placed.entry.position;
    const length = requirePositive(placed.track.length, 'length');
    return {
      kind: 'straight',
      start,
      end: advance(start, placed.entry.heading, length),
    };
  }
  const radius = requirePositive(placed.track.arc.radius, 'radius');
  const sweep = requirePositive(placed.track.arc.sweep, 'sweep');
  const turn = placed.handedness === 'left' ? 1 : -1;
  const towardCenter = placed.entry.heading + turn * QUARTER_TURN;
  const center = advance(placed.entry.position, towardCenter, radius);
  const startAngle = towardCenter + Math.PI;
  const endAngle = startAngle + turn * sweep;
  return {kind: 'curved', arc: {center, radius, startAngle, endAngle}};
}

/**
 * Where a train can leave the piece. A straight or curve has one exit; a turnout
 * will have more. The exit heading equals the entry heading rotated by the arc's
 * signed sweep (zero for a straight).
 */
export function exitPoses(placed: PlacedPiece): Pose[] {
  const geometry = pieceGeometry(placed);
  if (geometry.kind === 'straight') {
    return [{position: geometry.end, heading: placed.entry.heading}];
  }
  const {arc: placedArc} = geometry;
  const turned = placedArc.endAngle - placedArc.startAngle;
  return [
    {position: arcEnd(placedArc), heading: placed.entry.heading + turned},
  ];
}

/** The bounding box of a placed piece. Arcs account for their bulge. */
export function pieceBounds(placed: PlacedPiece): Bounds {
  const geometry = pieceGeometry(placed);
  return geometry.kind === 'straight'
    ? boundsOfPoints([geometry.start, geometry.end])
    : arcBounds(geometry.arc);
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
 *
 * @throws RangeError if any piece has a non-positive dimension.
 */
export function placeRoute(
  anchor: Pose,
  route: readonly RoutePiece[]
): PlacedRoute {
  const pieces: PlacedPiece[] = [];
  let pose = anchor;
  for (const piece of route) {
    const placed = placePiece(pose, piece);
    pieces.push(placed);
    // A single route follows the one through-exit; a turnout's extra exits are
    // for a future graph traversal, not this fold.
    pose = exitPoses(placed)[0];
  }
  return {pieces, exit: pose};
}
