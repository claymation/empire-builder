import {describe, it, expect} from 'vitest';
import {degToRad, type Point} from '../lib/geometry';
import {openEnds, placeLayout, poseOf, type SectionEnd} from '../domain/layout';
import {
  curve,
  straight,
  type Section,
  type SectionShape,
} from '../domain/section';
import {
  startNetwork,
  deselect,
  EMPTY_STATE,
  extend,
  dropAnchor,
  redo,
  selectRailhead,
  undo,
} from './state';

const ORIGIN: Point = {x: 0, y: 0};

/** A shape given an id, as the editor would allocate before committing. */
function withId(id: string, shape: SectionShape): Section {
  return {...shape, id};
}

const end = (sectionId: string, name: 'A' | 'B'): SectionEnd => ({
  sectionId,
  end: name,
});

describe('editor state', () => {
  it('starts empty, with no layout, railhead, or pending anchor', () => {
    expect(EMPTY_STATE.layout.sections).toHaveLength(0);
    expect(EMPTY_STATE.railhead).toBeNull();
    expect(EMPTY_STATE.pendingAnchor).toBeNull();
  });

  it('drops an anchor as a transient, recording no history', () => {
    const state = dropAnchor(EMPTY_STATE, {x: 100, y: 50});
    expect(state.pendingAnchor).toEqual({x: 100, y: 50});
    expect(state.layout.sections).toHaveLength(0);
    expect(state.past).toHaveLength(0); // dropping an anchor is not historized
    expect(undo(state)).toBe(state); // nothing to undo
  });

  it('lays the first section as a new anchored network', () => {
    const state = dropAnchor(EMPTY_STATE, ORIGIN);
    const drawn = startNetwork(state, withId('s1', straight(300)), 0);
    expect(drawn.layout.sections.map(s => s.id)).toEqual(['s1']);
    expect(drawn.layout.anchors).toHaveLength(1);
    expect(drawn.pendingAnchor).toBeNull();
    expect(openEnds(drawn.layout)).toEqual([end('s1', 'A'), end('s1', 'B')]);
  });

  it('anchors the first section at the aimed heading', () => {
    const state = dropAnchor(EMPTY_STATE, {x: 5, y: 7});
    const drawn = startNetwork(
      state,
      withId('s1', straight(100)),
      degToRad(30)
    );
    expect(drawn.layout.anchors).toEqual([
      {
        sectionEnd: end('s1', 'A'),
        pose: {position: {x: 5, y: 7}, heading: degToRad(30)},
      },
    ]);
    const b = poseOf(placeLayout(drawn.layout), end('s1', 'B'));
    expect(b.position.x).toBeCloseTo(5 + 100 * Math.cos(degToRad(30)));
    expect(b.position.y).toBeCloseTo(7 + 100 * Math.sin(degToRad(30)));
  });

  it('anchoring without a pending anchor throws', () => {
    expect(() =>
      startNetwork(EMPTY_STATE, withId('s1', straight(300)), 0)
    ).toThrow();
  });

  it('undoes the first section straight back to empty', () => {
    const drawn = startNetwork(
      dropAnchor(EMPTY_STATE, ORIGIN),
      withId('s1', straight(300)),
      0
    );
    const undone = undo(drawn);
    expect(undone.layout.sections).toHaveLength(0);
    expect(undone.pendingAnchor).toBeNull(); // the dropped anchor is not restored
    expect(redo(undone).layout.sections).toHaveLength(1);
  });

  it('closes a loop, leaving no open ends, and reopens them on undo', () => {
    // The oval: two straights joined by two 180° curves, the last closing onto
    // the anchored A end.
    let state = startNetwork(
      dropAnchor(EMPTY_STATE, ORIGIN),
      withId('s1', straight(100)),
      0
    );
    state = extend(state, end('s1', 'B'), withId('s2', curve(50, 180)), null);
    state = extend(state, end('s2', 'B'), withId('s3', straight(100)), null);
    const closed = extend(
      state,
      end('s3', 'B'),
      withId('s4', curve(50, 180)),
      end('s1', 'A')
    );
    expect(openEnds(closed.layout)).toEqual([]);
    expect(openEnds(undo(closed).layout)).not.toEqual([]);
  });

  it('drops the redo stack once a new section is committed', () => {
    const anchored = startNetwork(
      dropAnchor(EMPTY_STATE, ORIGIN),
      withId('s1', straight(300)),
      0
    );
    const extended = extend(
      anchored,
      end('s1', 'B'),
      withId('s2', straight(200)),
      null
    );
    // Undo s2, then grow a different section from the same open end.
    const branched = extend(
      undo(extended),
      end('s1', 'B'),
      withId('s3', straight(150)),
      null
    );
    expect(branched.layout.sections.map(s => s.id)).toEqual(['s1', 's3']);
    expect(redo(branched)).toBe(branched); // the undone s2 is gone
  });
});

