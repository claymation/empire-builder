/**
 * The editor's edge: it owns an {@link EditorState}, translates Paper.js
 * pointer and keyboard events into pure state transitions, and redraws. All the
 * decision logic lives in ./state, ./preview, and ../domain; this file is the
 * Paper.js/DOM glue.
 */

import paper from 'paper';
import {Point, reversePose} from '../lib/geometry';
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
import {computePreview, DrawOrigin, Preview} from './preview';
import {
  deselect,
  dropAnchor,
  EditorState,
  EMPTY_STATE,
  extend,
  startNetwork,
  redo,
  selectRailhead,
  undo,
} from './state';

/** Wires the editor onto `canvas`, drawing within `space`. */
export function startEditor(
  canvas: HTMLCanvasElement,
  space: Space,
  status: HTMLElement | null
): void {
  paper.setup(canvas);
  // The editor state; every change goes through setState.
  let state = EMPTY_STATE;
  // The pointer's last known domain position; null until it enters the canvas.
  let pointer: Point | null = null;
  // Snapping suspended (Option/Alt held) for raw freehand placement.
  let snapSuspended = false;
  // The heading a pending anchor's aim is locked to (Shift held), so the
  // pointer can move off-axis to shape a curve; null while the aim follows
  // the pointer. Held-modifier state, a sibling of snapSuspended — it lives at
  // this edge, not in EditorState, which keeps the pending anchor a bare
  // position and records a heading only when a section commits, so every
  // committed heading is the previewed one.
  let lockedHeading: number | null = null;
  // Section ids come from a monotonic counter held outside the state, so undo
  // and redo never reuse or collide ids.
  let nextSectionId = 0;
  const allocateId = (): string => `s${++nextSectionId}`;

  // Rebuilt per use so it always reflects the current view size, which changes
  // on resize; building it is cheap arithmetic, so there is nothing to cache.
  const computeTransform = (): ViewTransform =>
    sceneTransform(space, paper.view.size.width, paper.view.size.height);

  // The current layout, placed. Re-derived only when a transition changed the
  // layout — the linear cost of placing the whole graph, paid once per edit.
  // Pointer moves and the selection transitions (select, deselect, drop an
  // anchor) leave the layout untouched and reuse this.
  let placedLayout: PlacedLayout = placeLayout(state.layout);
  function setState(newState: EditorState): void {
    if (newState.layout !== state.layout) {
      placedLayout = placeLayout(newState.layout);
    }
    state = newState;
    // Any transition ends the aim in progress: the lock belongs to the
    // pending anchor it was captured over.
    lockedHeading = null;
  }

  /**
   * Where drawing grows from (see {@link DrawOrigin}), or null when nothing is
   * selected. A pending anchor aims — or, with the heading locked, stands as a
   * full pose. A selected railhead is placed and reversed: an end's pose faces
   * into its section, and drawing extends away from it.
   */
  function drawOrigin(): DrawOrigin | null {
    if (state.pendingAnchor) {
      return lockedHeading !== null
        ? {
            kind: 'pose',
            pose: {position: state.pendingAnchor, heading: lockedHeading},
          }
        : {kind: 'point', position: state.pendingAnchor};
    }
    return state.railhead
      ? {kind: 'pose', pose: reversePose(poseOf(placedLayout, state.railhead))}
      : null;
  }

  /**
   * What the next click would do (see {@link Preview}): the single funnel from
   * the editor's context — draw origin, pointer, open ends, view scale, snap
   * suspension — into the pure {@link computePreview}. The overlay and the
   * click routing both read this one decision, which is what keeps what is
   * drawn and what a click does in agreement.
   */
  function buildPreview(transform: ViewTransform): Preview {
    return computePreview(
      drawOrigin(),
      pointer,
      openEndPoses(state.layout, placedLayout),
      transform.scale,
      snapSuspended
    );
  }

  /** Every open end's position, each ringed as a clickable affordance. */
  function openEndPoints(): Point[] {
    return openEndPoses(state.layout, placedLayout).map(
      ({pose}) => pose.position
    );
  }

  function refreshLayout(transform: ViewTransform): void {
    renderLayout(transform, space, placedLayout, openEndPoints());
  }

  function refreshOverlay(transform: ViewTransform): void {
    const preview = buildPreview(transform);
    // The start's dot and ring mark selection state, not the preview: they
    // show the moment an anchor drops or an end is selected, with the pointer
    // wherever it is.
    // The snap's drawable feedback, projected here so the overlay stays plain
    // draw data: an `angle` snap carries no feature to draw, so both are null.
    renderOverlay(transform, {
      ghost: preview.ghost,
      start:
        state.pendingAnchor ??
        (state.railhead ? poseOf(placedLayout, state.railhead).position : null),
      guide: preview.snap?.kind === 'line' ? preview.snap.line : null,
      seat: preview.snap?.kind === 'end' ? preview.snap.target : null,
      halo: preview.hoveredEnd
        ? poseOf(placedLayout, preview.hoveredEnd).position
        : null,
    });
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
    const transform = computeTransform();
    refreshLayout(transform);
    refreshOverlay(transform);
    refreshStatus();
    paper.view.update();
  }

  const tool = new paper.Tool();
  tool.onMouseMove = (event: paper.ToolEvent) => {
    const transform = computeTransform();
    pointer = transform.toDomain({x: event.point.x, y: event.point.y});
    refreshOverlay(transform);
    paper.view.update();
  };
  // Commit on the click's release, not the press — the drawing-tool convention,
  // and it keeps a press-and-drag available as its own gesture.
  tool.onMouseUp = (event: paper.ToolEvent) => {
    const transform = computeTransform();
    pointer = transform.toDomain({x: event.point.x, y: event.point.y});
    // Route the click by the same preview the overlay drew: a hovered ring
    // selects that end; a shape lays it — from the pending anchor as a new
    // network at the previewed heading, or extended from the railhead, a
    // latched end snap closing the join. With nothing to select or lay,
    // `anchorPoint` — the pointer, pulled onto any guideline — is where the
    // click drops the anchor a new network grows from.
    const preview = buildPreview(transform);
    if (preview.hoveredEnd) {
      setState(selectRailhead(state, preview.hoveredEnd));
    } else if (preview.shape) {
      if (state.pendingAnchor && preview.originPose) {
        setState(
          startNetwork(state, withId(preview.shape), preview.originPose.heading)
        );
      } else if (state.railhead) {
        setState(
          extend(
            state,
            state.railhead,
            withId(preview.shape),
            preview.closeOnto
          )
        );
      }
    } else if (preview.anchorPoint) {
      setState(dropAnchor(state, preview.anchorPoint));
    }
    refreshAll();
  };

  paper.view.onResize = () => refreshAll();

  // Holding Option/Alt suspends snapping for raw freehand placement.
  const setSuspend = (held: boolean) => {
    if (held !== snapSuspended) {
      snapSuspended = held;
      refreshOverlay(computeTransform());
      paper.view.update();
    }
  };
  // Holding Shift locks a pending anchor's aim at its previewed heading, so
  // the pointer can move off-axis to shape the first section into a curve.
  const setHeadingLock = (held: boolean) => {
    if (held === (lockedHeading !== null)) {
      return;
    }
    if (held) {
      if (!state.pendingAnchor) {
        return;
      }
      lockedHeading =
        buildPreview(computeTransform()).originPose?.heading ?? null;
    } else {
      lockedHeading = null;
    }
    refreshOverlay(computeTransform());
    paper.view.update();
  };
  window.addEventListener('keydown', event => {
    setSuspend(event.altKey);
    setHeadingLock(event.shiftKey);
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
  window.addEventListener('keyup', event => {
    setSuspend(event.altKey);
    setHeadingLock(event.shiftKey);
  });

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
const HEADING_LOCK_KEY = isMac ? '⇧' : 'Shift';
const UNDO_KEYS = isMac ? '⌘Z' : 'Ctrl+Z';

function describe(state: EditorState): string {
  const sections = state.layout.sections;
  if (sections.length === 0) {
    return state.pendingAnchor
      ? `Move to aim, click to lay track. Hold ${HEADING_LOCK_KEY} to lock the heading, ${FREE_DRAW_KEY} to draw freely. ${UNDO_KEYS} to undo.`
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
