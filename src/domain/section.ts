/**
 * Track sections: their intrinsic shape, their identity within a layout, and how
 * a shape is located in the plane (US-3, US-4).
 *
 * A {@link SectionShape} is the authored form — a straight or a curve — with no
 * identity and no placement. {@link Section} adds a stable id so the layout can
 * join and reference it. {@link placeSection} locates a shape by seating any one
 * of its ends at a pose, deriving every end's world pose and the swept geometry
 * together.
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
  composePose,
  degToRad,
  inversePose,
  PlacedArc,
  PlacedSegment,
  Pose,
  reversePose,
  segmentBounds,
  segmentEndPose,
  unionBounds,
} from './geometry';
import {assertNever, requirePositive} from './validate';

/** Stable identity for a section within a layout. Opaque; assigned by the editor. */
export type SectionId = string;

/**
 * A section's two ends, named by position: anonymous labels carrying identity (a
 * join names one end, a placement seats one) but no direction. Every end's pose
 * faces into its section, so the names stay interchangeable — no end is an
 * entrance or an exit. A straight and a curve share the same two labels;
 * {@link endsOf} enumerates a kind's ends.
 */
export type EndName = 'A' | 'B';

/** A straight (tangent) run of the given length (mm). */
export interface Straight {
  readonly kind: 'straight';
  readonly length: number;
}

/**
 * A curved run of the given arc (radius and sweep). The sweep's sign gives
 * the rotational sense of travel from end `A` to end `B` — counter-clockwise
 * positive, clockwise negative — so the one stored value, placed by `B`,
 * presents the opposite bend on screen.
 */
export interface Curved {
  readonly kind: 'curved';
  readonly arc: Arc;
}

/**
 * The intrinsic form of a section: a {@link Straight} or a {@link Curved}. No
 * identity, no placement — the shape both {@link Section} and
 * {@link PlacedSection} are built over.
 */
export type SectionShape = Straight | Curved;

/** A {@link SectionShape} given an identity, so the layout can join and reference it. */
export type Section = SectionShape & {readonly id: SectionId};

/**
 * A section located in the plane: every end's world pose, plus the placed
 * geometry it renders as. Each end's pose faces into the section — its position
 * at the end, its heading aimed through it toward the interior. `geometry` is a
 * list because a section may sweep more than one segment or arc; a straight or
 * curve sweeps exactly one.
 */
export interface PlacedSection {
  readonly shape: SectionShape;
  readonly ends: ReadonlyMap<EndName, Pose>;
  readonly geometry: readonly (PlacedSegment | PlacedArc)[];
}

/** Builds a straight section shape of the given length. */
export function straight(length: number): Straight {
  return {kind: 'straight', length: requirePositive(length, 'length')};
}

/**
 * Builds a curve of the given radius (mm) sweeping `sweepDegrees` as it
 * travels from end `A` to end `B`: positive counter-clockwise, negative
 * clockwise.
 */
export function curve(radius: number, sweepDegrees: number): Curved {
  return {kind: 'curved', arc: arc(radius, degToRad(sweepDegrees))};
}

/** The running length of a section — the distance a train travels across it. */
export function sectionLength(shape: SectionShape): number {
  switch (shape.kind) {
    case 'straight':
      return shape.length;
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

/** The canonical frame's origin, where a shape's origin end sits when unplaced. */
const IDENTITY_POSE: Pose = {position: {x: 0, y: 0}, heading: 0};

/**
 * Places `shape` by seating its `end` at `pose`, deriving every end's world pose
 * and the swept geometry together.
 *
 * Seating works through the shape's canonical frame (its origin end at the
 * identity pose). The seating transform carries `end`'s canonical pose onto
 * `pose`; running the origin-end placement under that transform lands `end`
 * exactly at `pose`, whichever end it is. Seating the origin end makes the
 * transform equal `pose` and reduces to placing the raw geometry there.
 */
export function placeSection(
  shape: SectionShape,
  end: EndName,
  pose: Pose
): PlacedSection {
  if (!endsOf(shape).includes(end)) {
    throw new RangeError(`section of kind ${shape.kind} has no ${end} end`);
  }
  const seating = composePose(pose, inversePose(canonicalEndPose(shape, end)));
  return placeByOrigin(shape, seating);
}

/**
 * Places `shape` with its origin end at `originPose`, deriving every end's world
 * pose and the swept geometry together. The primitive both {@link placeSection}
 * and {@link canonicalEndPose} rest on; it seats one fixed end and takes no end
 * name.
 *
 * One exhaustive switch is each kind's sole authority on where its ends land and
 * what it sweeps, so a new kind must add its case here before it compiles. Every
 * end's pose faces into the section: the origin end's pose is `originPose`
 * itself, and each far end's is the reverse of the swept geometry's exit pose.
 */
function placeByOrigin(shape: SectionShape, originPose: Pose): PlacedSection {
  switch (shape.kind) {
    case 'straight': {
      const segment: PlacedSegment = {
        kind: 'segment',
        start: originPose,
        length: shape.length,
      };
      return {
        shape,
        ends: new Map([
          ['A', originPose],
          ['B', reversePose(segmentEndPose(segment))],
        ]),
        geometry: [segment],
      };
    }
    case 'curved': {
      const placedArc: PlacedArc = {
        kind: 'arc',
        start: originPose,
        radius: shape.arc.radius,
        sweep: shape.arc.sweep,
      };
      return {
        shape,
        ends: new Map([
          ['A', originPose],
          ['B', reversePose(arcEndPose(placedArc))],
        ]),
        geometry: [placedArc],
      };
    }
    default:
      return assertNever(shape);
  }
}

/**
 * The pose of `end` in the shape's canonical frame. Read from the origin-end
 * placement at the identity pose ({@link placeByOrigin}), never from {@link
 * placeSection}, whose seating transform is computed from this — routing it back
 * through would recur without end.
 */
function canonicalEndPose(shape: SectionShape, end: EndName): Pose {
  return endPose(placeByOrigin(shape, IDENTITY_POSE), end);
}

/**
 * The world pose of one of a placed section's named ends: the pose looking into
 * the section through that end.
 */
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
