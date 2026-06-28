/**
 * The lay-track tool's editor state, as a pure value with pure transitions, so
 * the drawing logic can be tested apart from Paper.js and the DOM. The editor
 * edge (./editor) owns an instance, calls these on pointer and keyboard events,
 * and renders the result.
 *
 * The state is the current {@link Layout} plus a transient pending start and the
 * history undo/redo walk; the layout itself is the snapshot. {@link start} plants
 * the origin on an empty canvas; {@link commit} lays a section — the network's
 * first, or one joined onto an open end. The editor decides which and computes
 * the section (so snapping applies once); these transitions record history.
 *
 * The pending start — a planted origin awaiting its first section — is a drawing
 * transient, not a fact about the plan, so it lives here, not in the layout, and
 * is never recorded in history. Only a layout change is undoable.
 */

import {Pose} from '../domain/geometry';
import {
  anchorSection,
  EMPTY_LAYOUT,
  joinSection,
  Layout,
  SectionEnd,
} from '../domain/layout';
import {Section} from '../domain/section';

export interface EditorState {
  readonly layout: Layout;
  /** A planted origin awaiting its first section. Transient: never historized. */
  readonly pendingStart: Pose | null;
  /** Past layouts, most recent last. */
  readonly past: readonly Layout[];
  /** Undone layouts available to redo, most recent last. */
  readonly future: readonly Layout[];
}

/** The editor before the first click. */
export const EMPTY: EditorState = {
  layout: EMPTY_LAYOUT,
  pendingStart: null,
  past: [],
  future: [],
};

/** Plant the origin (first click): set a pending start. No section, no history. */
export function start(state: EditorState, pose: Pose): EditorState {
  return {...state, pendingStart: pose};
}

/**
 * Commit `section`. With a start pending it becomes a new network's first
 * section ({@link anchorSection} at the pending pose), clearing the pending
 * start; otherwise it joins onto open end `at` ({@link joinSection}), optionally
 * closing onto `closeOnto`. Either way the prior layout goes to `past` — one undo
 * step — and the redo stack is dropped.
 */
export function commit(
  state: EditorState,
  at: SectionEnd | null,
  section: Section,
  closeOnto: SectionEnd | null
): EditorState {
  let layout: Layout;
  if (state.pendingStart) {
    layout = anchorSection(state.layout, section, state.pendingStart);
  } else {
    if (!at) {
      throw new Error('joining a section requires an open end to join onto');
    }
    layout = joinSection(state.layout, at, section, closeOnto ?? undefined);
  }
  return {
    layout,
    pendingStart: null,
    past: [...state.past, state.layout],
    future: [],
  };
}

/**
 * Restore the previous layout, clearing any pending start. With nothing
 * historized — including a lone pending start — there is nothing to undo.
 */
export function undo(state: EditorState): EditorState {
  const previous = state.past.at(-1);
  if (!previous) {
    return state;
  }
  return {
    layout: previous,
    pendingStart: null,
    past: state.past.slice(0, -1),
    future: [...state.future, state.layout],
  };
}

/** Re-apply the most recently undone layout, clearing any pending start. */
export function redo(state: EditorState): EditorState {
  const next = state.future.at(-1);
  if (!next) {
    return state;
  }
  return {
    layout: next,
    pendingStart: null,
    past: [...state.past, state.layout],
    future: state.future.slice(0, -1),
  };
}
