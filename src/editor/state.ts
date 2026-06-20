/**
 * The lay-track tool's editor state, as a pure value with pure transitions, so
 * the drawing logic can be tested apart from Paper.js and the DOM. The editor
 * edge (./editor) owns an instance, calls these on pointer and keyboard events,
 * and renders the result.
 *
 * The state is the current {@link Layout} plus the history undo/redo walk; the
 * layout itself is the snapshot. {@link start} places the anchor on an empty
 * canvas; {@link append} commits a section onto the railhead. The editor decides
 * which to call and computes the section (so snapping applies once); these
 * transitions just record history.
 */

import {Pose} from '../domain/geometry';
import {EMPTY_LAYOUT, Layout, RouteSection} from '../domain/layout';

export interface EditorState {
  readonly layout: Layout;
  /** Past layouts, most recent last. */
  readonly past: readonly Layout[];
  /** Undone layouts available to redo, most recent last. */
  readonly future: readonly Layout[];
}

/** The editor before the first click. */
export const EMPTY: EditorState = {layout: EMPTY_LAYOUT, past: [], future: []};

/** Begins a layout by placing the anchor at `pose`. */
export function start(state: EditorState, pose: Pose): EditorState {
  return commit(state, {anchor: pose, sections: []});
}

/** Commits `section` onto the railhead, extending the run. */
export function append(state: EditorState, section: RouteSection): EditorState {
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
