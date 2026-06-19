/**
 * The state of the lay-track tool, as a pure value with pure transitions, so the
 * drawing logic can be tested apart from Paper.js and the DOM. The editor edge
 * (./editor) owns an instance, calls these on pointer and keyboard events, and
 * renders the result.
 *
 * Drawing starts when the user clicks an empty canvas, which sets the anchor.
 * Each later click commits the section the pointer is previewing, extending the
 * run from its open end (the railhead).
 */

import {Point, Pose} from '../domain/geometry';
import {
  placeRoute,
  placeSection,
  PlacedSection,
  RouteSection,
  tangentSectionTo,
} from '../domain/layout';

/** The anchor and committed sections — everything undo/redo restores. */
interface Snapshot {
  readonly anchor: Pose | null;
  readonly sections: readonly RouteSection[];
}

export interface LayState extends Snapshot {
  /** Past snapshots, most recent last. */
  readonly past: readonly Snapshot[];
  /** Undone snapshots available to redo, most recent last. */
  readonly future: readonly Snapshot[];
}

/** The empty layout, before the first click. */
export const EMPTY: LayState = {
  anchor: null,
  sections: [],
  past: [],
  future: [],
};

/** Direction the first section leaves the start point until drag-to-aim exists. */
const INITIAL_HEADING = 0;

/** The open end the next section extends from, or null before drawing starts. */
export function railhead(state: LayState): Pose | null {
  return state.anchor ? placeRoute(state.anchor, state.sections).exit : null;
}

/** The sections committed so far, placed in the plane. */
export function placedSections(state: LayState): readonly PlacedSection[] {
  return state.anchor ? placeRoute(state.anchor, state.sections).sections : [];
}

/** The section the pointer would lay next, placed at the railhead, or null. */
export function preview(state: LayState, pointer: Point): PlacedSection | null {
  const head = railhead(state);
  if (!head) {
    return null;
  }
  const section = tangentSectionTo(head, pointer);
  return section ? placeSection(head, section) : null;
}

/**
 * Applies a click at `pointer`: places the anchor if drawing hasn't started,
 * otherwise commits the previewed section. A click with no committable section
 * (the pointer is at or behind the railhead) leaves the state unchanged.
 */
export function click(state: LayState, pointer: Point): LayState {
  const head = railhead(state);
  if (!head) {
    return advance(state, {
      anchor: {position: pointer, heading: INITIAL_HEADING},
      sections: [],
    });
  }
  const section = tangentSectionTo(head, pointer);
  if (!section) {
    return state;
  }
  return advance(state, {
    anchor: state.anchor,
    sections: [...state.sections, section],
  });
}

/** Restores the previous snapshot, if any. */
export function undo(state: LayState): LayState {
  const previous = state.past.at(-1);
  if (!previous) {
    return state;
  }
  return {
    ...previous,
    past: state.past.slice(0, -1),
    future: [...state.future, snapshot(state)],
  };
}

/** Re-applies the most recently undone snapshot, if any. */
export function redo(state: LayState): LayState {
  const next = state.future.at(-1);
  if (!next) {
    return state;
  }
  return {
    ...next,
    past: [...state.past, snapshot(state)],
    future: state.future.slice(0, -1),
  };
}

/** Moves to `next`, recording the current state for undo and clearing redo. */
function advance(state: LayState, next: Snapshot): LayState {
  return {...next, past: [...state.past, snapshot(state)], future: []};
}

function snapshot(state: LayState): Snapshot {
  return {anchor: state.anchor, sections: state.sections};
}
