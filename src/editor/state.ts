/**
 * The lay-track tool's editor state, as a pure value with pure transitions, so
 * the drawing logic can be tested apart from Paper.js and the DOM. The editor
 * edge (./editor) owns an instance, calls these on pointer and keyboard events,
 * and renders the result.
 *
 * The state is the current {@link Layout} plus the history undo/redo walk; the
 * layout itself is the snapshot. Drawing starts when the user clicks an empty
 * canvas, which places the anchor; each later click commits the section the
 * pointer is previewing, extending the run from its open end (the railhead).
 */

import {Point} from '../domain/geometry';
import {
  EMPTY_LAYOUT,
  Layout,
  railhead,
  tangentSectionTo,
} from '../domain/layout';

export interface EditorState {
  readonly layout: Layout;
  /** Past layouts, most recent last. */
  readonly past: readonly Layout[];
  /** Undone layouts available to redo, most recent last. */
  readonly future: readonly Layout[];
}

/** The editor before the first click. */
export const EMPTY: EditorState = {layout: EMPTY_LAYOUT, past: [], future: []};

/** Direction the first section leaves the start point until drag-to-aim exists. */
const INITIAL_HEADING = 0;

/**
 * Applies a click at `pointer`: places the anchor if drawing hasn't started,
 * otherwise commits the previewed section. A click with no committable section
 * (the pointer is at or behind the railhead) leaves the state unchanged.
 */
export function click(state: EditorState, pointer: Point): EditorState {
  const head = railhead(state.layout);
  if (!head) {
    return commit(state, {
      anchor: {position: pointer, heading: INITIAL_HEADING},
      sections: [],
    });
  }
  const section = tangentSectionTo(head, pointer);
  if (!section) {
    return state;
  }
  return commit(state, {
    ...state.layout,
    sections: [...state.layout.sections, section],
  });
}

/** Restores the previous layout, if any. */
export function undo(state: EditorState): EditorState {
  const previous = state.past.at(-1);
  if (!previous) {
    return state;
  }
  return {
    layout: previous,
    past: state.past.slice(0, -1),
    future: [...state.future, state.layout],
  };
}

/** Re-applies the most recently undone layout, if any. */
export function redo(state: EditorState): EditorState {
  const next = state.future.at(-1);
  if (!next) {
    return state;
  }
  return {
    layout: next,
    past: [...state.past, state.layout],
    future: state.future.slice(0, -1),
  };
}

/** Moves to `layout`, recording the current one for undo and clearing redo. */
function commit(state: EditorState, layout: Layout): EditorState {
  return {layout, past: [...state.past, state.layout], future: []};
}
