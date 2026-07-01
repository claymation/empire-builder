import {describe, it, expect} from 'vitest';
import {type Pose} from '../domain/geometry';
import {openEnds, type SectionEnd} from '../domain/layout';
import {
  curve,
  straight,
  type Section,
  type SectionShape,
} from '../domain/section';
import {anchor, EMPTY, extend, dropAnchor, redo, undo} from './state';

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
  it('starts empty, with no layout and no pending anchor', () => {
    expect(EMPTY.layout.sections).toHaveLength(0);
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
