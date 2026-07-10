/**
 * What the next click would do, computed in one place so the on-screen feedback
 * and the commit agree — the editor's decision core, free of Paper.js and the
 * DOM. The editor edge (./editor) feeds it the pointer and the current open
 * ends, draws what {@link computePreview} returns, and routes the click by the
 * same value.
 *
 * A click means exactly one thing at a time, and a {@link Preview} says which:
 *
 * - a ghost reaching an open end lays a section — an end snap also joins its
 *   far end onto that open end;
 * - a hovered ring selects that end;
 * - with nothing selected, a click on empty space drops a new network's anchor.
 *
 * An end snap outranks a hover, so the two never both claim a click; a hover
 * suppresses the ghost, so the preview never offers a section a click would not
 * lay.
 */

import {
  advance,
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
import {SectionShape, straight} from '../domain/section';
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
 * Where drawing grows from:
 *
 * - `railhead`: a selected open end `at`, extended from `pose`;
 * - `anchor`: a pending anchor whose heading is set, starting a new network at
 *   `pose`;
 * - `point`: a pending anchor whose heading still follows the pointer, so it has
 *   only a position — the heading is chosen (aimed) while the first section is
 *   previewed.
 *
 * `railhead` and `anchor` are settled: they carry a full pose, so a section can
 * be laid from either. Laying resolves a `point` into an `anchor`.
 */
export type DrawOrigin =
  | {readonly kind: 'anchor'; readonly pose: Pose}
  | {readonly kind: 'railhead'; readonly pose: Pose; readonly at: SectionEnd}
  | {readonly kind: 'point'; readonly position: Point};

/** A settled origin: a `DrawOrigin` that carries a pose, so a section lays from it. */
type SettledOrigin = Exclude<DrawOrigin, {readonly kind: 'point'}>;

/**
 * What the next click would do — exactly one of these outcomes, so a reader
 * never reasons about which fields are valid together or which takes
 * precedence; the choice is made here, once.
 *
 * - `nothing`: the click does nothing (no pointer, or nowhere to lay, select,
 *   or drop).
 * - `select`: the click selects the hovered open `end` as the railhead.
 * - `anchor`: the click drops a new network's anchor `at` — the pointer, pulled
 *   onto `snap`'s guideline when one is in range.
 * - `lay`: the click lays `shape` from `origin`; `snap` shaped it and, when it
 *   is an end snap, names the open end the far end joins onto.
 */
export type Preview =
  | {readonly kind: 'nothing'}
  | {readonly kind: 'select'; readonly end: SectionEnd}
  | {readonly kind: 'anchor'; readonly at: Point; readonly snap: Snap | null}
  | {
      readonly kind: 'lay';
      readonly origin: SettledOrigin;
      readonly shape: SectionShape;
      readonly snap: Snap | null;
    };

const NOTHING: Preview = {kind: 'nothing'};

/**
 * Computes the {@link Preview} for the `pointer` position. `origin` is where
 * drawing grows from ({@link DrawOrigin}), or null when nothing is selected.
 * `viewScale` converts the pixel magnets to domain units. Suspending snapping
 * (Option/Alt) lays a plain section to the pointer, with no snaps, no guides,
 * and no hover.
 */
export function computePreview(
  origin: DrawOrigin | null,
  pointer: Point | null,
  openEnds: readonly SectionEndPose[],
  viewScale: number,
  snapSuspended: boolean
): Preview {
  if (!pointer) {
    return NOTHING;
  }
  const outcome = snapSuspended
    ? freehand(origin, pointer)
    : withSnapping(origin, pointer, openEnds, viewScale);

  // A hovered ring makes the click select that end instead — unless an end snap
  // claims the click (an end snap outranks a hover), or snapping is suspended
  // (which offers no hovers).
  if (!snapSuspended && !isEndSnap(outcome)) {
    const hovered = findHoveredEnd(pointer, openEnds, RING_HIT_PX / viewScale);
    if (hovered) {
      return {kind: 'select', end: hovered};
    }
  }
  return outcome;
}

/** Whether an outcome is a lay whose end snaps onto an open end. */
function isEndSnap(preview: Preview): boolean {
  return preview.kind === 'lay' && preview.snap?.kind === 'end';
}

/**
 * The lay or drop the pointer offers with snapping on — before a hover is
 * allowed to override it. No origin drops an anchor (pulled onto a nearby
 * guideline); a `point` origin aims the first section; a settled origin lays
 * the section the pointer's snap calls for.
 */
function withSnapping(
  origin: DrawOrigin | null,
  pointer: Point,
  openEnds: readonly SectionEndPose[],
  viewScale: number
): Preview {
  if (!origin) {
    const snap = resolveAnchorSnap(
      pointer,
      openEnds,
      LINE_MAGNET_PX / viewScale
    );
    return {kind: 'anchor', at: snap ? snap.target : pointer, snap};
  }
  if (origin.kind === 'point') {
    return aimPreview(origin.position, pointer, openEnds, viewScale);
  }
  const snap = resolveSnap(
    origin.pose,
    pointer,
    openEnds,
    POINT_MAGNET_PX / viewScale,
    LINE_MAGNET_PX / viewScale
  );
  const shape = shapeForSnap(origin.pose, snap, SNAP_INCREMENT, SNAP_THRESHOLD);
  return shape
    ? {kind: 'lay', origin, shape, snap: shownSnap(origin.pose, snap, shape)}
    : NOTHING;
}

/**
 * The lay or drop the pointer offers with snapping suspended (Option/Alt): a
 * settled origin lays the plain section straight to the pointer; otherwise —
 * nothing selected, or the pointer sitting on an aiming anchor — a click drops
 * a fresh anchor at the raw pointer.
 */
function freehand(origin: DrawOrigin | null, pointer: Point): Preview {
  const from = origin ? settle(origin, pointer) : null;
  if (!from) {
    return {kind: 'anchor', at: pointer, snap: null};
  }
  const shape = shapeTo(from.pose, pointer);
  return shape ? {kind: 'lay', origin: from, shape, snap: null} : NOTHING;
}

/**
 * The preview while aiming a pending anchor: the heading follows the pointer,
 * so the section on offer is always the straight from the anchor toward it —
 * curves wait for the heading to be locked. The aim angle-snaps to tidy
 * multiples, so level and square starts come easily while a deliberate off-grid
 * aim stands; a pointer near an open end's guideline ({@link resolveAnchorSnap})
 * then slides the straight's end to where the heading crosses it — the length
 * that lines the new track's end up with the old, while the heading itself
 * stands, so a level start stays level and stays parallel.
 */
function aimPreview(
  anchor: Point,
  pointer: Point,
  openEnds: readonly SectionEndPose[],
  viewScale: number
): Preview {
  const heading = headingToward(anchor, pointer);
  if (heading === null) {
    return NOTHING;
  }
  // Normalized once, after snapping: the multiples divide the full turn
  // evenly, so snapping commutes with wrapping, and the one wrap also folds a
  // snap to 2π back to 0.
  const snappedHeading = normalizeAngle(
    snapToIncrement(heading, SNAP_INCREMENT, SNAP_THRESHOLD)
  );
  const origin: SettledOrigin = {
    kind: 'anchor',
    pose: {position: anchor, heading: snappedHeading},
  };
  const snap = resolveAnchorSnap(pointer, openEnds, LINE_MAGNET_PX / viewScale);
  if (snap && snap.kind === 'line') {
    const alignedStraight = straightOntoLine(origin.pose, snap.line);
    if (alignedStraight) {
      // The straight ends where the heading crosses the guideline; that point
      // is where its guide draws.
      const crossing = advance(anchor, snappedHeading, alignedStraight.length);
      return {
        kind: 'lay',
        origin,
        shape: alignedStraight,
        snap: {kind: 'line', target: crossing, line: snap.line},
      };
    }
  }
  // A snapped heading leaves the pointer a hair off-axis; the straight runs to
  // its forward projection, so the preview keeps tracking the pointer.
  const reach = dot(unitVector(snappedHeading), subtract(pointer, anchor));
  return reach > EPSILON
    ? {kind: 'lay', origin, shape: straight(reach), snap: null}
    : NOTHING;
}

/**
 * Settles an origin's heading for a suspended (raw) lay: a settled origin
 * passes through; a `point` origin becomes an `anchor` by pointing straight at
 * `pointer`, with no angle snap. Null when the pointer sits on the anchor itself
 * and there is no direction to point yet.
 */
function settle(origin: DrawOrigin, pointer: Point): SettledOrigin | null {
  if (origin.kind !== 'point') {
    return origin;
  }
  const heading = headingToward(origin.position, pointer);
  return heading === null
    ? null
    : {kind: 'anchor', pose: {position: origin.position, heading}};
}

/** The open end whose ring the pointer is within `radius` of; nearest wins. */
function findHoveredEnd(
  pointer: Point,
  openEnds: readonly SectionEndPose[],
  radius: number
): SectionEnd | null {
  let nearest: {end: SectionEnd; gap: number} | null = null;
  for (const {sectionEnd, pose} of openEnds) {
    const gap = distance(pointer, pose.position);
    if (gap <= radius && (!nearest || gap < nearest.gap)) {
      nearest = {end: sectionEnd, gap};
    }
  }
  return nearest ? nearest.end : null;
}
