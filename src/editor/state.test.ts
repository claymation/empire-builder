import {describe, it, expect} from 'vitest';
import {placedSections, railhead} from '../domain/layout';
import {click, EMPTY, redo, undo} from './state';

describe('editor state', () => {
  it('starts empty, with nothing to draw from', () => {
    expect(railhead(EMPTY.layout)).toBeNull();
    expect(placedSections(EMPTY.layout)).toHaveLength(0);
  });

  it('places the anchor on the first click', () => {
    const state = click(EMPTY, {x: 100, y: 50});
    expect(railhead(state.layout)?.position).toEqual({x: 100, y: 50});
    expect(placedSections(state.layout)).toHaveLength(0);
  });

  it('commits the previewed section on a later click', () => {
    const drawn = click(click(EMPTY, {x: 0, y: 0}), {x: 300, y: 0});
    expect(placedSections(drawn.layout)).toHaveLength(1);
    expect(railhead(drawn.layout)?.position.x).toBeCloseTo(300);
  });

  it('ignores a click with nothing to commit', () => {
    const started = click(EMPTY, {x: 0, y: 0});
    // The railhead itself has no tangent section to draw.
    expect(click(started, {x: 0, y: 0})).toBe(started);
  });

  it('undoes and redoes a committed section', () => {
    const drawn = click(click(EMPTY, {x: 0, y: 0}), {x: 300, y: 0});
    const undone = undo(drawn);
    expect(placedSections(undone.layout)).toHaveLength(0);
    expect(railhead(undone.layout)).not.toBeNull(); // anchor still placed
    expect(placedSections(redo(undone).layout)).toHaveLength(1);
  });

  it('undoes the anchor back to empty', () => {
    const started = click(EMPTY, {x: 0, y: 0});
    expect(railhead(undo(started).layout)).toBeNull();
  });

  it('drops the redo stack once a new section is committed', () => {
    const drawn = click(click(EMPTY, {x: 0, y: 0}), {x: 300, y: 0});
    const branched = click(undo(drawn), {x: 200, y: 0});
    expect(redo(branched)).toBe(branched); // nothing to redo
  });
});