/** A one-section network: s1 anchored at the origin, both ends open. */
function anchored(): ReturnType<typeof startNetwork> {
  return startNetwork(
    dropAnchor(EMPTY_STATE, ORIGIN),
    withId('s1', straight(100)),
    0
  );
}

describe('selectRailhead', () => {
  it('selects an open end', () => {
    const state = selectRailhead(anchored(), end('s1', 'A'));
    expect(state.railhead).toEqual(end('s1', 'A'));
  });

  it('clears a pending anchor, and dropping an anchor clears the selection', () => {
    // Force the two to coexist momentarily from either side; each transition
    // restores the invariant that at most one is set.
    const state = dropAnchor(anchored(), {x: 500, y: 500});
    expect(state.railhead).toBeNull();
    const selected = selectRailhead(state, end('s1', 'A'));
    expect(selected.railhead).toEqual(end('s1', 'A'));
    expect(selected.pendingAnchor).toBeNull();
  });

  it('rejects a joined end', () => {
    const state = extend(
      anchored(),
      end('s1', 'B'),
      withId('s2', straight(50)),
      null
    );
    expect(() => selectRailhead(state, end('s1', 'B'))).toThrow(RangeError);
  });

  it('rejects an unknown end', () => {
    expect(() => selectRailhead(anchored(), end('nope', 'A'))).toThrow(
      RangeError
    );
  });

  it('records no history: undo restores the prior layout, not the selection', () => {
    const selected = selectRailhead(anchored(), end('s1', 'A'));
    expect(selected.past).toHaveLength(1); // only the anchor commit
    expect(undo(selected).layout.sections).toHaveLength(0);
  });
});

describe('commit railhead', () => {
  it('anchor leaves the railhead on the new section’s far end', () => {
    expect(anchored().railhead).toEqual(end('s1', 'B'));
  });

  it('extend advances it to the laid section’s far end', () => {
    const state = extend(
      anchored(),
      end('s1', 'B'),
      withId('s2', straight(50)),
      null
    );
    expect(state.railhead).toEqual(end('s2', 'B'));
  });

  it('extend with closeOnto nulls it — the loop consumed the far end', () => {
    let state = anchored();
    state = extend(state, end('s1', 'B'), withId('s2', curve(50, 180)), null);
    state = extend(state, end('s2', 'B'), withId('s3', straight(100)), null);
    const closed = extend(
      state,
      end('s3', 'B'),
      withId('s4', curve(50, 180)),
      end('s1', 'A')
    );
    expect(closed.railhead).toBeNull();
  });

  it('the pushed snapshot carries the pre-commit railhead', () => {
    const selected = selectRailhead(anchored(), end('s1', 'A'));
    const extended = extend(
      selected,
      end('s1', 'A'),
      withId('s2', straight(50)),
      null
    );
    expect(extended.past.at(-1)?.railhead).toEqual(end('s1', 'A'));
  });
});

describe('undo/redo railhead', () => {
  it('undo restores layout and railhead together; redo is symmetric', () => {
    const before = anchored();
    const extended = extend(
      before,
      end('s1', 'B'),
      withId('s2', straight(50)),
      null
    );
    const undone = undo(extended);
    expect(undone.layout.sections.map(s => s.id)).toEqual(['s1']);
    expect(undone.railhead).toEqual(end('s1', 'B'));
    const redone = redo(undone);
    expect(redone.layout.sections.map(s => s.id)).toEqual(['s1', 's2']);
    expect(redone.railhead).toEqual(end('s2', 'B'));
  });

  it('undo-then-redraw resumes from the end the undone section grew from', () => {
    const selected = selectRailhead(anchored(), end('s1', 'A'));
    const extended = extend(
      selected,
      end('s1', 'A'),
      withId('s2', straight(50)),
      null
    );
    const undone = undo(extended);
    expect(undone.railhead).toEqual(end('s1', 'A'));
    const redrawn = extend(
      undone,
      undone.railhead!,
      withId('s3', straight(75)),
      null
    );
    expect(redrawn.layout.joins).toContainEqual({
      ends: [end('s1', 'A'), end('s3', 'A')],
    });
  });
});

