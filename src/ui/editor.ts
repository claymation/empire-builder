/**
 * The lay-track tool's edge: it owns a {@link LayState}, translates Paper.js
 * pointer and keyboard events into pure state transitions, and redraws. All the
 * decision logic lives in ./lay-state; this file is the Paper.js/DOM glue.
 */

import paper from 'paper';
import {Point} from '../domain/geometry';
import {sectionLength} from '../domain/layout';
import {Space} from '../domain/space';
import {toInches} from '../domain/units';
import {drawScene, sceneTransform} from '../render/scene';
import {
  click,
  EMPTY,
  LayState,
  placedSections,
  preview,
  railhead,
  redo,
  undo,
} from './lay-state';

/** Wires the lay-track tool onto `canvas`, drawing within `space`. */
export function startEditor(
  canvas: HTMLCanvasElement,
  space: Space,
  status: HTMLElement | null
): void {
  paper.setup(canvas);
  let state = EMPTY;
  let pointer: Point | null = null;

  const transform = () =>
    sceneTransform(space, paper.view.size.width, paper.view.size.height);
  const toDomain = (point: paper.Point): Point =>
    transform().toDomain({x: point.x, y: point.y});

  function render(): void {
    drawScene(transform(), {
      space,
      sections: placedSections(state),
      preview: pointer ? preview(state, pointer) : null,
      railhead: railhead(state),
    });
    if (status) {
      status.textContent = describe(state);
    }
  }

  const tool = new paper.Tool();
  tool.onMouseMove = (event: paper.ToolEvent) => {
    pointer = toDomain(event.point);
    render();
  };
  tool.onMouseDown = (event: paper.ToolEvent) => {
    pointer = toDomain(event.point);
    state = click(state, pointer);
    render();
  };

  paper.view.onResize = () => render();

  window.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      state = event.shiftKey ? redo(state) : undo(state);
      render();
    }
  });

  render();
}

function describe(state: LayState): string {
  if (state.sections.length === 0) {
    return state.anchor
      ? 'Move and click to lay track. ⌘Z to undo.'
      : 'Click on the sheet to start laying track.';
  }
  const run = state.sections.reduce(
    (total, section) => total + sectionLength(section),
    0
  );
  const count = state.sections.length;
  return `${count} section${count === 1 ? '' : 's'} · ${toInches(run).toFixed(1)}″ run · ⌘Z to undo`;
}
