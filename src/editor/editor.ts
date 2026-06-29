/**
 * The lay-track tool's edge: it owns an {@link EditorState}, translates Paper.js
 * pointer and keyboard events into pure state transitions, and redraws. All the
 * decision logic lives in ./state and ../domain; this file is the Paper.js/DOM
 * glue.
 */

import paper from 'paper';
import {degToRad, Point, Pose} from '../domain/geometry';
import {
  openEnds,
  partner,
  placeLayout,
  PlacedLayout,
  SectionEnd,
} from '../domain/layout';
import {
  endPose,
  placeSection,
  PlacedSection,
  Section,
  SectionShape,
  sectionLength,
} from '../domain/section';
import {
  resolveSnap,
  shapeForSnap,
  shapeTo,
  shownSnap,
  Snap,
} from '../domain/snapping';
import {Space} from '../domain/space';
import {toInches} from '../domain/units';
import {renderOverlay, renderStatic, sceneTransform} from '../render/scene';
import {ViewTransform} from '../render/transform';
import {
  anchor,
  EditorState,
  EMPTY,
  extend,
  plantAnchor,
  redo,
  undo,
} from './state';

/** Heading the first section leaves the planted start at. The start carries no
 *  aim of its own, so this is fixed. */
const INITIAL_HEADING = 0;
/** Curve sweeps snap to multiples of this when within SNAP_THRESHOLD of one. */
const SNAP_INCREMENT = degToRad(15);
const SNAP_THRESHOLD = degToRad(5);
/** Pointer pull, in px, onto an open end's point and its tangent/normal lines. */
const POINT_MAGNET_PX = 12;
const LINE_MAGNET_PX = 8;

/**
 * What a release would lay right now, computed once so the preview and the commit
 * agree: the section's `shape` (to commit), that shape placed at the railhead as
 * a `preview` (to draw), the `snap` that shaped it, and the open end it closes
 * onto (a tangent point snap) or null.
 */
interface Draft {
  readonly shape: SectionShape | null;
  readonly preview: PlacedSection | null;
  readonly snap: Snap | null;
  readonly closeOnto: SectionEnd | null;
}

const NOTHING: Draft = {
  shape: null,
  preview: null,
  snap: null,
  closeOnto: null,
};

