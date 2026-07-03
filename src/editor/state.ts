/**
 * The lay-track tool's editor state, as a pure value with pure transitions, so
 * the drawing logic can be tested apart from Paper.js and the DOM. The editor
 * edge (./editor) owns an instance, calls these on pointer and keyboard events,
 * and renders the result.
 *
 * The state is the current {@link Layout}, the selected railhead, a transient
 * pending anchor, and the history undo/redo walk. {@link dropAnchor} drops the
 * anchor on an empty canvas; {@link anchor} lays the network's first section
 * there, {@link extend} lays one joined onto an open end, and
 * {@link selectRailhead} moves drawing to another open end. The editor picks
 * among them and computes the section (so snapping applies once); only the
 * transitions that change the layout record history.
 *
 * The railhead — the selected open end the next section grows from — is the one
 * irreducible piece of selection state the layout cannot express: a chain has
 * two open ends the moment it is drawn, and the choice between them is the
 * user's. The pending anchor — a dropped anchor awaiting its first section — is
 * a drawing transient, not a fact about the plan, so it lives here, not in the
 * layout, and is never recorded in history. At most one of the two is set: both
 * answer "where does the next section grow from".
 */

import {Pose} from '../domain/geometry';
import {
  anchorSection,
  EMPTY_LAYOUT,
  joinSection,
  Layout,
  openEnds,
  otherEnd,
  sameEnd,
  SectionEnd,
} from '../domain/layout';
import {Section} from '../domain/section';

/** One undo step: the layout and the railhead drawing grew from. */
export interface Snapshot {
  readonly layout: Layout;
  readonly railhead: SectionEnd | null;
}

export interface EditorState {
  readonly layout: Layout;
  /** The selected open end the next section grows from; null when none. */
  readonly railhead: SectionEnd | null;
  /** A dropped anchor awaiting its first section. Transient: never historized. */
  readonly pendingAnchor: Pose | null;
  /** Past snapshots, most recent last. */
  readonly past: readonly Snapshot[];
  /** Undone snapshots available to redo, most recent last. */
  readonly future: readonly Snapshot[];
}

/** The editor before the first click. */
export const EMPTY: EditorState = {
  layout: EMPTY_LAYOUT,
  railhead: null,
  pendingAnchor: null,
  past: [],
  future: [],
};

/**
 * Drop an anchor (first click): set a pending anchor, clearing any selected
 * railhead. No section, no history.
 */
export function dropAnchor(state: EditorState, pose: Pose): EditorState {
  return {...state, pendingAnchor: pose, railhead: null};
}

/**
 * Select the open end drawing resumes from, clearing any pending anchor.
 * Selection is not an edit: no history is recorded, so ⌘Z never spends a step
 * on a click that laid nothing. Throws {@link RangeError} for an end that is
 * not open — the gesture only offers open ends, so the guard is a backstop.
 */
export function selectRailhead(
  state: EditorState,
  end: SectionEnd
): EditorState {
  if (!openEnds(state.layout).some(open => sameEnd(open, end))) {
    throw new RangeError(`no open end ${end.sectionId}:${end.end} to select`);
  }
  return {...state, railhead: end, pendingAnchor: null};
}

/**
 * Lay the network's first section, anchored by its `A` end at the pending anchor
 * ({@link anchorSection}), which it clears. The railhead advances to the
 * section's far end. The prior snapshot goes to `past` — one undo step — and the
 * redo stack is dropped.
 */
export function anchor(state: EditorState, section: Section): EditorState {
  if (!state.pendingAnchor) {
    throw new Error('anchoring a section requires a pending anchor');
  }
  return commit(
    state,
    anchorSection(state.layout, section, 'A', state.pendingAnchor),
    {sectionId: section.id, end: otherEnd(section, 'A')}
  );
}

/**
 * Lay `section` joined onto open end `at` ({@link joinSection}), optionally
 * closing its far end onto `closeOnto`. The railhead advances to that far end —
 * or to null when `closeOnto` consumed it: the loop is closed and that run has
 * nowhere to go until another open end is selected. The prior snapshot goes to
 * `past` — one undo step — and the redo stack is dropped.
 */
export function extend(
  state: EditorState,
  at: SectionEnd,
  section: Section,
  closeOnto: SectionEnd | null
): EditorState {
  return commit(
    state,
    joinSection(state.layout, at, section, 'A', closeOnto),
    closeOnto ? null : {sectionId: section.id, end: otherEnd(section, 'A')}
  );
}

/**
 * Make `layout` current with `railhead` selected: push the prior snapshot onto
 * the undo stack, clear the pending anchor, and drop the redo stack.
 */
function commit(
  state: EditorState,
  layout: Layout,
  railhead: SectionEnd | null
): EditorState {
  return {
    layout,
    railhead,
    pendingAnchor: null,
    past: [...state.past, snapshot(state)],
    future: [],
  };
}

/** The historized pair of a state: its layout and railhead. */
function snapshot(state: EditorState): Snapshot {
  return {layout: state.layout, railhead: state.railhead};
}

/**
 * Restore the previous snapshot — layout and railhead together, so redrawing
 * after an undo resumes from the end the undone section grew from — clearing
 * any pending anchor. With nothing historized — including a lone pending
 * anchor or selection — there is nothing to undo.
 */
export function undo(state: EditorState): EditorState {
  const previous = state.past.at(-1);
  if (!previous) {
    return state;
  }
  return {
    layout: previous.layout,
    railhead: previous.railhead,
    pendingAnchor: null,
    past: state.past.slice(0, -1),
    future: [...state.future, snapshot(state)],
  };
}

/** Re-apply the most recently undone snapshot, clearing any pending anchor. */
export function redo(state: EditorState): EditorState {
  const next = state.future.at(-1);
  if (!next) {
    return state;
  }
  return {
    layout: next.layout,
    railhead: next.railhead,
    pendingAnchor: null,
    past: [...state.past, snapshot(state)],
    future: state.future.slice(0, -1),
  };
}
