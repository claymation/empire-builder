/**
 * What the next click would do, computed in one place so the on-screen feedback
 * and the commit agree — the lay-track tool's pure decision core, free of
 * Paper.js and the DOM. The editor edge (./editor) feeds it the pointer and the
 * current open ends, draws what it returns ({@link overlayFeatures}), and
 * routes the click by its kind.
 *
 * The pointer means exactly one thing at a time, and the {@link Preview}'s kind
 * names which. A latch outranks a hover, so the two never both claim a click;
 * a hover suppresses the ghost, so the preview never shows a section a click
 * would not lay. A pending anchor aims ({@link DrawOrigin}): its ghost is the
 * straight toward the pointer, and curves wait for the heading to be locked.
 *
 * Seating decides the join, not the snap: a laid section whose far end lands
 * back-to-back on an open end ({@link findSeatedEnd}) ties in or closes,
 * however it got there — latched by the end magnet, slid there by a
 * guideline, or laid freehand. Suspending snapping (Option/Alt) only shrinks
 * the magnets to bare exactness ({@link Magnets}): nothing pulls, but exact
 * alignment still reads, draws its feedback, and joins.
 */

import {
  degToRad,
  distance,
  dot,
  EPSILON,
  headingToward,
  Line,
  normalizeAngle,
  Point,
  Pose,
  subtract,
  unitVector,
} from '../domain/geometry';
import {SectionEnd, SectionEndPose} from '../domain/layout';
import {
  endPose,
  placeSection,
  PlacedSection,
  SectionShape,
  straight,
} from '../domain/section';
import {
  findSeatedEnd,
  resolveAnchorSnap,
  resolveSnap,
  shapeForSnap,
  shownSnap,
  Snap,
  snapToIncrement,
  straightOntoLine,
} from '../domain/snapping';
import {assertNever} from '../domain/validate';

/** Curve sweeps snap to multiples of this when within the angle magnet of one. */
const SNAP_INCREMENT = degToRad(15);
const SNAP_THRESHOLD = degToRad(5);
/** Pointer pull, in px, onto an open end's point and its tangent/normal lines. */
const POINT_MAGNET_PX = 12;
const LINE_MAGNET_PX = 8;
/** Radius, in px, within which the pointer hovers an open end's ring. */
export const RING_HIT_PX = 12;

/**
 * The pull radii of the pointer's magnets, in domain units — an open end's
 * `point`, a guideline (`line`), the hover `ring` — and the sweep `angle`
 * snap threshold, in radians. Suspending snapping shrinks them all to
 * {@link EPSILON}, the float-equality scale: nothing pulls, but a pointer or
 * a laid end exactly aligned with a point or line still reads as aligned, so
 * its feedback still draws and a seated end still joins.
 */
interface Magnets {
  readonly point: number;
  readonly line: number;
  readonly ring: number;
  readonly angle: number;
}

/** The magnets at `viewScale`, shrunk to exactness while snapping is suspended. */
function magnets(viewScale: number, suspendSnap: boolean): Magnets {
  if (suspendSnap) {
    return {point: EPSILON, line: EPSILON, ring: EPSILON, angle: EPSILON};
  }
  return {
    point: POINT_MAGNET_PX / viewScale,
    line: LINE_MAGNET_PX / viewScale,
    ring: RING_HIT_PX / viewScale,
    angle: SNAP_THRESHOLD,
  };
}

/**
 * Where drawing grows from. A selected `railhead` fixes both position and
 * heading: `at` names the open end, and `pose` faces away from its section,
 * the direction track extends. A pending `anchor` fixes only the position;
 * its `heading` is the locked aim, or null while the aim follows the pointer.
 */
export type DrawOrigin =
  | {readonly kind: 'railhead'; readonly at: SectionEnd; readonly pose: Pose}
  | {
      readonly kind: 'anchor';
      readonly position: Point;
      readonly heading: number | null;
    };

/**
 * What the next click would do, one kind per meaning:
 *
 * - `select`: the pointer hovers an open end's ring; the click selects it.
 * - `startNetwork`: a ghost grows from a pending anchor; the click starts a
 *   new network, laying its first section and leaving `origin` at its aimed
 *   heading.
 * - `tieIn`: a ghost grows from a pending anchor and seats on open end
 *   `onto`; the click ties the aimed track into that network — a join is
 *   recorded and no new anchor is.
 * - `extend`: a ghost grows from the railhead `at`; the click lays it, closing
 *   a join onto `closeOnto` when its far end seats on an open end.
 * - `dropAnchor`: nothing is selected; the click drops a new network's anchor
 *   at `point` — the pointer, pulled onto any guideline in range (`snap`).
 * - `aim`: drawing grows from `origin`, but the pointer offers no section to
 *   lay — it sits on the origin, or behind a fixed heading.
 * - `nothing`: no pointer on the canvas, or nothing for a click to do.
 *
 * The laying kinds carry the `shape` to commit, that shape placed as a `ghost`
 * (the dashed preview drawn under the pointer), and the `snap` that shaped it.
 */
