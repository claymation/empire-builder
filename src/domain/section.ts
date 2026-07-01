/**
 * Track sections: their intrinsic shape, their identity within a layout, and how
 * a shape is located in the plane (US-3, US-4).
 *
 * A {@link SectionShape} is the authored form — a straight or a curve — with no
 * identity and no placement. {@link Section} adds a stable id so the layout can
 * join and reference it. {@link placeSection} locates a shape by seating its end
 * `A` at a pose, deriving every end's world pose and the swept geometry together.
 *
 * Sections stay plain, serializable data; the geometry is derived on demand,
 * never stored on the layout.
 */

import {
  arc,
  Arc,
  arcBounds,
  arcEndPose,
  arcLength,
  Bounds,
  degToRad,
  PlacedArc,
  PlacedSegment,
  Pose,
  segmentBounds,
  segmentEndPose,
  unionBounds,
} from './geometry';
import {assertNever, requirePositive} from './validate';

/** Stable identity for a section within a layout. Opaque; assigned by the editor. */
export type SectionId = string;

/**
 * A section's two ends, named by position: anonymous labels carrying identity (a
 * join names one end, a placement seats one) but no direction. A straight and a
 * curve share the same two labels; {@link endsOf} enumerates a kind's ends.
 */
export type EndName = 'A' | 'B';

/**
 * Which way a curve bends, as the rotational sense of travel from end `A` to end
 * `B`: `ccw` turns counter-clockwise, `cw` clockwise. Intrinsic to the shape —
 * placing the same curve by `B` traverses it B→A and so presents the opposite
 * bend on screen, from the one stored value.
 */
export type Turn = 'ccw' | 'cw';

/** The sign a {@link Turn} lends an arc's sweep: ccw positive (+), cw negative (−). */
export function turnSign(turn: Turn): number {
  return turn === 'ccw' ? 1 : -1;
}

/**
 * The intrinsic form of a section: a straight of a given length, or a curve of a
 * given arc with the way it bends (its {@link Turn}). The bend rides on the shape
 * while the arc holds only radius and sweep. No identity, no placement — the
 * shape both {@link Section} and {@link PlacedSection} are built over.
 */
export type SectionShape =
  | {readonly kind: 'straight'; readonly length: number}
  | {readonly kind: 'curved'; readonly arc: Arc; readonly turn: Turn};

/** A {@link SectionShape} given an identity, so the layout can join and reference it. */
export type Section = SectionShape & {readonly id: SectionId};

/**
 * A section located in the plane: every end's world pose, plus the placed
 * geometry it renders as. `geometry` is a list because a section may sweep more
 * than one segment or arc; a straight or curve sweeps exactly one.
 */
export interface PlacedSection {
  readonly shape: SectionShape;
  readonly ends: ReadonlyMap<EndName, Pose>;
  readonly geometry: readonly (PlacedSegment | PlacedArc)[];
}

/** Builds a straight section shape of the given length. */
export function straight(length: number): SectionShape {
  return {kind: 'straight', length: requirePositive(length, 'length')};
}

/**
 * Builds a curve of the given radius (mm) sweeping `sweepDegrees`, bending the
 * given way ({@link Turn}) as it travels from end `A` to end `B`.
 */
export function curve(
  radius: number,
  sweepDegrees: number,
  turn: Turn
): SectionShape {
  return {kind: 'curved', arc: arc(radius, degToRad(sweepDegrees)), turn};
}

/** The running length of a section — the distance a train travels across it. */
export function sectionLength(shape: SectionShape): number {
  switch (shape.kind) {
    case 'straight':
      return requirePositive(shape.length, 'length');
    case 'curved':
      return arcLength(shape.arc);
    default:
      return assertNever(shape);
  }
}

/**
 * The ends a section of this kind has, named by position. The sole enumeration
 * of a kind's ends: an exhaustive switch on `kind`, so a new kind fails to
 * compile until its ends are listed. Both current kinds have the same two ends,
 * `A` and `B`.
 */
export function endsOf(shape: SectionShape): readonly EndName[] {
  switch (shape.kind) {
    case 'straight':
    case 'curved':
      return ['A', 'B'];
    default:
      return assertNever(shape);
  }
}

/**
 * Places `shape` by seating its end `A` at `pose`, deriving end `B`'s world pose
 * and the swept geometry together. A curve's {@link Turn} becomes the sign of the
 * arc's sweep — ccw counter-clockwise, cw clockwise.
 */
export function placeSection(shape: SectionShape, pose: Pose): PlacedSection {
  const geometry = placedGeometry(shape, pose);
  const b =
    geometry.kind === 'segment'
      ? segmentEndPose(geometry)
      : arcEndPose(geometry);
  return {
    shape,
    ends: new Map([
      ['A', pose],
      ['B', b],
    ]),
    geometry: [geometry],
  };
}

/** The world pose of one of a placed section's named ends. */
export function endPose(placed: PlacedSection, end: EndName): Pose {
  const pose = placed.ends.get(end);
  if (!pose) {
    throw new RangeError(`section has no ${end} end`);
  }
  return pose;
}

/** The bounding box of a placed section. Arcs account for their bulge. */
export function sectionBounds(placed: PlacedSection): Bounds {
  return placed.geometry
    .map(geometry =>
      geometry.kind === 'segment'
        ? segmentBounds(geometry)
        : arcBounds(geometry)
    )
    .reduce(unionBounds);
}

/** The single segment or arc a straight or curve sweeps with its end `A` at `pose`. */
function placedGeometry(
  shape: SectionShape,
  pose: Pose
): PlacedSegment | PlacedArc {
  switch (shape.kind) {
    case 'straight':
      return {kind: 'segment', start: pose, length: shape.length};
    case 'curved':
      return {
        kind: 'arc',
        start: pose,
        radius: shape.arc.radius,
        sweep: turnSign(shape.turn) * shape.arc.sweep,
      };
    default:
      return assertNever(shape);
  }
}
