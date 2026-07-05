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
 */

import {
  degToRad,
  distance,
  dot,
  EPSILON,
  headingToward,
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
  resolveAnchorSnap,
  resolveSnap,
  shapeForSnap,
  shapeTo,
  shownSnap,
  Snap,
  snapToIncrement,
  straightOntoLine,
} from '../domain/snapping';
import {assertNever} from '../domain/validate';

/** Curve sweeps snap to multiples of this when within SNAP_THRESHOLD of one. */
const SNAP_INCREMENT = degToRad(15);
const SNAP_THRESHOLD = degToRad(5);
/** Pointer pull, in px, onto an open end's point and its tangent/normal lines. */
const POINT_MAGNET_PX = 12;
const LINE_MAGNET_PX = 8;
/** Radius, in px, within which the pointer hovers an open end's ring. */
export const RING_HIT_PX = 12;

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
 * - `extend`: a ghost grows from the railhead `at`; the click lays it, closing
 *   a join onto `closeOnto` when the target latched an open end.
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
 * `viewScale` converts the pixel magnets to domain units. Suspending snapping
 * (Option/Alt) lays the plain section to the pointer — an aim becomes the raw
 * straight toward it — with no snaps, no guides, no hover.
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
  if (suspendSnap) {
    if (!origin) {
      return {kind: 'dropAnchor', point: target, snap: null};
    }
    const pose = rawPose(origin, target);
    return pose
      ? lay(origin, pose, shapeTo(pose, target), null, null)
      : NOTHING;
  }
  if (!origin) {
    const hover = hoveredEnd(target, openEnds, RING_HIT_PX / viewScale);
    if (hover) {
      return {kind: 'select', end: hover};
    }
    const snap = resolveAnchorSnap(
      target,
      openEnds,
      LINE_MAGNET_PX / viewScale
    );
    return {kind: 'dropAnchor', point: snap ? snap.point : target, snap};
  }
  switch (origin.kind) {
    case 'anchor':
      return origin.heading === null
        ? aimPreview(origin.position, target, openEnds, viewScale)
        : snappedPreview(
            origin,
            {position: origin.position, heading: origin.heading},
            target,
            openEnds,
            viewScale
          );
    case 'railhead':
      return snappedPreview(origin, origin.pose, target, openEnds, viewScale);
    default:
      return assertNever(origin);
  }
}

/**
 * The features of a preview the overlay draws: the ghost under the pointer,
 * the snap feedback (guide line or latch ring) that shaped it, and the open
 * end a click would select.
 */
export function overlayFeatures(preview: Preview): {
  ghost: PlacedSection | null;
  snap: Snap | null;
  hoveredEnd: SectionEnd | null;
} {
  switch (preview.kind) {
    case 'startNetwork':
    case 'extend':
      return {ghost: preview.ghost, snap: preview.snap, hoveredEnd: null};
    case 'dropAnchor':
      return {ghost: null, snap: preview.snap, hoveredEnd: null};
    case 'select':
      return {ghost: null, snap: null, hoveredEnd: preview.end};
    case 'aim':
    case 'nothing':
      return {ghost: null, snap: null, hoveredEnd: null};
    default:
      return assertNever(preview);
  }
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
  viewScale: number
): Preview {
  const snap = resolveSnap(
    from,
    target,
    openEnds,
    POINT_MAGNET_PX / viewScale,
    LINE_MAGNET_PX / viewScale
  );
  // A latched end outranks a hover: the click closes the join. Unlatched, a
  // pointer on a ring hovers it — the click selects, so the ghost is
  // suppressed rather than shown reaching for track the click would not lay.
  if (snap.kind !== 'end') {
    const hover = hoveredEnd(target, openEnds, RING_HIT_PX / viewScale);
    if (hover) {
      return {kind: 'select', end: hover};
    }
  }
  const shape = shapeForSnap(from, snap, SNAP_INCREMENT, SNAP_THRESHOLD);
  return lay(
    origin,
    from,
    shape,
    shownSnap(from, snap, shape),
    snap.kind === 'end' ? snap.end : null
  );
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
  viewScale: number
): Preview {
  const hover = hoveredEnd(target, openEnds, RING_HIT_PX / viewScale);
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
    snapToIncrement(aim, SNAP_INCREMENT, SNAP_THRESHOLD)
  );
  const pose: Pose = {position: anchor, heading};
  const pull = resolveAnchorSnap(target, openEnds, LINE_MAGNET_PX / viewScale);
  if (pull && pull.kind === 'line') {
    const alignedStraight = straightOntoLine(pose, pull.line);
    if (alignedStraight) {
      return layFromAnchor(pose, alignedStraight, {
        kind: 'line',
        point: endPose(placeSection(alignedStraight, 'A', pose), 'B').position,
        line: pull.line,
      });
    }
  }
  // A snapped heading leaves the pointer a hair off-axis; the straight runs to
  // its forward projection, so the preview keeps tracking the pointer.
  const reach = dot(unitVector(heading), subtract(target, anchor));
  return reach > EPSILON
    ? layFromAnchor(pose, straight(reach), null)
    : {kind: 'aim', origin: pose};
}

/**
 * The pose to draw from when snapping is suspended (Option/Alt). A railhead,
 * or a locked anchor, already fixes one. An aiming anchor points straight at
 * `target` — the raw aim, no angle snap — and fixes none while the pointer
 * sits on the anchor itself, leaving no direction to point.
 */
function rawPose(origin: DrawOrigin, target: Point): Pose | null {
  switch (origin.kind) {
    case 'railhead':
      return origin.pose;
    case 'anchor': {
      if (origin.heading !== null) {
        return {position: origin.position, heading: origin.heading};
      }
      const aim = headingToward(origin.position, target);
      return aim === null ? null : {position: origin.position, heading: aim};
    }
    default:
      return assertNever(origin);
  }
}

/**
 * A preview that lays `shape` from `pose` — an `extend` from a railhead, a
 * `startNetwork` from a pending anchor — or, with no shape to lay, the bare
 * aim.
 */
function lay(
  origin: DrawOrigin,
  pose: Pose,
  shape: SectionShape | null,
  snap: Snap | null,
  closeOnto: SectionEnd | null
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
      closeOnto,
    };
  }
  return layFromAnchor(pose, shape, snap);
}

/**
 * The preview laying `shape` from a pending anchor at `pose`: a
 * `startNetwork`, the ghost placed to match.
 */
function layFromAnchor(
  pose: Pose,
  shape: SectionShape,
  snap: Snap | null
): Preview {
  return {
    kind: 'startNetwork',
    origin: pose,
    shape,
    ghost: placeSection(shape, 'A', pose),
    snap,
  };
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