describe('deselect', () => {
  it('clears the railhead, recording no history', () => {
    const state = deselect(anchored());
    expect(state.railhead).toBeNull();
    expect(state.pendingAnchor).toBeNull();
    expect(state.past).toHaveLength(1); // only the anchor commit
  });

  it('clears a pending anchor', () => {
    const state = dropAnchor(anchored(), {x: 500, y: 500});
    expect(deselect(state).pendingAnchor).toBeNull();
  });
});

/**
 * Two parallel one-straight networks, built as the user would: s1 anchored at
 * the origin, Esc, then s2 anchored one curve-diameter above it. The railhead
 * sits on s2's B.
 */
function twoNetworks(): ReturnType<typeof startNetwork> {
  const state = dropAnchor(deselect(anchored()), {x: 0, y: 100});
  return startNetwork(state, withId('s2', straight(100)), 0);
}

describe('starting a second network', () => {
  it('drops an anchor and lays a first section beside existing track', () => {
    const drawn = twoNetworks();
    expect(drawn.layout.anchors).toHaveLength(2);
    expect(openEnds(drawn.layout)).toEqual([
      end('s1', 'A'),
      end('s1', 'B'),
      end('s2', 'A'),
      end('s2', 'B'),
    ]);
    expect(drawn.railhead).toEqual(end('s2', 'B'));
  });

  it('undo across a merge restores both anchors and the pre-merge railhead', () => {
    const selected = selectRailhead(twoNetworks(), end('s1', 'B'));
    const merged = extend(
      selected,
      end('s1', 'B'),
      withId('s3', curve(50, 180)),
      end('s2', 'B')
    );
    expect(merged.layout.anchors).toHaveLength(1);
    expect(merged.railhead).toBeNull(); // the close consumed the far end
    const undone = undo(merged);
    expect(undone.layout.anchors).toHaveLength(2);
    expect(undone.railhead).toEqual(end('s1', 'B'));
    expect(redo(undone).layout.anchors).toHaveLength(1);
  });
});

describe('the two-straights oval (US-5-3)', () => {
  it('assembles two networks into one loop with one anchor and no open ends', () => {
    // A curve from s1's B closes onto s2's B: the networks merge, s2's anchor
    // absorbed into s1's.
    let state = selectRailhead(twoNetworks(), end('s1', 'B'));
    state = extend(
      state,
      end('s1', 'B'),
      withId('s3', curve(50, 180)),
      end('s2', 'B')
    );
    expect(state.layout.anchors).toHaveLength(1);
    // The far side: a curve from s1's A closes onto s2's A — the loop close.
    state = selectRailhead(state, end('s1', 'A'));
    state = extend(
      state,
      end('s1', 'A'),
      withId('s4', curve(50, -180)),
      end('s2', 'A')
    );
    expect(openEnds(state.layout)).toEqual([]);
    expect(state.layout.anchors).toHaveLength(1);
    expect(state.railhead).toBeNull();
    // The loop places consistently — the closing joins align — with the
    // absorbed straight where it was drawn.
    const placed = placeLayout(state.layout);
    expect(poseOf(placed, end('s2', 'A')).position.x).toBeCloseTo(0);
    expect(poseOf(placed, end('s2', 'A')).position.y).toBeCloseTo(100);
    // Undo steps back through the whole construction to the empty sheet.
    for (let steps = 0; steps < 4; steps++) {
      state = undo(state);
    }
    expect(state.layout.sections).toHaveLength(0);
    expect(state.past).toHaveLength(0);
  });
});

describe('growing from a selected A end', () => {
  it('extends the network away from the anchored section', () => {
    // Select the anchored end and grow backward: s2 hangs off s1's anchored A
    // (an A↔A join walked from the anchored side) and extends west, away from
    // s1 running east of the origin.
    const selected = selectRailhead(anchored(), end('s1', 'A'));
    const state = extend(
      selected,
      selected.railhead!,
      withId('s2', straight(60)),
      null
    );
    const placed = placeLayout(state.layout);
    const b = poseOf(placed, end('s2', 'B'));
    expect(b.position.x).toBeCloseTo(-60);
    expect(b.position.y).toBeCloseTo(0);
    expect(state.railhead).toEqual(end('s2', 'B'));
  });
});
