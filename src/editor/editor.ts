/**
 * The lay-track tool's edge: it owns an {@link EditorState}, translates Paper.js
 * pointer and keyboard events into pure state transitions, and redraws. All the
 * decision logic lives in ./state and ../domain; this file is the Paper.js/DOM
 * glue.
 */

import paper from 'paper';
import {degToRad, Point, Pose} from '../domain/geometry';
import {
  placedSections,
  placeSection,
  railhead,
  RouteSection,
  sectionLength,
  snappedSectionTo,
  tangentSectionTo,
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

  // The section the pointer would lay next, snapped to a tidy angle unless
  // snapping is suspended. Computed once and used for both preview and commit.
  function nextSection(head: Pose): RouteSection | null {
    if (!pointer) {
      return null;
    }
    return suspendSnap
      ? tangentSectionTo(head, pointer)
      : snappedSectionTo(head, pointer, SNAP_INCREMENT, SNAP_THRESHOLD);
  }

  function refreshStatic(view: ViewTransform): void {
    renderStatic(view, space, placedSections(state.layout));
    if (status) {
      status.textContent = describe(state);
    }
  }

  function refreshOverlay(view: ViewTransform): void {
    const head = railhead(state.layout);
    const section = head ? nextSection(head) : null;
    const preview = head && section ? placeSection(head, section) : null;
    renderOverlay(view, preview, head);
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
    const head = railhead(state.layout);
    if (!head) {
      state = start(state, {position: pointer, heading: INITIAL_HEADING});
    } else {
      const section = nextSection(head);
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

function describe(state: EditorState): string {
  const sections = state.layout.sections;
  if (sections.length === 0) {
    return state.layout.anchor
      ? 'Move and click to lay track. Hold ⌥ to draw freely. ⌘Z to undo.'
      : 'Click on the sheet to start laying track.';
  }
  const run = sections.reduce(
    (total, section) => total + sectionLength(section),
    0
  );
  const count = sections.length;
  return `${count} section${count === 1 ? '' : 's'} · ${toInches(run).toFixed(1)}″ run · ⌘Z to undo`;
}