/** Wires the lay-track tool onto `canvas`, drawing within `space`. */
export function startEditor(
  canvas: HTMLCanvasElement,
  space: Space,
  status: HTMLElement | null
): void {
  paper.setup(canvas);
  let state = EMPTY;
  let pointer: Point | null = null;
  let suspendSnap = false;
  // Section ids come from a monotonic counter held outside the state, so undo
  // and redo never reuse or collide ids.
  let nextSectionId = 0;
  const allocateId = (): string => `s${++nextSectionId}`;

  // Rebuilt per use so it always reflects the current view size, which changes
  // on resize; building it is cheap arithmetic, so there is nothing to cache.
  const transform = (): ViewTransform =>
    sceneTransform(space, paper.view.size.width, paper.view.size.height);

  /**
   * The railhead — the free tail to extend from — or null when there is none.
   * Before any section it is the pending start; otherwise it is the
   * most-recently-added section's exit, the growing tail, unless that exit has
   * been joined (a closed loop), which leaves no railhead and stops drawing. A
   * function of the layout, so undo/redo restore it for free.
   */
  function railhead(placed: PlacedLayout): Pose | null {
    if (state.pendingStart) {
      return state.pendingStart;
    }
    const last = state.layout.sections.at(-1);
    if (!last) {
      return null;
    }
    if (partner(state.layout, {sectionId: last.id, end: 'exit'})) {
      return null;
    }
    return poseOf(placed, {sectionId: last.id, end: 'exit'});
  }

  /**
   * The next section the pointer would lay, with how its target snapped and
   * whether it closes onto an open end — computed together so the preview and the
   * commit agree. Nothing to lay (no pointer, or no railhead) yields a null
   * draft.
   */
  function draft(
    view: ViewTransform,
    railheadPose: Pose | null,
    placed: PlacedLayout
  ): Draft {
    if (!pointer || !railheadPose) {
      return NOTHING;
    }
    const drafted = (shape: SectionShape | null): PlacedSection | null =>
      shape ? placeSection(shape, railheadPose) : null;
    // Suspending snapping (Option/Alt) lays the plain section to the pointer with
    // no snap guides — only the preview.
    if (suspendSnap) {
      const shape = shapeTo(railheadPose, pointer);
      return {shape, preview: drafted(shape), snap: null, closeOnto: null};
    }
    // Pair each open end with its world pose, snap the target onto those poses,
    // then read the latched end straight off the pair — the resolved pose is one
    // of the very objects passed in, so the point snap carries it back by identity.
    const openEndPoses = openEnds(state.layout).map(sectionEnd => ({
      sectionEnd,
      pose: poseOf(placed, sectionEnd),
    }));
    const snap = resolveSnap(
      railheadPose,
      pointer,
      openEndPoses.map(e => e.pose),
      POINT_MAGNET_PX / view.scale,
      LINE_MAGNET_PX / view.scale
    );
    const shape = shapeForSnap(
      railheadPose,
      snap,
      SNAP_INCREMENT,
      SNAP_THRESHOLD
    );
    const closeOnto =
      shape && snap.kind === 'point'
        ? (openEndPoses.find(e => e.pose === snap.end)?.sectionEnd ?? null)
        : null;
    // Show only the snap the section earns — a guide whose line the end lands on.
    return {
      shape,
      preview: drafted(shape),
      snap: shownSnap(railheadPose, snap, shape),
      closeOnto,
    };
  }

  // The two refreshes take the placement rather than each recomputing it, so a
  // frame that redraws both layers places the layout once. placeLayout is cheap
  // pure arithmetic; the cost the layer split avoids is the Paper.js redraw.
  function refreshStatic(view: ViewTransform, placed: PlacedLayout): void {
    renderStatic(view, space, placed);
    if (status) {
      status.textContent = describe(state);
    }
  }

  function refreshOverlay(view: ViewTransform, placed: PlacedLayout): void {
    const railheadPose = railhead(placed);
    const {preview, snap} = draft(view, railheadPose, placed);
    renderOverlay(view, preview, railheadPose, snap);
    paper.view.update();
  }

  function refreshAll(): void {
    const view = transform();
    const placed = placeLayout(state.layout);
    refreshStatic(view, placed);
    refreshOverlay(view, placed);
  }

  const tool = new paper.Tool();
  tool.onMouseMove = (event: paper.ToolEvent) => {
    const view = transform();
    pointer = view.toDomain({x: event.point.x, y: event.point.y});
    refreshOverlay(view, placeLayout(state.layout));
  };
  // Commit on the click's release, not the press — the drawing-tool convention,
  // and it keeps a press-and-drag available as its own gesture.
  tool.onMouseUp = (event: paper.ToolEvent) => {
    const view = transform();
    pointer = view.toDomain({x: event.point.x, y: event.point.y});
    if (!state.pendingStart && state.layout.sections.length === 0) {
      // An empty canvas: plant the anchor the first section grows from.
      state = plantAnchor(state, {position: pointer, heading: INITIAL_HEADING});
    } else {
      // A railhead is the free tail to extend; a tangent point snap closes the
      // section's exit onto an open end, recording the join. Closing the only
      // open end leaves no railhead — drawing simply stops. A run already closed
      // has no railhead and ignores the click.
      const placed = placeLayout(state.layout);
      const railheadPose = railhead(placed);
      if (railheadPose) {
        const {shape, closeOnto} = draft(view, railheadPose, placed);
        if (shape) {
          state = state.pendingStart
            ? anchor(state, withId(shape))
            : extend(state, railheadEnd(), withId(shape), closeOnto);
        }
      }
    }
    refreshAll();
  };

  paper.view.onResize = () => refreshAll();

  // Holding Option/Alt suspends snapping for raw freehand placement.
  const setSuspend = (held: boolean) => {
    if (held !== suspendSnap) {
      suspendSnap = held;
      refreshOverlay(transform(), placeLayout(state.layout));
    }
  };
  window.addEventListener('keydown', event => {
    setSuspend(event.altKey);
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      state = event.shiftKey ? redo(state) : undo(state);
      refreshAll();
    }
  });
  window.addEventListener('keyup', event => setSuspend(event.altKey));

  refreshAll();

  /** The open end to join onto: the most-recently-added section's exit. */
  function railheadEnd(): SectionEnd {
    const last = state.layout.sections.at(-1);
    if (!last) {
      throw new Error('no section to extend from');
    }
    return {sectionId: last.id, end: 'exit'};
  }

  /** Gives `shape` a fresh id, ready to commit into the layout. */
  function withId(shape: SectionShape): Section {
    return {...shape, id: allocateId()};
  }
}

/** The world pose of `end` within a placed layout. */
function poseOf(placed: PlacedLayout, end: SectionEnd): Pose {
  const section = placed.sectionsById.get(end.sectionId);
  if (!section) {
    throw new Error(`end references unplaced section ${end.sectionId}`);
  }
  return endPose(section, end.end);
}

// Modifier keys read by their platform names: ⌥/⌘ on macOS, Alt/Ctrl elsewhere.
// Display only — the handlers already accept both Option/Alt and Cmd/Ctrl.
const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const FREE_DRAW_KEY = isMac ? '⌥' : 'Alt';
const UNDO_KEYS = isMac ? '⌘Z' : 'Ctrl+Z';

function describe(state: EditorState): string {
  const sections = state.layout.sections;
  if (sections.length === 0) {
    return state.pendingStart
      ? `Move and click to lay track. Hold ${FREE_DRAW_KEY} to draw freely. ${UNDO_KEYS} to undo.`
      : 'Click on the sheet to start laying track.';
  }
  const run = sections.reduce(
    (total, section) => total + sectionLength(section),
    0
  );
  const count = sections.length;
  return `${count} section${count === 1 ? '' : 's'} · ${toInches(run).toFixed(1)}″ run · ${UNDO_KEYS} to undo`;
}
