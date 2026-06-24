import {describe, it, expect} from 'vitest';
import {type Pose} from '../domain/geometry';
import {railheadOf, straight} from '../domain/layout';
import {append, EMPTY, redo, start, undo} from './state';

const ANCHOR: Pose = {position: {x: 0, y: 0}, heading: 0};

describe('editor state', () => {
  it('starts empty, with nothing to draw from', () => {
    expect(railheadOf(EMPTY.layout)).toBeNull();
    expect(EMPTY.layout.sections).toHaveLength(0);
  });

  it('places the anchor with start', () => {
    const state = start(EMPTY, {position: {x: 100, y: 50}, heading: 0});
    expect(railheadOf(state.layout)?.position).toEqual({x: 100, y: 50});
    expect(state.layout.sections).toHaveLength(0);
  });

  it('commits a section with append', () => {
    const drawn = append(start(EMPTY, ANCHOR), straight(300));
    expect(drawn.layout.sections).toHaveLength(1);
    expect(railheadOf(drawn.layout)?.position.x).toBeCloseTo(300);
  });

  it('undoes and redoes a committed section', () => {
    const drawn = append(start(EMPTY, ANCHOR), straight(300));
    const undone = undo(drawn);
    expect(undone.layout.sections).toHaveLength(0);
    expect(railheadOf(undone.layout)).not.toBeNull(); // anchor still placed
    expect(redo(undone).layout.sections).toHaveLength(1);
  });

  it('undoes the anchor back to empty', () => {
    expect(railheadOf(undo(start(EMPTY, ANCHOR)).layout)).toBeNull();
  });

  it('drops the redo stack once a new section is committed', () => {
    const drawn = append(start(EMPTY, ANCHOR), straight(300));
    const branched = append(undo(drawn), straight(200));
    expect(redo(branched)).toBe(branched); // nothing to redo
  });
});
