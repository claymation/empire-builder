/**
 * Track sections: their intrinsic shape, their identity within a layout, and how
 * a shape is located in the plane (US-3, US-4).
 *
 * A {@link SectionShape} is the authored form — a straight or a curve — with no
 * identity and no placement. {@link Section} adds a stable id so the layout can
 * join and reference it. {@link placeSection} locates a shape at an entry pose,
 * deriving every end's world pose and the swept geometry it renders as.
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
  Handedness,
  handednessSign,
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

/** A section's two connection ends, named by the through-travel direction. */
export type EndName = 'entry' | 'exit';

/**
 * The intrinsic form of a section: a straight of a given length, or a curve of a
 * given arc laid to bend left or right. Handedness is a property of laying the
 * curve, so it rides on the shape while the arc holds only radius and sweep. No
 * identity, no placement — the shape both {@link Section} and {@link
 * PlacedSection} are built over.
 */
export type SectionShape =
  | {readonly kind: 'straight'; readonly length: number}
  | {
      readonly kind: 'curved';
      readonly arc: Arc;
      readonly handedness: Handedness;
    };

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

/** Builds a curve of the given radius (mm) bending left through `sweepDegrees`. */
export function curveLeft(radius: number, sweepDegrees: number): SectionShape {
  return curve(radius, sweepDegrees, 'left');
}

/** Builds a curve of the given radius (mm) bending right through `sweepDegrees`. */
export function curveRight(radius: number, sweepDegrees: number): SectionShape {
  return curve(radius, sweepDegrees, 'right');
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

function curve(
  radius: number,
  sweepDegrees: number,
  handedness: Handedness
): SectionShape {
  return {kind: 'curved', arc: arc(radius, degToRad(sweepDegrees)), handedness};
}

/**
 * Places `shape` with its `entry` at `pose`, deriving every end's world pose and
 * the swept geometry together. A curve's handedness becomes the sign of the
 * arc's sweep — left counter-clockwise, right clockwise.
 */
export function placeSection(shape: SectionShape, pose: Pose): PlacedSection {
  const geometry = placedGeometry(shape, pose);
  const exit =
    geometry.kind === 'segment'
      ? segmentEndPose(geometry)
      : arcEndPose(geometry);
  return {
    shape,
    ends: new Map([
      ['entry', pose],
      ['exit', exit],
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

/** The single segment or arc a straight or curve sweeps when placed at `entry`. */
function placedGeometry(
  shape: SectionShape,
  entry: Pose
): PlacedSegment | PlacedArc {
  switch (shape.kind) {
    case 'straight':
      return {kind: 'segment', start: entry, length: shape.length};
    case 'curved':
      return {
        kind: 'arc',
        start: entry,
        radius: shape.arc.radius,
        sweep: handednessSign(shape.handedness) * shape.arc.sweep,
      };
    default:
      return assertNever(shape);
  }
}
