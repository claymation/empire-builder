/**
 * The lay-track tool's edge: it owns an {@link EditorState}, translates Paper.js
 * pointer and keyboard events into pure state transitions, and redraws. All the
 * decision logic lives in ./state and ../domain; this file is the Paper.js/DOM
 * glue.
 */

import paper from 'paper';
import {degToRad, Point, Pose} from '../domain/geometry';
import {
  openEndPoses,
  partner,
  placeLayout,
  PlacedLayout,
  poseOf,
  SectionEnd,
} from '../domain/layout';
import {
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
 * What the next click would lay, computed in one place so the on-screen ghost
 * and the commit agree: the `railhead` it lays from, the section's `shape` (to
 * commit), that shape placed as a `ghost` (the dashed preview drawn under the
 * pointer), the `snap` that shaped it, and the open end it closes onto, or null.
 */
interface Preview {
  readonly railhead: Pose | null;
  readonly shape: SectionShape | null;
  readonly ghost: PlacedSection | null;
  readonly snap: Snap | null;
  readonly closeOnto: SectionEnd | null;
}

const NOTHING: Preview = {
  railhead: null,
  shape: null,
  ghost: null,
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

  // The current layout, placed. Advancing the state is the one place the layout
  // changes, so it is the one place to re-place — paying the linear cost of
  // placing the whole graph once per edit, never on a pointer move (which leaves
  // the layout untouched and reuses this).
  let placed: PlacedLayout = placeLayout(state.layout);
  function setState(next: EditorState): void {
    state = next;
    placed = placeLayout(state.layout);
  }

  /**
   * The railhead — the free tail to extend from — or null when there is none.
   * Before any section it is the pending anchor; otherwise it is the
   * most-recently-added section's exit, the growing tail, unless that exit has
   * been joined (a closed loop), which leaves no railhead and stops drawing. A
   * function of the layout, so undo/redo restore it for free.
   */
  function railhead(): Pose | null {
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
   * What the next click would lay (see {@link Preview}); with no pointer or no
   * railhead there is nothing to lay.
   */
  function preview(view: ViewTransform): Preview {
    const from = railhead();
    if (!pointer || !from) {
      return NOTHING;
    }
    let shape: SectionShape | null;
    let snap: Snap | null;
    let closeOnto: SectionEnd | null;
    if (suspendSnap) {
      // Suspending snapping (Option/Alt) lays the plain section to the pointer,
      // with no open-end snap and no guides.
      shape = shapeTo(from, pointer);
      snap = null;
      closeOnto = null;
    } else {
      const resolved = resolveSnap(
        from,
        pointer,
        openEndPoses(state.layout, placed),
        POINT_MAGNET_PX / view.scale,
        LINE_MAGNET_PX / view.scale
      );
      shape = shapeForSnap(from, resolved, SNAP_INCREMENT, SNAP_THRESHOLD);
      // An end snap names the open end it latched onto (it is only offered when a
      // section can reach it, so there is always a shape); closing onto it records
      // the join.
      closeOnto = resolved.kind === 'end' ? resolved.end : null;
      // Show only the snap the section earns — a guide whose line the end lands on.
      snap = shownSnap(from, resolved, shape);
    }
    return {
      railhead: from,
      shape,
      ghost: shape ? placeSection(shape, from) : null,
      snap,
      closeOnto,
    };
  }

  function refreshStatic(view: ViewTransform): void {
    renderStatic(view, space, placed);
    if (status) {
      status.textContent = describe(state);
    }
  }

  function refreshOverlay(view: ViewTransform): void {
    const {railhead: from, ghost, snap} = preview(view);
    renderOverlay(view, ghost, from, snap);
  }

  // refresh* build the Paper.js scene graph; flushing it to the canvas
  // (paper.view.update) is a separate step each frame ends with, so it is not
  // tied to which layer happens to draw last.
  function refreshAll(): void {
    const view = transform();
    refreshStatic(view);
    refreshOverlay(view);
    paper.view.update();
  }

  const tool = new paper.Tool();
  tool.onMouseMove = (event: paper.ToolEvent) => {
    const view = transform();
    pointer = view.toDomain({x: event.point.x, y: event.point.y});
    refreshOverlay(view);
    paper.view.update();
  };
  // Commit on the click's release, not the press — the drawing-tool convention,
  // and it keeps a press-and-drag available as its own gesture.
  tool.onMouseUp = (event: paper.ToolEvent) => {
    const view = transform();
    pointer = view.toDomain({x: event.point.x, y: event.point.y});
    if (!state.pendingAnchor && state.layout.sections.length === 0) {
      // An empty canvas: drop the anchor the first section grows from.
      setState(
        dropAnchor(state, {position: pointer, heading: INITIAL_HEADING})
      );
    } else {
      // The preview lays from the railhead; a tangent end snap closes its exit
      // onto an open end, recording the join. With the loop closed there is no
      // railhead, so the preview has no shape and the click is ignored.
      const {shape, closeOnto} = preview(view);
      if (shape) {
        setState(
          state.pendingAnchor
            ? anchor(state, withId(shape))
            : extend(state, railheadEnd(), withId(shape), closeOnto)
        );
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
      paper.view.update();
    }
  };
  window.addEventListener('keydown', event => {
    setSuspend(event.altKey);
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      setState(event.shiftKey ? redo(state) : undo(state));
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
