/**
 * The lay-track tool's editor state, as a pure value with pure transitions, so
 * the drawing logic can be tested apart from Paper.js and the DOM. The editor
 * edge (./editor) owns an instance, calls these on pointer and keyboard events,
 * and renders the result.
 *
 * The state is the current {@link Layout}, the railhead, a transient pending
 * anchor, and the history undo/redo walk. The transitions:
 *
 * - {@link dropAnchor} drops the anchor a new network grows from;
 * - {@link startNetwork} lays that network's first section there;
 * - {@link tieInSection} instead joins a first section that lands seated on an
 *   existing network's open end;
 * - {@link extend} lays one joined onto an open end;
 * - {@link selectRailhead} moves drawing to another open end;
 * - {@link deselect} clears the selection.
 *
 * The editor picks among them and computes the section (so snapping applies
 * once); only the transitions that change the layout record history.
 *
 * The railhead — the selected open end the next section grows from — is the one
 * irreducible piece of selection state the layout cannot express: a chain has
 * two open ends the moment it is drawn, and the choice between them is the
 * user's. The pending anchor — a dropped anchor position awaiting its first
 * section — is a drawing transient, not a fact about the plan, so it lives
 * here, not in the layout, and is never recorded in history. It carries no
 * heading: the heading is aimed while the first section is previewed and fixed
 * when {@link startNetwork} lays it. At most one of the two is set: both
 * answer "where does the next section grow from".
 */

import {Point} from '../domain/geometry';
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
  /** A dropped anchor position awaiting its first section. Transient: never
   *  historized. */
  readonly pendingAnchor: Point | null;
  /** Past snapshots, most recent last. */
  readonly past: readonly Snapshot[];
  /** Undone snapshots available to redo, most recent last. */
  readonly future: readonly Snapshot[];
}

/** The editor before the first click. */
export const EMPTY_STATE: EditorState = {
  layout: EMPTY_LAYOUT,
  railhead: null,
  pendingAnchor: null,
  past: [],
  future: [],
};

/**
 * Drop the anchor a new network grows from: set the pending anchor position,
 * clearing any selected railhead. No section, no history.
 */
export function dropAnchor(state: EditorState, point: Point): EditorState {
  return {...state, pendingAnchor: point, railhead: null};
}

/**
 * Clear the selection (Esc): no railhead, no pending anchor — the state where
 * the next click on empty canvas drops the anchor of a new network. Not an
 * edit: no history is recorded.
 */
export function deselect(state: EditorState): EditorState {
  return {...state, railhead: null, pendingAnchor: null};
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
 * Start a new network: lay its first section, anchored by its `A` end at the
 * pending anchor position, leaving at the given `heading` — the one the
 * section was previewed with ({@link anchorSection}). Clears the pending
 * anchor; the railhead advances to the section's far end. The prior snapshot
 * goes to `past` — one undo step — and the redo stack is dropped.
 */
export function startNetwork(
  state: EditorState,
  section: Section,
  heading: number
): EditorState {
  if (!state.pendingAnchor) {
    throw new Error('starting a network requires a pending anchor');
  }
  return commit(
    state,
    anchorSection(state.layout, section, 'A', {
      position: state.pendingAnchor,
      heading,
    }),
    {sectionId: section.id, end: otherEnd(section, 'A')}
  );
}

/**
 * Tie a pending anchor's first section into existing track: seat its far `B`
 * end on the open end `onto` and record that join ({@link joinSection}). No
 * anchor is recorded — placement derives from the joined network, one anchor
 * per network. The railhead clears, as when a loop closes: the run ends, the
 * section's `A` end left open to resume from. One undo step. ("Tie in" is the
 * railroad term for bringing new track into track already laid.)
 */
export function tieInSection(
  state: EditorState,
  section: Section,
  onto: SectionEnd
): EditorState {
  if (!state.pendingAnchor) {
    throw new Error('tying in requires a pending anchor');
  }
  return commit(
    state,
    joinSection(state.layout, onto, section, 'B', null),
    null
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
