import {describe, it, expect} from 'vitest';
import {radToDeg, type Pose} from '../domain/geometry';
import {type SectionEnd, type SectionEndPose} from '../domain/layout';
import {shapeTo} from '../domain/snapping';
import {computePreview} from './preview';

/** The railhead's outward pose: at the origin, facing east (+x). */
const RAILHEAD: Pose = {position: {x: 0, y: 0}, heading: 0};

const end = (sectionId: string, name: 'A' | 'B'): SectionEnd => ({
  sectionId,
  end: name,
});

/** Pairs an open end with its stored (inward-facing) pose. */
const oe = (sectionEnd: SectionEnd, pose: Pose): SectionEndPose => ({
  sectionEnd,
  pose,
});

// An open end the railhead cannot latch: the single arc from the railhead to
// (100, 50) arrives banking, off the end's line. Its ring can only hover.
const SIDE_END = oe(end('s', 'B'), {position: {x: 100, y: 50}, heading: 0});

// An open end whose pose faces north — its section stands north of (100, 100).
// The quarter-turn arc from the railhead arrives facing it, so its point
// latches: the click closes.
const FACING_END = oe(end('f', 'B'), {
  position: {x: 100, y: 100},
  heading: Math.PI / 2,
});

describe('computePreview', () => {
  it('previews nothing without a pointer', () => {
    const p = computePreview(RAILHEAD, null, [SIDE_END], 1, false);
    expect(p.railhead).toBeNull();
    expect(p.shape).toBeNull();
    expect(p.hover).toBeNull();
  });

  it('hovers an open end with no railhead — the click can still select', () => {
    const p = computePreview(null, {x: 104, y: 53}, [SIDE_END], 1, false);
    expect(p.hover).toEqual(end('s', 'B'));
    expect(p.shape).toBeNull();
    expect(p.ghost).toBeNull();
  });

  it('offers neither shape nor hover with no railhead and no ring in reach', () => {
    const p = computePreview(null, {x: 300, y: 300}, [SIDE_END], 1, false);
    expect(p.hover).toBeNull();
    expect(p.shape).toBeNull();
  });

  it('hovering suppresses the ghost, exactly to the ring radius', () => {
    // The pointer sits on the end's normal line, so without the hover the
    // preview would offer a line-snapped section; inside the ring radius the
    // hover claims the click instead. Pin the boundary: 12 px in, 12.1 px out.
    const inside = computePreview(
      RAILHEAD,
      {x: 100, y: 62},
      [SIDE_END],
      1,
      false
    );
    expect(inside.hover).toEqual(end('s', 'B'));
    expect(inside.shape).toBeNull();
    expect(inside.ghost).toBeNull();
    expect(inside.snap).toBeNull();
    expect(inside.railhead).toEqual(RAILHEAD);

    const outside = computePreview(
      RAILHEAD,
      {x: 100, y: 62.1},
      [SIDE_END],
      1,
      false
    );
    expect(outside.hover).toBeNull();
    expect(outside.shape).not.toBeNull();
    expect(outside.ghost).not.toBeNull();
  });

  it('scales the ring radius with the view', () => {
    // At double scale the 12 px ring is 6 domain units: 5.9 hovers, 6.1 lays.
    const inside = computePreview(
      RAILHEAD,
      {x: 100, y: 55.9},
      [SIDE_END],
      2,
      false
    );
    expect(inside.hover).toEqual(end('s', 'B'));
    const outside = computePreview(
      RAILHEAD,
      {x: 100, y: 56.1},
      [SIDE_END],
      2,
      false
    );
    expect(outside.hover).toBeNull();
    expect(outside.shape).not.toBeNull();
  });

  it('a latched end outranks the hover: the click closes, not selects', () => {
    const p = computePreview(
      RAILHEAD,
      {x: 104, y: 103},
      [FACING_END],
      1,
      false
    );
    expect(p.hover).toBeNull();
    expect(p.closeOnto).toEqual(end('f', 'B'));
    expect(p.shape).not.toBeNull();
    // The ghost reaches the latched ring exactly.
    expect(p.snap).toMatchObject({kind: 'end', point: {x: 100, y: 100}});
  });

  it('hovers the railhead’s own ring, laying nothing', () => {
    // The railhead's open end sits at the railhead itself, its stored pose
    // facing back into the section. Hovering it suppresses the ghost, so a
    // near-zero section can't be laid by accident; the click re-selects it.
    const own = oe(end('r', 'B'), {position: {x: 0, y: 0}, heading: Math.PI});
    const p = computePreview(RAILHEAD, {x: 5, y: 5}, [own], 1, false);
    expect(p.hover).toEqual(end('r', 'B'));
    expect(p.shape).toBeNull();
  });

  it('hovers the nearest of two rings in reach', () => {
    const near = oe(end('n', 'A'), {position: {x: 100, y: 54}, heading: 0});
    const p = computePreview(
      RAILHEAD,
      {x: 100, y: 53},
      [SIDE_END, near],
      1,
      false
    );
    expect(p.hover).toEqual(end('n', 'A'));
  });

  it('snaps a 180° curve from a pending anchor onto its normal guideline', () => {
    // A network's first section: the pending anchor is the railhead pose and
    // no open end exists. A pointer just off abreast of the anchor pulls onto
    // the anchor's normal, so the half-circle starting a return loop is exact.
    const p = computePreview(RAILHEAD, {x: 4, y: 100}, [], 1, false);
    expect(p.snap?.kind).toBe('line');
    expect(p.snap?.point.x).toBeCloseTo(0);
    expect(p.snap?.point.y).toBeCloseTo(100);
    if (p.shape?.kind !== 'curved') throw new Error('expected a curve');
    expect(radToDeg(p.shape.arc.sweep)).toBeCloseTo(180);
    expect(p.shape.arc.radius).toBeCloseTo(50);
  });

  it('suspending snapping lays the plain section, hovering nothing', () => {
    const p = computePreview(RAILHEAD, {x: 100, y: 50}, [SIDE_END], 1, true);
    expect(p.hover).toBeNull();
    expect(p.snap).toBeNull();
    expect(p.closeOnto).toBeNull();
    expect(p.shape).toEqual(shapeTo(RAILHEAD, {x: 100, y: 50}));
  });

  it('suspending snapping with no railhead previews nothing', () => {
    const p = computePreview(null, {x: 100, y: 50}, [SIDE_END], 1, true);
    expect(p.hover).toBeNull();
    expect(p.shape).toBeNull();
  });
});
