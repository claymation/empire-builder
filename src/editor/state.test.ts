import {describe, it, expect} from 'vitest';
import {type Pose} from '../domain/geometry';
import {openEnds, type SectionEnd} from '../domain/layout';
import {
  curveLeft,
  straight,
  type Section,
  type SectionShape,
} from '../domain/section';
import {commit, EMPTY, redo, start, undo} from './state';

const ORIGIN: Pose = {position: {x: 0, y: 0}, heading: 0};

/** A shape given an id, as the editor would allocate before committing. */
function withId(id: string, shape: SectionShape): Section {
  return {...shape, id};
}

const end = (section: string, name: 'entry' | 'exit'): SectionEnd => ({
  section,
  end: name,
});

describe('editor state', () => {
  it('starts empty, with no layout and no pending start', () => {
    expect(EMPTY.layout.sections).toHaveLength(0);
    expect(EMPTY.pendingStart).toBeNull();
  });

  it('plants the origin as a transient, recording no history', () => {
    const planted = start(EMPTY, {position: {x: 100, y: 50}, heading: 0});
    expect(planted.pendingStart).toEqual({
      position: {x: 100, y: 50},
      heading: 0,
    });
    expect(planted.layout.sections).toHaveLength(0);
    expect(planted.past).toHaveLength(0); // planting is not historized
    expect(undo(planted)).toBe(planted); // nothing to undo
  });

  it('commits the first section as a new anchored network', () => {
    const planted = start(EMPTY, ORIGIN);
    const drawn = commit(planted, {
      kind: 'plant',
      section: withId('s1', straight(300)),
    });
    expect(drawn.layout.sections.map(s => s.id)).toEqual(['s1']);
    expect(drawn.layout.anchors).toHaveLength(1);
    expect(drawn.pendingStart).toBeNull();
    expect(openEnds(drawn.layout)).toEqual([
      end('s1', 'entry'),
      end('s1', 'exit'),
    ]);
  });

  it('undoes the first section straight back to empty', () => {
    const drawn = commit(start(EMPTY, ORIGIN), {
      kind: 'plant',
      section: withId('s1', straight(300)),
    });
    const undone = undo(drawn);
    expect(undone.layout.sections).toHaveLength(0);
    expect(undone.pendingStart).toBeNull(); // the planted origin is not restored
    expect(redo(undone).layout.sections).toHaveLength(1);
  });

  it('closes a loop, leaving no open ends, and reopens them on undo', () => {
    // The oval: two straights joined by two 180° curves, the last closing onto
    // the anchored entry.
    let state = commit(start(EMPTY, ORIGIN), {
      kind: 'plant',
      section: withId('s1', straight(100)),
    });
    state = commit(state, {
      kind: 'extend',
      at: end('s1', 'exit'),
      section: withId('s2', curveLeft(50, 180)),
      closeOnto: null,
    });
    state = commit(state, {
      kind: 'extend',
      at: end('s2', 'exit'),
      section: withId('s3', straight(100)),
      closeOnto: null,
    });
    const closed = commit(state, {
      kind: 'extend',
      at: end('s3', 'exit'),
      section: withId('s4', curveLeft(50, 180)),
      closeOnto: end('s1', 'entry'),
    });
    expect(openEnds(closed.layout)).toEqual([]);
    expect(openEnds(undo(closed).layout)).not.toEqual([]);
  });

  it('drops the redo stack once a new section is committed', () => {
    const anchored = commit(start(EMPTY, ORIGIN), {
      kind: 'plant',
      section: withId('s1', straight(300)),
    });
    const extended = commit(anchored, {
      kind: 'extend',
      at: end('s1', 'exit'),
      section: withId('s2', straight(200)),
      closeOnto: null,
    });
    // Undo s2, then grow a different section from the same open end.
    const branched = commit(undo(extended), {
      kind: 'extend',
      at: end('s1', 'exit'),
      section: withId('s3', straight(150)),
      closeOnto: null,
    });
    expect(branched.layout.sections.map(s => s.id)).toEqual(['s1', 's3']);
    expect(redo(branched)).toBe(branched); // the undone s2 is gone
  });
});
