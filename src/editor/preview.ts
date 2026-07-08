/**
 * What the next click would do, computed in one place so the on-screen feedback
 * and the commit agree — the lay-track tool's pure decision core, free of
 * Paper.js and the DOM. The editor edge (./editor) feeds it the pointer and the
 * current open ends, draws what it returns, and routes the click by the same
 * value.
 *
 * A click means exactly one thing at a time, and the preview shows which:
 *
 * - a ghost seated on a ringed open end — the click joins the two;
 * - a hovered ring with no ghost — the click selects that end;
 * - a ghost alone — the click lays the section;
 * - nothing to draw from — the click drops a new network's anchor at
 *   `anchorPoint`, the pointer pulled onto any guideline in range.
 *
 * A pending anchor aims ({@link DrawOrigin}): its ghost is the straight toward
 * the pointer, and curves wait for the heading to be locked. A seat outranks a
 * hover, so the two never both claim a click; a hover suppresses the ghost, so
 * the preview never shows a section a click would not lay.
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
import {sameEnd, SectionEnd, SectionEndPose} from '../domain/layout';
import {endPose, placeSection, SectionShape, straight} from '../domain/section';
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
 * What the next click would do:
 *
 * - `railhead` — the pose it lays from (for a pending anchor, the pose its
 *   heading resolved to; that heading is the one to commit);
 * - `shape` — the section to commit; the overlay places it as the dashed ghost
 *   under the pointer, and the click lays it;
 * - `snap` — the alignment that shaped it;
 * - `seatOnto` — the open end the shape's far end seats on, the join the click
 *   records ({@link findSeatedEnd});
 * - `hoveredEnd` — the open end whose ring is under the pointer, which the
 *   click selects instead of laying;
 * - `anchorPoint` — where the click drops a new network's anchor (the pointer,
 *   pulled onto any guideline in range), or null when the click lays or
 *   selects instead.
 */
export interface Preview {
  readonly railhead: Pose | null;
  readonly shape: SectionShape | null;
  readonly snap: Snap | null;
  readonly seatOnto: SectionEnd | null;
  readonly hoveredEnd: SectionEnd | null;
  readonly anchorPoint: Point | null;
}

const NOTHING: Preview = {
  railhead: null,
  shape: null,
  snap: null,
  seatOnto: null,
  hoveredEnd: null,
  anchorPoint: null,
};

/**
 * Computes the {@link Preview} for a pointer at `target`. `origin` is where
 * drawing grows from ({@link DrawOrigin}), or null when nothing is selected —
 * the pointer can still hover an open end to select one, or drop an anchor.
 * `viewScale` converts the pixel magnets to domain units. Suspending snapping
 * (Option/Alt) lays the plain section to the pointer — a pending anchor becomes
 * the raw straight toward the pointer — with no snaps, no guides, no hover.
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
      ? previewSection(pose, shapeTo(pose, target), null, openEnds)
      : {...NOTHING, anchorPoint: target};
  }
  if (!origin) {
    const hoveredEnd = findHoveredEnd(
      target,
      openEnds,
      RING_HIT_PX / viewScale
    );
    if (hoveredEnd) {
      return {...NOTHING, hoveredEnd};
    }
    const snap = resolveAnchorSnap(
      target,
      openEnds,
      LINE_MAGNET_PX / viewScale
    );
    return {...NOTHING, snap, anchorPoint: snap ? snap.point : target};
  }
  if (origin.kind === 'point') {
    return previewFromAnchor(origin.position, target, openEnds, viewScale);
  }
  const railhead = origin.pose;
  const snap = resolveSnap(
    railhead,
    target,
    openEnds,
    POINT_MAGNET_PX / viewScale,
    LINE_MAGNET_PX / viewScale
  );
  // A seated end outranks a hover: the click joins. Otherwise a pointer on a
  // ring hovers it — the click selects, so the section is suppressed rather
  // than shown reaching for track the click would not lay.
  if (snap.kind !== 'end') {
    const hoveredEnd = findHoveredEnd(
      target,
      openEnds,
      RING_HIT_PX / viewScale
    );
    if (hoveredEnd) {
      return {...NOTHING, railhead, hoveredEnd};
    }
  }
  const shape = shapeForSnap(railhead, snap, SNAP_INCREMENT, SNAP_THRESHOLD);
  return previewSection(
    railhead,
    shape,
    shownSnap(railhead, snap, shape),
    openEnds
  );
}

/**
 * The preview for a pending anchor whose heading follows the pointer: the
 * section on offer is always the straight from the anchor toward the pointer —
 * curves wait for the heading to be locked. A hovered ring claims the click,
 * unless the straight dead onto that end seats there ({@link tieInto}) — the
 * tie-in outranks the selection, as a seated end outranks a hover while
 * extending. The heading angle-snaps to tidy multiples, so level and square
 * starts come easily while a deliberate off-grid heading stands; a pointer near
 * an open end's guideline ({@link resolveAnchorSnap}) then slides the straight's
 * end to where the heading crosses it — the length that lines the new track's
 * end up with the old, while the heading itself stands, so a level start stays
 * level and stays parallel.
 */
