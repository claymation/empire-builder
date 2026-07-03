/**
 * What the next click would do, computed in one place so the on-screen feedback
 * and the commit agree — the lay-track tool's pure decision core, free of
 * Paper.js and the DOM. The editor edge (./editor) feeds it the pointer and the
 * current open ends, draws what it returns, and routes the click by the same
 * value.
 *
 * The pointer means exactly one thing at a time, and the preview shows which:
 * a ghost reaching a latched ring — the click closes the join; a hovered ring
 * with no ghost — the click selects that end; a ghost alone — the click lays
 * the section; with nothing selected to draw from, the click drops a new
 * network's anchor at `anchorPoint`, the pointer pulled onto any guideline in
 * range. A pending anchor aims ({@link DrawOrigin}): its ghost is the straight
 * toward the pointer, and curves wait for the heading to be locked. A latch
 * outranks a hover, so the two never both claim a click; a hover suppresses
 * the ghost, so the preview never shows a section a click would not lay.
 */

import {
  degToRad,
  distance,
  dot,
  EPSILON,
  headingOf,
  lineIntersection,
  normalizeAngle,
  Point,
  Pose,
  subtract,
  unitVector,
} from '../domain/geometry';
import {SectionEnd, SectionEndPose} from '../domain/layout';
import {
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
} from '../domain/snapping';

/** Curve sweeps snap to multiples of this when within SNAP_THRESHOLD of one. */
const SNAP_INCREMENT = degToRad(15);
const SNAP_THRESHOLD = degToRad(5);
/** Pointer pull, in px, onto an open end's point and its tangent/normal lines. */
const POINT_MAGNET_PX = 12;
const LINE_MAGNET_PX = 8;
/** Radius, in px, within which the pointer hovers an open end's ring. */
export const RING_HIT_PX = 12;

/**
 * Where drawing grows from. A `pose` fixes both position and heading — a
 * selected railhead, or a pending anchor whose heading has been locked. A
 * `point` fixes only the position — a pending anchor whose heading follows
 * the pointer until it is locked or the first section is laid.
 */
export type DrawOrigin =
  | {readonly kind: 'pose'; readonly pose: Pose}
  | {readonly kind: 'point'; readonly position: Point};

/**
 * What the next click would do: the `railhead` it lays from (for an aim, the
 * pose the aim resolved to — its heading is the one to commit), the section's
 * `shape` (to commit), that shape placed as a `ghost` (the dashed preview drawn
 * under the pointer), the `snap` that shaped it, the open end it closes onto,
 * the open end whose ring is hovered — which the click selects instead of
 * laying anything — and `anchorPoint`, where the click drops a new network's
 * anchor: the pointer, pulled onto any guideline in range; null whenever the
 * click has something to lay or select instead.
 */
export interface Preview {
  readonly railhead: Pose | null;
  readonly shape: SectionShape | null;
  readonly ghost: PlacedSection | null;
  readonly snap: Snap | null;
  readonly closeOnto: SectionEnd | null;
  readonly hover: SectionEnd | null;
  readonly anchorPoint: Point | null;
}

const NOTHING: Preview = {
  railhead: null,
  shape: null,
  ghost: null,
  snap: null,
  closeOnto: null,
  hover: null,
  anchorPoint: null,
};

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
    const pose = rawPose(origin, target);
    return pose
      ? lay(pose, shapeTo(pose, target), null, null)
      : {...NOTHING, anchorPoint: target};
  }
  if (!origin) {
    const hover = hoveredEnd(target, openEnds, RING_HIT_PX / viewScale);
    if (hover) {
      return {...NOTHING, hover};
    }
    const snap = resolveAnchorSnap(
      target,
      openEnds,
      LINE_MAGNET_PX / viewScale
    );
    return {...NOTHING, snap, anchorPoint: snap ? snap.point : target};
  }
  if (origin.kind === 'point') {
    return aimPreview(origin.position, target, openEnds, viewScale);
  }
  const railhead = origin.pose;
  const snap = resolveSnap(
    railhead,
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
      return {...NOTHING, railhead, hover};
    }
  }
  const shape = shapeForSnap(railhead, snap, SNAP_INCREMENT, SNAP_THRESHOLD);
  return lay(
    railhead,
    shape,
    shownSnap(railhead, snap, shape),
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
    return {...NOTHING, hover};
  }
  if (distance(anchor, target) < EPSILON) {
    return NOTHING;
  }
  const aim = normalizeAngle(headingOf(subtract(target, anchor)));
  const heading = normalizeAngle(
    snapToIncrement(aim, SNAP_INCREMENT, SNAP_THRESHOLD)
  );
  const pose: Pose = {position: anchor, heading};
  const pull = resolveAnchorSnap(target, openEnds, LINE_MAGNET_PX / viewScale);
  if (pull && pull.kind === 'line') {
    const crossing = lineIntersection(
      {origin: anchor, direction: unitVector(heading)},
      pull.line
    );
    const reach = crossing
      ? dot(unitVector(heading), subtract(crossing, anchor))
      : 0;
    if (crossing && reach > EPSILON) {
      return lay(
        pose,
        straight(reach),
        {kind: 'line', point: crossing, line: pull.line},
        null
      );
    }
  }
  // A snapped heading leaves the pointer a hair off-axis; the straight runs to
  // its forward projection, so the preview keeps tracking the pointer.
  const reach = dot(unitVector(heading), subtract(target, anchor));
  return lay(pose, reach > EPSILON ? straight(reach) : null, null, null);
}

/**
 * The pose to draw from when snapping is suspended (Option/Alt). A `pose`
 * origin already is one. A `point` origin becomes one by pointing straight at
 * `target` — the raw aim, no angle snap. Null when there is no origin at all,
 * or when the pointer sits on the anchor itself and there is no direction to
 * point yet.
 */
function rawPose(origin: DrawOrigin | null, target: Point): Pose | null {
  if (!origin) {
    return null;
  }
  if (origin.kind === 'pose') {
    return origin.pose;
  }
  if (distance(origin.position, target) < EPSILON) {
    return null;
  }
  return {
    position: origin.position,
    heading: headingOf(subtract(target, origin.position)),
  };
}

/** A preview that lays `shape` from `railhead` — the ghost placed to match. */
function lay(
  railhead: Pose,
  shape: SectionShape | null,
  snap: Snap | null,
  closeOnto: SectionEnd | null
): Preview {
  return {
    railhead,
    shape,
    ghost: shape ? placeSection(shape, 'A', railhead) : null,
    snap,
    closeOnto,
    hover: null,
    anchorPoint: null,
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
