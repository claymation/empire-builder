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
  placedSections,
  placeSection,
  railhead,
  resolveSnap,
  RouteSection,
  sectionForSnap,
  sectionLength,
  sectionTo,
  shownSnap,
  Snap,
} from '../domain/layout';
import {Space} from '../domain/space';
import {toInches} from '../domain/units';
import {renderOverlay, renderStatic, sceneTransform} from '../render/scene';
import {ViewTransform} from '../render/transform';
import {append, EditorState, EMPTY, redo, start, undo} from './state';

/** Direction the first section leaves the start point until drag-to-aim exists. */
const INITIAL_HEADING = 0;
/** Curve sweeps snap to multiples of this when within SNAP_THRESHOLD of one. */
const SNAP_INCREMENT = degToRad(15);
const SNAP_THRESHOLD = degToRad(5);
/** Pointer pull, in px, onto an open end's point and its tangent/normal lines. */
const POINT_MAGNET_PX = 12;
const LINE_MAGNET_PX = 8;

/** What a release would lay right now: the section, and the snap that shaped it. */
interface PendingSection {
  readonly section: RouteSection | null;
  readonly snap: Snap | null;
}

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

  // Rebuilt per use so it always reflects the current view size, which changes
  // on resize; building it is cheap arithmetic, so there is nothing to cache.
  const transform = (): ViewTransform =>
    sceneTransform(space, paper.view.size.width, paper.view.size.height);

  /**
   * The next section the pointer would lay, with how its target snapped —
   * computed together so the snap shown in the preview is the one that gets
   * laid. Nulls when there is nothing to lay (no pointer yet, or no railhead).
   */
  function draft(view: ViewTransform, railEnd: Pose | null): PendingSection {
    if (!pointer || !railEnd) {
      return {section: null, snap: null};
    }
    // Suspending snapping (Option/Alt) lays the plain section to the pointer and
    // shows no feedback. Otherwise the target snaps to the open ends, falling
    // back to the angle snap, and sectionForSnap turns that snap into the section.
    if (suspendSnap) {
      return {section: sectionTo(railEnd, pointer), snap: null};
    }
    const snap = resolveSnap(
      railEnd,
      pointer,
      openEnds(state.layout),
      POINT_MAGNET_PX / view.scale,
      LINE_MAGNET_PX / view.scale
    );
    const section = sectionForSnap(
      railEnd,
      snap,
      SNAP_INCREMENT,
      SNAP_THRESHOLD
    );
    // Show only the snap the section earns — a guide whose line the end lands on.
    return {section, snap: shownSnap(railEnd, snap, section)};
  }

  function refreshStatic(view: ViewTransform): void {
    renderStatic(view, space, placedSections(state.layout));
    if (status) {
      status.textContent = describe(state);
    }
  }

  function refreshOverlay(view: ViewTransform): void {
    const railEnd = railhead(state.layout);
    const {section, snap} = draft(view, railEnd);
    const preview = railEnd && section ? placeSection(railEnd, section) : null;
    renderOverlay(view, preview, railEnd, snap);
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
  // Commit on the click's release, the convention for drawing tools — it leaves
  // press-and-drag free for a future drag-to-aim gesture.
  tool.onMouseUp = (event: paper.ToolEvent) => {
    const view = transform();
    pointer = view.toDomain({x: event.point.x, y: event.point.y});
    const railEnd = railhead(state.layout);
    if (!railEnd) {
      state = start(state, {position: pointer, heading: INITIAL_HEADING});
    } else {
      const {section} = draft(view, railEnd);
      if (section) {
        state = append(state, section);
      }
    }
    refreshStatic(view);
    refreshOverlay(view);
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
}

// Modifier keys read by their platform names: ⌥/⌘ on macOS, Alt/Ctrl elsewhere.
// Display only — the handlers already accept both Option/Alt and Cmd/Ctrl.
const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const FREE_DRAW_KEY = isMac ? '⌥' : 'Alt';
const UNDO_KEYS = isMac ? '⌘Z' : 'Ctrl+Z';

function describe(state: EditorState): string {
  const sections = state.layout.sections;
  if (sections.length === 0) {
    return state.layout.anchor
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