function previewFromAnchor(
  anchor: Point,
  target: Point,
  openEnds: readonly SectionEndPose[],
  viewScale: number
): Preview {
  const hoveredEnd = findHoveredEnd(target, openEnds, RING_HIT_PX / viewScale);
  if (hoveredEnd) {
    return tieInto(anchor, hoveredEnd, openEnds) ?? {...NOTHING, hoveredEnd};
  }
  const rawHeading = headingToward(anchor, target);
  if (rawHeading === null) {
    return NOTHING;
  }
  // Normalized once, after snapping: the multiples divide the full turn
  // evenly, so snapping commutes with wrapping, and the one wrap also folds a
  // snap to 2π back to 0.
  const heading = normalizeAngle(
    snapToIncrement(rawHeading, SNAP_INCREMENT, SNAP_THRESHOLD)
  );
  const pose: Pose = {position: anchor, heading};
  const pull = resolveAnchorSnap(target, openEnds, LINE_MAGNET_PX / viewScale);
  if (pull && pull.kind === 'line') {
    const alignedStraight = straightOntoLine(pose, pull.line);
    if (alignedStraight) {
      return previewSection(
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
  return previewSection(
    pose,
    reach > EPSILON ? straight(reach) : null,
    null,
    openEnds
  );
}

/**
 * The preview that ties a pending anchor into the hovered open end `onto`: the
 * straight from `anchor` to it, offered when that straight seats there
 * ({@link findSeatedEnd}). Null when it does not seat — then the hover claims
 * the click. Seating needs the anchor on the end's tangent line, on its open
 * side, so the straight arrives back-to-back.
 */
function tieInto(
  anchor: Point,
  onto: SectionEnd,
  openEnds: readonly SectionEndPose[]
): Preview | null {
  const seat = openEnds.find(({sectionEnd}) => sameEnd(sectionEnd, onto));
  if (!seat) {
    return null;
  }
  const heading = headingToward(anchor, seat.pose.position);
  if (heading === null) {
    return null;
  }
  const preview = previewSection(
    {position: anchor, heading},
    straight(distance(anchor, seat.pose.position)),
    {kind: 'end', point: seat.pose.position},
    openEnds
  );
  return preview.seatOnto ? preview : null;
}

/**
 * The pose to draw from when snapping is suspended (Option/Alt). A `pose`
 * origin already is one. A `point` origin becomes one by pointing straight at
 * `target` — the raw heading, no angle snap. Null when there is no origin at
 * all, or when the pointer sits on the anchor itself and there is no direction
 * to point yet.
 */
function rawPose(origin: DrawOrigin | null, target: Point): Pose | null {
  if (!origin) {
    return null;
  }
  if (origin.kind === 'pose') {
    return origin.pose;
  }
  const heading = headingToward(origin.position, target);
  return heading === null ? null : {position: origin.position, heading};
}

/**
 * The preview for laying `shape` from `railhead`: `seatOnto` read from the laid
 * geometry — the open end its far end seats on ({@link findSeatedEnd}),
 * whichever path shaped it. The overlay places `shape` as the ghost; the click
 * lays it.
 */
function previewSection(
  railhead: Pose,
  shape: SectionShape | null,
  snap: Snap | null,
  openEnds: readonly SectionEndPose[]
): Preview {
  return {
    ...NOTHING,
    railhead,
    shape,
    snap,
    seatOnto: shape ? findSeatedEnd(railhead, shape, openEnds) : null,
  };
}

/** The open end whose ring the pointer is within `radius` of; nearest wins. */
function findHoveredEnd(
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
