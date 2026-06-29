/**
 * The lay-track tool's edge: it owns an {@link EditorState}, translates Paper.js
 * pointer and keyboard events into pure state transitions, and redraws. All the
 * decision logic lives in ./state and ../domain; this file is the Paper.js/DOM
 * glue.
 */

import paper from 'paper';
import {degToRad, Point, Pose} from '../domain/geometry';
import {
  Layout,
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
  dropAnchor,
  EditorState,
  EMPTY,
  extend,
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
 * What a release would lay right now, computed in one place so the preview and
 * the commit agree: the `railhead` it lays from, the section's `shape` (to
 * commit), that shape placed as a `preview` (to draw), the `snap` that shaped it,
 * and the open end it closes onto (a tangent point snap) or null.
 */
interface Draft {
  readonly railhead: Pose | null;
  readonly shape: SectionShape | null;
  readonly preview: PlacedSection | null;
  readonly snap: Snap | null;
  readonly closeOnto: SectionEnd | null;
}

const NOTHING: Draft = {
  railhead: null,
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

  // The placed layout, memoized on the layout it derives from. The layout is
  // immutable and replaced wholesale on every transition, so an identity miss is
  // exactly when the placement is stale. A pointer move leaves the layout
  // untouched, so it reuses the cache instead of re-threading the whole graph.
  let placedCache: {layout: Layout; placed: PlacedLayout} | null = null;
  function placedLayout(): PlacedLayout {
    if (!placedCache || placedCache.layout !== state.layout) {
      placedCache = {layout: state.layout, placed: placeLayout(state.layout)};
    }
    return placedCache.placed;
  }

  /**
   * The railhead — the free tail to extend from — or null when there is none.
   * Before any section it is the pending anchor; otherwise it is the
   * most-recently-added section's exit, the growing tail, unless that exit has
   * been joined (a closed loop), which leaves no railhead and stops drawing. A
   * function of the layout, so undo/redo restore it for free.
   */
  function railheadOf(placed: PlacedLayout): Pose | null {
    if (state.pendingAnchor) {
      return state.pendingAnchor;
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
   * What the pointer would lay right now (see {@link Draft}). It derives the
   * railhead itself from the placed layout, so callers need only hand it the
   * view; with no pointer or no railhead there is nothing to lay.
   */
  function draft(view: ViewTransform): Draft {
    const placed = placedLayout();
    const railhead = railheadOf(placed);
    if (!pointer || !railhead) {
      return NOTHING;
    }
    let shape: SectionShape | null;
    let snap: Snap | null;
    let closeOnto: SectionEnd | null;
    if (suspendSnap) {
      // Suspending snapping (Option/Alt) lays the plain section to the pointer,
      // with no open-end snap and no guides.
      shape = shapeTo(railhead, pointer);
      snap = null;
      closeOnto = null;
    } else {
      const ends = openEnds(state.layout);
      const resolved = resolveSnap(
        railhead,
        pointer,
        ends.map(end => poseOf(placed, end)),
        POINT_MAGNET_PX / view.scale,
        LINE_MAGNET_PX / view.scale
      );
      shape = shapeForSnap(railhead, resolved, SNAP_INCREMENT, SNAP_THRESHOLD);
      // A point snap names the open end it latched onto by index; closing onto
      // that end records the join.
      closeOnto =
        shape && resolved.kind === 'point' ? ends[resolved.endIndex] : null;
      // Show only the snap the section earns — a guide whose line the end lands on.
      snap = shownSnap(railhead, resolved, shape);
    }
    return {
      railhead,
      shape,
      preview: shape ? placeSection(shape, railhead) : null,
      snap,
      closeOnto,
    };
  }

  function refreshStatic(view: ViewTransform): void {
    renderStatic(view, space, placedLayout());
    if (status) {
      status.textContent = describe(state);
    }
  }

  function refreshOverlay(view: ViewTransform): void {
    const {railhead, preview, snap} = draft(view);
    renderOverlay(view, preview, railhead, snap);
    paper.view.update();
  }

  function refreshAll(): void {
    const view = transform();
    refreshStatic(view);
    refreshOverlay(view);
  }

  const tool = new paper.Tool();
  tool.onMouseMove = (event: paper.ToolEvent) => {
    const view = transform();
    pointer = view.toDomain({x: event.point.x, y: event.point.y});
    refreshOverlay(view);
  };
  // Commit on the click's release, not the press — the drawing-tool convention,
  // and it keeps a press-and-drag available as its own gesture.
  tool.onMouseUp = (event: paper.ToolEvent) => {
    const view = transform();
    pointer = view.toDomain({x: event.point.x, y: event.point.y});
    if (!state.pendingAnchor && state.layout.sections.length === 0) {
      // An empty canvas: drop the anchor the first section grows from.
      state = dropAnchor(state, {position: pointer, heading: INITIAL_HEADING});
    } else {
      // The draft lays from the railhead; a tangent point snap closes its exit
      // onto an open end, recording the join. With the loop closed there is no
      // railhead, so the draft has no shape and the click is ignored.
      const {shape, closeOnto} = draft(view);
      if (shape) {
        state = state.pendingAnchor
          ? anchor(state, withId(shape))
          : extend(state, railheadEnd(), withId(shape), closeOnto);
      }
    }
    refreshAll();
  };

  paper.view.onResize = () => refreshAll();

  // Holding Option/Alt suspends snapping for raw freehand placement.
  const setSuspend = (held: boolean) => {
    if (held !== suspendSnap) {
      suspendSnap = held;
      refreshOverlay(transform());
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
    return state.pendingAnchor
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
