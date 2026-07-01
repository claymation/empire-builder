/**
 * The lay-track tool's editor state, as a pure value with pure transitions, so
 * the drawing logic can be tested apart from Paper.js and the DOM. The editor
 * edge (./editor) owns an instance, calls these on pointer and keyboard events,
 * and renders the result.
 *
 * The state is the current {@link Layout} plus a transient pending anchor and the
 * history undo/redo walk; the layout itself is the snapshot. {@link dropAnchor}
 * drops the anchor on an empty canvas; {@link anchor} lays the network's first
 * section there, and {@link extend} lays one joined onto an open end. The editor
 * picks between the latter two and computes the section (so snapping applies
 * once); these transitions record history.
 *
 * The pending anchor — a dropped anchor awaiting its first section — is a drawing
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
  /** A dropped anchor awaiting its first section. Transient: never historized. */
  readonly pendingAnchor: Pose | null;
  /** Past layouts, most recent last. */
  readonly past: readonly Layout[];
  /** Undone layouts available to redo, most recent last. */
  readonly future: readonly Layout[];
}

/** The editor before the first click. */
export const EMPTY: EditorState = {
  layout: EMPTY_LAYOUT,
  pendingAnchor: null,
  past: [],
  future: [],
};

/** Drop an anchor (first click): set a pending anchor. No section, no history. */
export function dropAnchor(state: EditorState, pose: Pose): EditorState {
  return {...state, pendingAnchor: pose};
}

/**
 * Lay the network's first section, anchored by its `A` end at the pending anchor
 * ({@link anchorSection}), which it clears. The prior layout goes to `past` — one
 * undo step — and the redo stack is dropped.
 */
export function anchor(state: EditorState, section: Section): EditorState {
  if (!state.pendingAnchor) {
    throw new Error('anchoring a section requires a pending anchor');
  }
  return commit(
    state,
    anchorSection(state.layout, section, state.pendingAnchor)
  );
}

/**
 * Lay `section` joined onto open end `at` ({@link joinSection}), optionally
 * closing its `B` end onto `closeOnto`. The prior layout goes to `past` — one undo
 * step — and the redo stack is dropped.
 */
export function extend(
  state: EditorState,
  at: SectionEnd,
  section: Section,
  closeOnto: SectionEnd | null
): EditorState {
  return commit(state, joinSection(state.layout, at, section, closeOnto));
}

/**
 * Make `layout` current: push the prior one onto the undo stack, clear the
 * pending anchor, and drop the redo stack.
 */
function commit(state: EditorState, layout: Layout): EditorState {
  return {
    layout,
    pendingAnchor: null,
    past: [...state.past, state.layout],
    future: [],
  };
}

/**
 * Restore the previous layout, clearing any pending anchor. With nothing
 * historized — including a lone pending anchor — there is nothing to undo.
 */
export function undo(state: EditorState): EditorState {
  const previous = state.past.at(-1);
  if (!previous) {
    return state;
  }
  return {
    layout: previous,
    pendingAnchor: null,
    past: state.past.slice(0, -1),
    future: [...state.future, state.layout],
  };
}

/** Re-apply the most recently undone layout, clearing any pending anchor. */
export function redo(state: EditorState): EditorState {
  const next = state.future.at(-1);
  if (!next) {
    return state;
  }
  return {
    layout: next,
    pendingAnchor: null,
    past: [...state.past, state.layout],
    future: state.future.slice(0, -1),
  };
}