export type Preview =
  | {readonly kind: 'nothing'}
  | {readonly kind: 'select'; readonly end: SectionEnd}
  | {
      readonly kind: 'dropAnchor';
      readonly point: Point;
      readonly snap: Snap | null;
    }
  | {readonly kind: 'aim'; readonly origin: Pose}
  | {
      readonly kind: 'startNetwork';
      readonly origin: Pose;
      readonly shape: SectionShape;
      readonly ghost: PlacedSection;
      readonly snap: Snap | null;
    }
  | {
      readonly kind: 'tieIn';
      readonly onto: SectionEnd;
      readonly shape: SectionShape;
      readonly ghost: PlacedSection;
      readonly snap: Snap | null;
    }
  | {
      readonly kind: 'extend';
      readonly at: SectionEnd;
      readonly shape: SectionShape;
      readonly ghost: PlacedSection;
      readonly snap: Snap | null;
      readonly closeOnto: SectionEnd | null;
    };

const NOTHING: Preview = {kind: 'nothing'};

/**
 * Computes the {@link Preview} for a pointer at `target`. `origin` is where
 * drawing grows from ({@link DrawOrigin}), or null when nothing is selected —
 * the pointer can still hover an open end to select one, or drop an anchor.
 * `viewScale` converts the pixel magnets to domain units; `suspendSnap`
 * (Option/Alt) shrinks every magnet to exactness ({@link Magnets}), so the
 * section is the plain one to the pointer unless something aligns exactly.
 */
export function computePreview(
  origin: DrawOrigin | null,
  target: Point | null,
  openEnds: readonly SectionEndPose[],
  viewScale: number,
  suspendSnap: boolean
): Preview {
  if (!target) {
    return NOTHING;
  }
  const magnet = magnets(viewScale, suspendSnap);
  if (!origin) {
    const hover = hoveredEnd(target, openEnds, magnet.ring);
    if (hover) {
      return {kind: 'select', end: hover};
    }
    const snap = resolveAnchorSnap(target, openEnds, magnet.line);
    return {kind: 'dropAnchor', point: snap ? snap.point : target, snap};
  }
  switch (origin.kind) {
    case 'anchor':
      return origin.heading === null
        ? aimPreview(origin.position, target, openEnds, magnet)
        : snappedPreview(
            origin,
            {position: origin.position, heading: origin.heading},
            target,
            openEnds,
            magnet
          );
    case 'railhead':
      return snappedPreview(origin, origin.pose, target, openEnds, magnet);
    default:
      return assertNever(origin);
  }
}

/**
 * The features of a preview the overlay draws: the ghost under the pointer,
 * the `guide` line the target is following, the `seat` — the open end the
 * click will join, marked with the latch ring — and the open end a click
 * would select (`hoveredEnd`).
 */
export function overlayFeatures(preview: Preview): {
  ghost: PlacedSection | null;
  guide: Line | null;
  seat: SectionEnd | null;
  hoveredEnd: SectionEnd | null;
} {
  switch (preview.kind) {
    case 'startNetwork':
      return {
        ghost: preview.ghost,
        guide: guideOf(preview.snap),
        seat: null,
        hoveredEnd: null,
      };
    case 'tieIn':
      return {
        ghost: preview.ghost,
        guide: guideOf(preview.snap),
        seat: preview.onto,
        hoveredEnd: null,
      };
    case 'extend':
      return {
        ghost: preview.ghost,
        guide: guideOf(preview.snap),
        seat: preview.closeOnto,
        hoveredEnd: null,
      };
    case 'dropAnchor':
      return {
        ghost: null,
        guide: guideOf(preview.snap),
        seat: null,
        hoveredEnd: null,
      };
    case 'select':
      return {ghost: null, guide: null, seat: null, hoveredEnd: preview.end};
    case 'aim':
    case 'nothing':
      return {ghost: null, guide: null, seat: null, hoveredEnd: null};
    default:
      return assertNever(preview);
  }
}

/** The guideline a snap follows — a line snap's line. */
function guideOf(snap: Snap | null): Line | null {
  return snap && snap.kind === 'line' ? snap.line : null;
}

/**
 * The heading an aim in progress points along — the value locking captures —
 * or null when nothing is aimed.
 */
export function aimedHeading(preview: Preview): number | null {
  return preview.kind === 'startNetwork' || preview.kind === 'aim'
    ? preview.origin.heading
    : null;
}

/**
 * The preview when drawing grows from a full pose — a railhead, or a pending
 * anchor whose heading is locked: the ordinary snapped drawing path, where the
 * pointer's target resolves against the open ends' points and lines.
 */
