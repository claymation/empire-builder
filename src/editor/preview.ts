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
 * the section. A latch outranks a hover, so the two never both claim a click;
 * a hover suppresses the ghost, so the preview never shows a section a click
 * would not lay.
 */

import {degToRad, distance, Point, Pose} from '../domain/geometry';
import {SectionEnd, SectionEndPose} from '../domain/layout';
import {placeSection, PlacedSection, SectionShape} from '../domain/section';
import {
  resolveSnap,
  shapeForSnap,
  shapeTo,
  shownSnap,
  Snap,
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
 * What the next click would do: the `railhead` it lays from, the section's
 * `shape` (to commit), that shape placed as a `ghost` (the dashed preview drawn
 * under the pointer), the `snap` that shaped it, the open end it closes onto,
 * and the open end whose ring is hovered — which the click selects instead of
 * laying anything.
 */
export interface Preview {
  readonly railhead: Pose | null;
  readonly shape: SectionShape | null;
  readonly ghost: PlacedSection | null;
  readonly snap: Snap | null;
  readonly closeOnto: SectionEnd | null;
  readonly hover: SectionEnd | null;
}

const NOTHING: Preview = {
  railhead: null,
  shape: null,
  ghost: null,
  snap: null,
  closeOnto: null,
  hover: null,
};

/**
 * Computes the {@link Preview} for a pointer at `target`. `railhead` is the
 * outward pose drawing grows from, or null when none is selected — the pointer
 * can still hover an open end to select one. `viewScale` converts the pixel
 * magnets to domain units. Suspending snapping (Option/Alt) lays the plain
 * section to the pointer: no snaps, no guides, no hover.
 */
export function computePreview(
  railhead: Pose | null,
  target: Point | null,
  openEnds: readonly SectionEndPose[],
  viewScale: number,
  suspendSnap: boolean
): Preview {
  if (!target) {
    return NOTHING;
  }
  if (suspendSnap) {
    return railhead
      ? lay(railhead, shapeTo(railhead, target), null, null)
      : NOTHING;
  }
  if (!railhead) {
    return {
      ...NOTHING,
      hover: hoveredEnd(target, openEnds, RING_HIT_PX / viewScale),
    };
  }
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
