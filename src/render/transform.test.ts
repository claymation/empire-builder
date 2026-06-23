import {describe, it, expect} from 'vitest';
import {makeSpace} from '../domain/space';
import {fitTransform} from './transform';

describe('fitTransform', () => {
  // A 200×100 sheet in a 440×240 view with 20px padding: the limiting fit is
  // 2×, centered, leaving a 20px border on every side.
  const space = makeSpace(200, 100);
  const transform = fitTransform(space, 440, 240, 20);

  it('maps the sheet corners, flipping the y axis', () => {
    // Domain origin is the bottom-left; on a y-down canvas that is the bottom.
    expect(transform.toCanvas({x: 0, y: 0})).toEqual({x: 20, y: 220});
    expect(transform.toCanvas({x: 200, y: 100})).toEqual({x: 420, y: 20});
  });

  it('inverts toCanvas', () => {
    const point = {x: 137, y: 88};
    const back = transform.toDomain(transform.toCanvas(point));
    expect(back.x).toBeCloseTo(137);
    expect(back.y).toBeCloseTo(88);
  });

  it('reports the limiting scale as pixels per millimeter', () => {
    // Width fit is 400/200 = 2×; height fit is 200/100 = 2×; the min is 2.
    expect(transform.scale).toBeCloseTo(2);
  });
});