function snappedPreview(
  origin: DrawOrigin,
  from: Pose,
  target: Point,
  openEnds: readonly SectionEndPose[],
  magnet: Magnets
): Preview {
  const snap = resolveSnap(from, target, openEnds, magnet.point, magnet.line);
  // A latched end outranks a hover: the click closes the join. Unlatched, a
  // pointer on a ring hovers it — the click selects, so the ghost is
  // suppressed rather than shown reaching for track the click would not lay.
  if (snap.kind !== 'end') {
    const hover = hoveredEnd(target, openEnds, magnet.ring);
    if (hover) {
      return {kind: 'select', end: hover};
    }
  }
  const shape = shapeForSnap(from, snap, SNAP_INCREMENT, magnet.angle);
  return lay(origin, from, shape, shownSnap(from, snap, shape), openEnds);
}

/**
 * The preview while aiming a pending anchor: the heading follows the pointer,
 * so the section on offer is always the straight from the anchor toward it —
 * curves wait for the heading to be locked. A hovered ring still claims the
 * click. The aim angle-snaps to tidy multiples, so level and square starts
 * come easily while a deliberate off-grid aim stands; a pointer near an open
 * end's guideline ({@link resolveAnchorSnap}) then slides the straight's end
 * to where the aim crosses it — the length that lines the new track's end up
 * with the old, while the aim itself stands, so a level start stays level and
 * stays parallel.
 */
function aimPreview(
  anchor: Point,
  target: Point,
  openEnds: readonly SectionEndPose[],
  magnet: Magnets
): Preview {
  const hover = hoveredEnd(target, openEnds, magnet.ring);
  if (hover) {
    return {kind: 'select', end: hover};
  }
  const aim = headingToward(anchor, target);
  if (aim === null) {
    return NOTHING;
  }
  // Normalized once, after snapping: the multiples divide the full turn
  // evenly, so snapping commutes with wrapping, and the one wrap also folds a
  // snap to 2π back to 0.
  const heading = normalizeAngle(
    snapToIncrement(aim, SNAP_INCREMENT, magnet.angle)
  );
  const pose: Pose = {position: anchor, heading};
  const pull = resolveAnchorSnap(target, openEnds, magnet.line);
  if (pull && pull.kind === 'line') {
    const alignedStraight = straightOntoLine(pose, pull.line);
    if (alignedStraight) {
      return layFromAnchor(
        pose,
        alignedStraight,
        {
          kind: 'line',
          point: endPose(placeSection(alignedStraight, 'A', pose), 'B')
            .position,
          line: pull.line,
        },
        openEnds
      );
    }
  }
  // A snapped heading leaves the pointer a hair off-axis; the straight runs to
  // its forward projection, so the preview keeps tracking the pointer.
  const reach = dot(unitVector(heading), subtract(target, anchor));
  return reach > EPSILON
    ? layFromAnchor(pose, straight(reach), null, openEnds)
    : {kind: 'aim', origin: pose};
}

/**
 * A preview that lays `shape` from `pose`, or, with no shape to lay, the bare
 * aim. Whether the click also records a join is read off the laid geometry
 * ({@link findSeatedEnd}): a railhead origin extends, closing onto any end the
 * far end seats on; a pending anchor's section ties into a seated end, and
 * otherwise starts a new network.
 */
function lay(
  origin: DrawOrigin,
  pose: Pose,
  shape: SectionShape | null,
  snap: Snap | null,
  openEnds: readonly SectionEndPose[]
): Preview {
  if (!shape) {
    return {kind: 'aim', origin: pose};
  }
  if (origin.kind === 'railhead') {
    return {
      kind: 'extend',
      at: origin.at,
      shape,
      ghost: placeSection(shape, 'A', pose),
      snap,
      closeOnto: findSeatedEnd(pose, shape, openEnds),
    };
  }
  return layFromAnchor(pose, shape, snap, openEnds);
}

/**
 * The preview laying `shape` from a pending anchor at `pose`: a `tieIn` when
 * its far end seats on an open end ({@link findSeatedEnd}), else it starts a
 * new network.
 */
function layFromAnchor(
  pose: Pose,
  shape: SectionShape,
  snap: Snap | null,
  openEnds: readonly SectionEndPose[]
): Preview {
  const onto = findSeatedEnd(pose, shape, openEnds);
  const ghost = placeSection(shape, 'A', pose);
  return onto
    ? {kind: 'tieIn', onto, shape, ghost, snap}
    : {kind: 'startNetwork', origin: pose, shape, ghost, snap};
}

/** The open end whose ring the pointer is within `radius` of; nearest wins. */
function hoveredEnd(
  target: Point,
  openEnds: readonly SectionEndPose[],
  radius: number
): SectionEnd | null {
  let nearest: {end: SectionEnd; gap: number} | null = null;
  for (const {sectionEnd, pose} of openEnds) {
    const gap = distance(target, pose.position);
    if (gap <= radius && (!nearest || gap < nearest.gap)) {
      nearest = {end: sectionEnd, gap};
    }
  }
  return nearest ? nearest.end : null;
}
