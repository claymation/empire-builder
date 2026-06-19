/**
 * The lay-track tool's edge: it owns an {@link EditorState}, translates Paper.js
 * pointer and keyboard events into pure state transitions, and redraws. All the
 * decision logic lives in ./state and ../domain; this file is the Paper.js/DOM
 * glue.
 */

import paper from 'paper';
import {Point, Pose} from '../domain/geometry';
import {
  placedSections,
  placeSection,
  PlacedSection,
  railhead,
  sectionLength,
  tangentSectionTo,
} from '../domain/layout';
import {Space} from '../domain/space';
import {toInches} from '../domain/units';
import {drawOverlay, drawStatic, sceneTransform} from '../render/scene';
import {ViewTransform} from '../render/transform';
import {click, EditorState, EMPTY, redo, undo} from './state';

/** Wires the lay-track tool onto `canvas`, drawing within `space`. */
export function startEditor(
  canvas: HTMLCanvasElement,
  space: Space,
  status: HTMLElement | null
): void {
  paper.setup(canvas);
  let state = EMPTY;
  let pointer: Point | null = null;

  // Rebuilt per use so it always reflects the current view size, which changes
  // on resize; building it is cheap arithmetic, so there is nothing to cache.
  const transform = (): ViewTransform =>
    sceneTransform(space, paper.view.size.width, paper.view.size.height);

  // The sheet and committed track; redraw only when the track or view changes.
  function renderStatic(view: ViewTransform): void {
    drawStatic(view, space, placedSections(state.layout));
    if (status) {
      status.textContent = describe(state);
    }
  }

  // The preview and railhead; cheap to redraw on every pointer move.
  function renderOverlay(view: ViewTransform): void {
    const head = railhead(state.layout);
    const preview = head && pointer ? previewSection(head, pointer) : null;
    drawOverlay(view, preview, head);
    paper.view.update();
  }

  function renderAll(): void {
    const view = transform();
    renderStatic(view);
    renderOverlay(view);
  }

  const tool = new paper.Tool();
  tool.onMouseMove = (event: paper.ToolEvent) => {
    const view = transform();
    pointer = view.toDomain({x: event.point.x, y: event.point.y});
    renderOverlay(view);
  };
  // Commit on the click's release, the convention for drawing tools — it leaves
  // press-and-drag free for a future drag-to-aim gesture.
  tool.onMouseUp = (event: paper.ToolEvent) => {
    const view = transform();
    pointer = view.toDomain({x: event.point.x, y: event.point.y});
    state = click(state, pointer);
    renderStatic(view);
    renderOverlay(view);
  };

  paper.view.onResize = () => renderAll();

  window.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      state = event.shiftKey ? redo(state) : undo(state);
      renderAll();
    }
  });

  renderAll();
}

/** The section the pointer would lay next, placed at the railhead, or null. */
function previewSection(head: Pose, pointer: Point): PlacedSection | null {
  const section = tangentSectionTo(head, pointer);
  return section ? placeSection(head, section) : null;
}

function describe(state: EditorState): string {
  const sections = state.layout.sections;
  if (sections.length === 0) {
    return state.layout.anchor
      ? 'Move and click to lay track. ⌘Z to undo.'
      : 'Click on the sheet to start laying track.';
  }
  const run = sections.reduce(
    (total, section) => total + sectionLength(section),
    0
  );
  const count = sections.length;
  return `${count} section${count === 1 ? '' : 's'} · ${toInches(run).toFixed(1)}″ run · ⌘Z to undo`;
}
