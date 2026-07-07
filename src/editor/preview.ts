/**
 * What the next click would do, computed in one place so the on-screen feedback
 * and the commit agree — the lay-track tool's pure decision core, free of
 * Paper.js and the DOM. The editor edge (./editor) feeds it the pointer and the
 * current open ends, draws what it returns, and routes the click by the same
 * value.
 *
 * The pointer means exactly one thing at a time, and the preview shows which:
 * a ghost seated on a ringed open end — the click closes the join; a hovered
 * ring with no ghost — the click selects that end; a ghost alone — the click
 * lays the section; with nothing selected to draw from, the click drops a new
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
  findSeatedEnd,
  resolveAnchorSnap,
  resolveSnap,
  shapeForSnap,
  shapeTo,
  shownSnap,
  Snap,
  snapToIncrement,
  straightOntoLine,
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
 * under the pointer), the `snap` that shaped it, the `seatedEnd` the shape
 * seats on ({@link findSeatedEnd}) — the join the click records — the open end
 * whose ring is hovered — which the click selects instead of laying — and
 * `anchorPoint`, where the click drops a new network's anchor: the pointer,
 * pulled onto any guideline in range; null whenever the click has something to
 * lay or select instead.
 */
export interface Preview {
  readonly railhead: Pose | null;
  readonly shape: SectionShape | null;
  readonly ghost: PlacedSection | null;
  readonly snap: Snap | null;
  readonly seatedEnd: SectionEnd | null;
  readonly hover: SectionEnd | null;
  readonly anchorPoint: Point | null;
}

const NOTHING: Preview = {
  railhead: null,
  shape: null,
  ghost: null,
  snap: null,
  seatedEnd: null,
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
      ? lay(pose, shapeTo(pose, target), null, openEnds)
      : {...NOTHING, anchorPoint: target};
  }
  if (!origin) {
    const openEnd = hoveredEnd(target, openEnds, RING_HIT_PX / viewScale);
    if (openEnd) {
      return {...NOTHING, hover: openEnd.sectionEnd};
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
    const openEnd = hoveredEnd(target, openEnds, RING_HIT_PX / viewScale);
    if (openEnd) {
      return {...NOTHING, railhead, hover: openEnd.sectionEnd};
    }
  }
  const shape = shapeForSnap(railhead, snap, SNAP_INCREMENT, SNAP_THRESHOLD);
  return lay(railhead, shape, shownSnap(railhead, snap, shape), openEnds);
}

/**
 * The preview while aiming a pending anchor: the heading follows the pointer,
 * so the section on offer is always the straight from the anchor toward it —
 * curves wait for the heading to be locked. A hovered ring claims the click,
 * unless the straight dead onto that end seats there ({@link seatAim}) — the
 * tie-in outranks the selection, as a latched end outranks the hover while
 * extending. The aim angle-snaps to tidy multiples, so level and square starts
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
  const openEnd = hoveredEnd(target, openEnds, RING_HIT_PX / viewScale);
  if (openEnd) {
    return (
      seatAim(anchor, openEnd, openEnds) ?? {
        ...NOTHING,
        hover: openEnd.sectionEnd,
      }
    );
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
      return lay(
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
  return lay(pose, reach > EPSILON ? straight(reach) : null, null, openEnds);
}

/**
 * The preview that seats an aim dead on the hovered open end `onto`: the
 * straight from `anchor` to its point, laid when it seats there — the anchor
 * stands on the end's tangent line, on its open side, so the straight meets
 * it back-to-back ({@link findSeatedEnd}). Null when that straight does not
 * seat, leaving the hover to claim the click: the gate is the seat itself, so
 * a near miss stays a hover and the aim stands.
 */
function seatAim(
  anchor: Point,
  onto: SectionEndPose,
  openEnds: readonly SectionEndPose[]
): Preview | null {
  const aim = headingToward(anchor, onto.pose.position);
  if (aim === null) {
    return null;
  }
  const tieIn = lay(
    {position: anchor, heading: aim},
    straight(distance(anchor, onto.pose.position)),
    {kind: 'end', point: onto.pose.position},
    openEnds
  );
  return tieIn.seatedEnd ? tieIn : null;
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
  const aim = headingToward(origin.position, target);
  return aim === null ? null : {position: origin.position, heading: aim};
}

/**
 * A preview that lays `shape` from `railhead` — the ghost placed to match, and
 * `seatedEnd` read off the laid geometry ({@link findSeatedEnd}), whichever
 * path shaped it, so every landing that seats records its join.
 */
function lay(
  railhead: Pose,
  shape: SectionShape | null,
  snap: Snap | null,
  openEnds: readonly SectionEndPose[]
): Preview {
  return {
    railhead,
    shape,
    ghost: shape ? placeSection(shape, 'A', railhead) : null,
    snap,
    seatedEnd: shape ? findSeatedEnd(railhead, shape, openEnds) : null,
    hover: null,
    anchorPoint: null,
  };
}

/** The open end whose ring the pointer is within `radius` of; nearest wins. */
function hoveredEnd(
  target: Point,
  openEnds: readonly SectionEndPose[],
  radius: number
): SectionEndPose | null {
  let nearest: {openEnd: SectionEndPose; gap: number} | null = null;
  for (const openEnd of openEnds) {
    const gap = distance(target, openEnd.pose.position);
    if (gap <= radius && (!nearest || gap < nearest.gap)) {
      nearest = {openEnd, gap};
    }
  }
  return nearest ? nearest.openEnd : null;
}
