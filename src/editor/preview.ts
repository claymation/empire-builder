/**
 * What the next click would do, computed in one place so the on-screen feedback
 * and the commit agree — the editor's decision core, free of Paper.js and the
 * DOM. The editor edge (./editor) feeds it the pointer and the current open
 * ends, draws what {@link computePreview} returns, and routes the click by the
 * same value.
 *
 * The pointer means exactly one thing at a time, and a {@link Preview} says
 * which: a ghost reaching an open end lays a section (an end snap also joins its
 * far end there); a hovered ring selects that end; with nothing selected, a
 * click on empty space drops a new network's anchor. An end snap outranks a
 * hover, so the two never both claim a click; a hover suppresses the ghost, so
 * the preview never offers a section a click would not lay.
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
} from '../lib/geometry';
import {SectionEnd, SectionEndPose} from '../domain/layout';
import {endPose, placeSection, SectionShape, straight} from '../domain/section';
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

/** Curve sweeps snap to multiples of this when within SNAP_THRESHOLD of one. */
const SNAP_INCREMENT = degToRad(15);
const SNAP_THRESHOLD = degToRad(5);
/** Pointer pull, in px, onto an open end's point and its tangent/normal lines. */
const POINT_MAGNET_PX = 12;
const LINE_MAGNET_PX = 8;
/** Radius, in px, within which the pointer hovers an open end's ring. */
export const RING_HIT_PX = 12;

/**
 * A settled origin a section grows from: a fixed pose plus what committing it
 * means. `anchor` starts a new network at `pose` — its heading is the one to
 * commit; `railhead` extends the open end `at`'s network from `pose`.
 */
export type LaidFrom =
  | {readonly kind: 'anchor'; readonly pose: Pose}
  | {readonly kind: 'railhead'; readonly pose: Pose; readonly at: SectionEnd};

/**
 * Where drawing grows from. A {@link LaidFrom} once the heading is settled — a
 * selected railhead, or a pending anchor whose heading has been locked. `aiming`
 * is a pending anchor whose heading still follows the pointer, so it carries
 * only a position; the aim resolves to an `anchor` when a section is laid.
 */
export type DrawOrigin =
  | LaidFrom
  | {readonly kind: 'aiming'; readonly position: Point};

/**
 * What the next click would do — exactly one of these outcomes, so a reader
 * never reasons about which fields are valid together or which takes
 * precedence; the choice is made here, once.
 *
 * - `idle`: nothing (no pointer, or nowhere to lay, select, or drop).
 * - `select`: select the hovered open `end` as the railhead.
 * - `anchor`: drop a new network's anchor `at` — the pointer, pulled onto
 *   `snap`'s guideline when one is in range.
 * - `lay`: lay `shape` from `origin`; `snap` shaped it and, when it is an end
 *   snap, names the open end the far end joins onto.
 */
export type Preview =
  | {readonly kind: 'idle'}
  | {readonly kind: 'select'; readonly end: SectionEnd}
  | {readonly kind: 'anchor'; readonly at: Point; readonly snap: Snap | null}
  | {
      readonly kind: 'lay';
      readonly origin: LaidFrom;
      readonly shape: SectionShape;
      readonly snap: Snap | null;
    };

const IDLE: Preview = {kind: 'idle'};

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
  snapSuspended: boolean
): Preview {
  if (!target) {
    return IDLE;
  }
  if (snapSuspended) {
    const from = rawFrom(origin, target);
    return from
      ? lay(from, shapeTo(from.pose, target), null)
      : {kind: 'anchor', at: target, snap: null};
  }
  if (!origin) {
    const hoveredEnd = findHoveredEnd(
      target,
      openEnds,
      RING_HIT_PX / viewScale
    );
    if (hoveredEnd) {
      return {kind: 'select', end: hoveredEnd};
    }
    const snap = resolveAnchorSnap(
      target,
      openEnds,
      LINE_MAGNET_PX / viewScale
    );
    return {kind: 'anchor', at: snap ? snap.target : target, snap};
  }
  if (origin.kind === 'aiming') {
    return aimPreview(origin.position, target, openEnds, viewScale);
  }
  const snap = resolveSnap(
    origin.pose,
    target,
    openEnds,
    POINT_MAGNET_PX / viewScale,
    LINE_MAGNET_PX / viewScale
  );
  // An end snap outranks a hover: the click lays a section that joins onto the
  // end. Without one, a pointer on a ring hovers it — the click selects, so the
  // ghost is suppressed rather than shown reaching for track a click won't lay.
  if (snap.kind !== 'end') {
    const hoveredEnd = findHoveredEnd(
      target,
      openEnds,
      RING_HIT_PX / viewScale
    );
    if (hoveredEnd) {
      return {kind: 'select', end: hoveredEnd};
    }
  }
  const shape = shapeForSnap(origin.pose, snap, SNAP_INCREMENT, SNAP_THRESHOLD);
  return lay(origin, shape, shownSnap(origin.pose, snap, shape));
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
  const hoveredEnd = findHoveredEnd(target, openEnds, RING_HIT_PX / viewScale);
  if (hoveredEnd) {
    return {kind: 'select', end: hoveredEnd};
  }
  const aim = headingToward(anchor, target);
  if (aim === null) {
    return IDLE;
  }
  // Normalized once, after snapping: the multiples divide the full turn
  // evenly, so snapping commutes with wrapping, and the one wrap also folds a
  // snap to 2π back to 0.
  const heading = normalizeAngle(
    snapToIncrement(aim, SNAP_INCREMENT, SNAP_THRESHOLD)
  );
  const from: LaidFrom = {kind: 'anchor', pose: {position: anchor, heading}};
  const snap = resolveAnchorSnap(target, openEnds, LINE_MAGNET_PX / viewScale);
  if (snap && snap.kind === 'line') {
    const alignedStraight = straightOntoLine(from.pose, snap.line);
    if (alignedStraight) {
      return lay(from, alignedStraight, {
        kind: 'line',
        target: endPose(placeSection(alignedStraight, 'A', from.pose), 'B')
          .position,
        line: snap.line,
      });
    }
  }
  // A snapped heading leaves the pointer a hair off-axis; the straight runs to
  // its forward projection, so the preview keeps tracking the pointer.
  const reach = dot(unitVector(heading), subtract(target, anchor));
  return lay(from, reach > EPSILON ? straight(reach) : null, null);
}

/**
 * The origin to lay from when snapping is suspended (Option/Alt). A settled
 * {@link LaidFrom} passes through; an `aiming` anchor becomes one by pointing
 * straight at `target` — the raw aim, no angle snap. Null when there is no
 * origin at all, or the pointer sits on the anchor itself with no direction to
 * point yet.
 */
function rawFrom(origin: DrawOrigin | null, target: Point): LaidFrom | null {
  if (!origin) {
    return null;
  }
  if (origin.kind !== 'aiming') {
    return origin;
  }
  const aim = headingToward(origin.position, target);
  return aim === null
    ? null
    : {kind: 'anchor', pose: {position: origin.position, heading: aim}};
}

/** Lays `shape` from `origin`, or nothing (idle) when there is no shape to lay. */
function lay(
  origin: LaidFrom,
  shape: SectionShape | null,
  snap: Snap | null
): Preview {
  return shape ? {kind: 'lay', origin, shape, snap} : IDLE;
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
