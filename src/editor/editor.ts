/**
 * The lay-track tool's edge: it owns an {@link EditorState}, translates Paper.js
 * pointer and keyboard events into pure state transitions, and redraws. All the
 * decision logic lives in ./state, ./preview, and ../domain; this file is the
 * Paper.js/DOM glue.
 */

import paper from 'paper';
import {Point, Pose, reversePose} from '../domain/geometry';
import {
  openEnds,
  openEndPoses,
  placeLayout,
  PlacedLayout,
  poseOf,
} from '../domain/layout';
import {Section, SectionShape, sectionLength} from '../domain/section';
import {Space} from '../domain/space';
import {toInches} from '../domain/units';
import {renderLayout, renderOverlay, sceneTransform} from '../render/scene';
import {ViewTransform} from '../render/transform';
import {computePreview, Preview} from './preview';
import {
  anchor,
  deselect,
  dropAnchor,
  EditorState,
  EMPTY,
  extend,
  redo,
  selectRailhead,
  undo,
} from './state';

/** Heading a network's first section leaves its anchor at. An anchor carries
 *  no aim of its own, so every network starts the same way — first sections
 *  laid from two dropped anchors are parallel by construction. */
const INITIAL_HEADING = 0;

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

  // The current layout, placed. Re-derived only when a transition changed the
  // layout — the linear cost of placing the whole graph, paid once per edit.
  // Pointer moves and the selection transitions (select, deselect, drop an
  // anchor) leave the layout untouched and reuse this.
  let placed: PlacedLayout = placeLayout(state.layout);
  function setState(next: EditorState): void {
    if (next.layout !== state.layout) {
      placed = placeLayout(next.layout);
    }
    state = next;
  }

  /**
   * The railhead pose — where the next section grows from — or null when there
   * is none. Before any section it is the pending anchor (a pose, not yet an
   * open end); otherwise it is the selected railhead, placed and reversed: an
   * end's pose faces into its section, and drawing extends away from it.
   */
  function railheadPose(): Pose | null {
    if (state.pendingAnchor) {
      return state.pendingAnchor;
    }
    return state.railhead ? reversePose(poseOf(placed, state.railhead)) : null;
  }

  /**
   * What the next click would do (see {@link Preview}): the single funnel from
   * the editor's context — railhead, pointer, open ends, view scale, snap
   * suspension — into the pure {@link computePreview}. The overlay and the
   * click routing both read this one decision, which is what keeps what is
   * drawn and what a click does in agreement.
   */
  function preview(view: ViewTransform): Preview {
    return computePreview(
      railheadPose(),
      pointer,
      openEndPoses(state.layout, placed),
      view.scale,
      suspendSnap
    );
  }

  /** Every open end's position, each ringed as a clickable affordance. */
  function openEndPoints(): Point[] {
    return openEndPoses(state.layout, placed).map(({pose}) => pose.position);
  }

  function refreshLayout(view: ViewTransform): void {
    renderLayout(view, space, placed, openEndPoints());
  }

  function refreshOverlay(view: ViewTransform): void {
    const {railhead: from, ghost, snap, hover} = preview(view);
    renderOverlay(
      view,
      ghost,
      from,
      state.railhead ? poseOf(placed, state.railhead).position : null,
      snap,
      hover ? poseOf(placed, hover).position : null
    );
  }

  function refreshStatus(): void {
    if (status) {
      status.textContent = describe(state);
    }
  }

  // refresh* each re-sync one output from current state: the two canvas
  // layers and the DOM status line. Flushing the canvas (paper.view.update)
  // is a separate step each frame ends with, so it is not tied to which
  // layer happens to draw last.
  function refreshAll(): void {
    const view = transform();
    refreshLayout(view);
    refreshOverlay(view);
    refreshStatus();
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
    // Route the click by the same preview the overlay drew: a hovered ring
    // selects that end; a shape lays it — from the pending anchor as a new
    // network, or extended from the railhead, a latched end snap closing the
    // join. With nothing to select or lay and no railhead, the click drops
    // the anchor a new network grows from.
    const {shape, closeOnto, hover} = preview(view);
    if (hover) {
      setState(selectRailhead(state, hover));
    } else if (shape) {
      if (state.pendingAnchor) {
        setState(anchor(state, withId(shape)));
      } else if (state.railhead) {
        setState(extend(state, state.railhead, withId(shape), closeOnto));
      }
    } else if (!state.railhead) {
      setState(
        dropAnchor(state, {position: pointer, heading: INITIAL_HEADING})
      );
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
    if (event.key === 'Escape') {
      setState(deselect(state));
      refreshAll();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      setState(event.shiftKey ? redo(state) : undo(state));
      refreshAll();
    }
  });
  window.addEventListener('keyup', event => setSuspend(event.altKey));

  refreshAll();

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
  const summary = `${count} section${count === 1 ? '' : 's'} · ${toInches(run).toFixed(1)}″ run · ${UNDO_KEYS} to undo`;
  if (state.railhead || state.pendingAnchor) {
    return summary;
  }
  // Nothing selected: point at the gestures that resume or start anew.
  return openEnds(state.layout).length > 0
    ? `${summary} · Click an open end to resume, or click empty space to start new track.`
    : `${summary} · Click empty space to start new track.`;
}
