import {describe, it, expect} from 'vitest';
import {type Pose} from '../domain/geometry';
import {openEnds, placeLayout, poseOf, type SectionEnd} from '../domain/layout';
import {
  curve,
  straight,
  type Section,
  type SectionShape,
} from '../domain/section';
import {
  anchor,
  EMPTY,
  extend,
  dropAnchor,
  redo,
  selectRailhead,
  undo,
} from './state';

const ORIGIN: Pose = {position: {x: 0, y: 0}, heading: 0};

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
    expect(EMPTY.layout.sections).toHaveLength(0);
    expect(EMPTY.railhead).toBeNull();
    expect(EMPTY.pendingAnchor).toBeNull();
  });

  it('plants an anchor as a transient, recording no history', () => {
    const planted = dropAnchor(EMPTY, {position: {x: 100, y: 50}, heading: 0});
    expect(planted.pendingAnchor).toEqual({
      position: {x: 100, y: 50},
      heading: 0,
    });
    expect(planted.layout.sections).toHaveLength(0);
    expect(planted.past).toHaveLength(0); // planting is not historized
    expect(undo(planted)).toBe(planted); // nothing to undo
  });

  it('lays the first section as a new anchored network', () => {
    const planted = dropAnchor(EMPTY, ORIGIN);
    const drawn = anchor(planted, withId('s1', straight(300)));
    expect(drawn.layout.sections.map(s => s.id)).toEqual(['s1']);
    expect(drawn.layout.anchors).toHaveLength(1);
    expect(drawn.pendingAnchor).toBeNull();
    expect(openEnds(drawn.layout)).toEqual([end('s1', 'A'), end('s1', 'B')]);
  });

  it('anchoring without a pending anchor throws', () => {
    expect(() => anchor(EMPTY, withId('s1', straight(300)))).toThrow();
  });

  it('undoes the first section straight back to empty', () => {
    const drawn = anchor(
      dropAnchor(EMPTY, ORIGIN),
      withId('s1', straight(300))
    );
    const undone = undo(drawn);
    expect(undone.layout.sections).toHaveLength(0);
    expect(undone.pendingAnchor).toBeNull(); // the planted anchor is not restored
    expect(redo(undone).layout.sections).toHaveLength(1);
  });

  it('closes a loop, leaving no open ends, and reopens them on undo', () => {
    // The oval: two straights joined by two 180° curves, the last closing onto
    // the anchored A end.
    let state = anchor(dropAnchor(EMPTY, ORIGIN), withId('s1', straight(100)));
    state = extend(
      state,
      end('s1', 'B'),
      withId('s2', curve(50, 180, 'ccw')),
      null
    );
    state = extend(state, end('s2', 'B'), withId('s3', straight(100)), null);
    const closed = extend(
      state,
      end('s3', 'B'),
      withId('s4', curve(50, 180, 'ccw')),
      end('s1', 'A')
    );
    expect(openEnds(closed.layout)).toEqual([]);
    expect(openEnds(undo(closed).layout)).not.toEqual([]);
  });

  it('drops the redo stack once a new section is committed', () => {
    const anchored = anchor(
      dropAnchor(EMPTY, ORIGIN),
      withId('s1', straight(300))
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
function anchored(): ReturnType<typeof anchor> {
  return anchor(dropAnchor(EMPTY, ORIGIN), withId('s1', straight(100)));
}

describe('selectRailhead', () => {
  it('selects an open end', () => {
    const state = selectRailhead(anchored(), end('s1', 'A'));
    expect(state.railhead).toEqual(end('s1', 'A'));
  });

  it('clears a pending anchor, and dropping an anchor clears the selection', () => {
    // Force the two to coexist momentarily from either side; each transition
    // restores the invariant that at most one is set.
    const planted = dropAnchor(anchored(), {
      position: {x: 500, y: 500},
      heading: 0,
    });
    expect(planted.railhead).toBeNull();
    const selected = selectRailhead(planted, end('s1', 'A'));
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
    state = extend(
      state,
      end('s1', 'B'),
      withId('s2', curve(50, 180, 'ccw')),
      null
    );
    state = extend(state, end('s2', 'B'), withId('s3', straight(100)), null);
    const closed = extend(
      state,
      end('s3', 'B'),
      withId('s4', curve(50, 180, 'ccw')),
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
