import {describe, it, expect} from 'vitest';
import {tangentPieceTo} from './drawing';
import {type Point, type Pose} from './geometry';
import {exitPoses, placePiece} from './layout';

/** Asserts the tangent piece from `from` actually ends at `target`. */
function reaches(from: Pose, target: Point): void {
  const [exit] = exitPoses(placePiece(from, tangentPieceTo(from, target)));
  expect(exit.position.x).toBeCloseTo(target.x);
  expect(exit.position.y).toBeCloseTo(target.y);
}

describe('tangentPieceTo', () => {
  const EAST: Pose = {position: {x: 0, y: 0}, heading: 0};

  it('returns a straight to a point dead ahead', () => {
    const piece = tangentPieceTo(EAST, {x: 100, y: 0});
    expect(piece.kind).toBe('straight');
    reaches(EAST, {x: 100, y: 0});
  });

  it('curves left toward a point off to the left', () => {
    const piece = tangentPieceTo(EAST, {x: 100, y: 100});
    expect(piece).toMatchObject({kind: 'curved', handedness: 'left'});
    reaches(EAST, {x: 100, y: 100});
  });

  it('curves right toward a point off to the right', () => {
    const piece = tangentPieceTo(EAST, {x: 100, y: -100});
    expect(piece).toMatchObject({kind: 'curved', handedness: 'right'});
    reaches(EAST, {x: 100, y: -100});
  });

  it('loops 180° to a point abreast of the start', () => {
    // Directly to the left of an east-facing railhead: a half-circle reaches it.
    reaches(EAST, {x: 0, y: 200});
  });

  it('reaches targets across quadrants and start headings', () => {
    const poses: Pose[] = [
      {position: {x: 0, y: 0}, heading: 0},
      {position: {x: 5, y: -3}, heading: Math.PI / 2},
      {position: {x: -2, y: 4}, heading: Math.PI},
      {position: {x: 1, y: 1}, heading: -Math.PI / 4},
    ];
    const targets: Point[] = [
      {x: 120, y: 40},
      {x: 30, y: 150},
      {x: -90, y: -60},
      {x: 200, y: -10},
    ];
    for (const from of poses) {
      for (const target of targets) {
        reaches(from, target);
      }
    }
  });

  it('rejects a degenerate or unreachable target', () => {
    expect(() => tangentPieceTo(EAST, {x: 0, y: 0})).toThrow(RangeError);
    expect(() => tangentPieceTo(EAST, {x: -100, y: 0})).toThrow(RangeError);
  });
});
