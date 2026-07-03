import {describe, it, expect} from 'vitest';
import {degToRad, radToDeg, type Point, type Pose} from '../domain/geometry';
import {type SectionEnd, type SectionEndPose} from '../domain/layout';
import {shapeTo} from '../domain/snapping';
import {computePreview, type DrawOrigin} from './preview';

/** The railhead's outward pose: at the origin, facing east (+x). */
const RAILHEAD: Pose = {position: {x: 0, y: 0}, heading: 0};

/** A fixed-pose origin, as the editor passes a railhead or a locked anchor. */
const pose = (p: Pose): DrawOrigin => ({kind: 'pose', pose: p});

/** A pending anchor being aimed from `position`. */
const aim = (position: Point): DrawOrigin => ({kind: 'aim', position});

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
    const p = computePreview(pose(RAILHEAD), null, [SIDE_END], 1, false);
    expect(p.railhead).toBeNull();
    expect(p.shape).toBeNull();
    expect(p.hover).toBeNull();
  });

  it('hovers an open end with no railhead — the click can still select', () => {
    const p = computePreview(null, {x: 104, y: 53}, [SIDE_END], 1, false);
    expect(p.hover).toEqual(end('s', 'B'));
    expect(p.shape).toBeNull();
    expect(p.ghost).toBeNull();
    expect(p.anchorPoint).toBeNull(); // the click selects, never drops
  });

  it('drops at the pointer with no railhead and nothing in reach', () => {
    const p = computePreview(null, {x: 300, y: 300}, [SIDE_END], 1, false);
    expect(p.hover).toBeNull();
    expect(p.shape).toBeNull();
    expect(p.snap).toBeNull();
    expect(p.anchorPoint).toEqual({x: 300, y: 300});
  });

  it('pulls the free pointer onto a guideline — the anchor drops aligned', () => {
    // No railhead; the pointer rides just off the open end's normal line
    // (x = 100), far outside its ring. The drop point is the projection, so a
    // second network's anchor lands exactly abreast of the first's end.
    const p = computePreview(null, {x: 104, y: 250}, [SIDE_END], 1, false);
    expect(p.hover).toBeNull();
    expect(p.snap?.kind).toBe('line');
    expect(p.anchorPoint?.x).toBeCloseTo(100);
    expect(p.anchorPoint?.y).toBeCloseTo(250);
  });

  it('a hovered ring outranks the guideline pull', () => {
    // (100, 55) sits on the normal line and within the ring: the click
    // selects; no anchor drop, no guide.
    const p = computePreview(null, {x: 100, y: 55}, [SIDE_END], 1, false);
    expect(p.hover).toEqual(end('s', 'B'));
    expect(p.snap).toBeNull();
    expect(p.anchorPoint).toBeNull();
  });

  it('a railhead leaves anchorPoint null: the click lays, never drops', () => {
    const p = computePreview(
      pose(RAILHEAD),
      {x: 100, y: 62.1},
      [SIDE_END],
      1,
      false
    );
    expect(p.shape).not.toBeNull();
    expect(p.anchorPoint).toBeNull();
  });

  it('hovering suppresses the ghost, exactly to the ring radius', () => {
    // The pointer sits on the end's normal line, so without the hover the
    // preview would offer a line-snapped section; inside the ring radius the
    // hover claims the click instead. Pin the boundary: 12 px in, 12.1 px out.
    const inside = computePreview(
      pose(RAILHEAD),
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
      pose(RAILHEAD),
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
      pose(RAILHEAD),
      {x: 100, y: 55.9},
      [SIDE_END],
      2,
      false
    );
    expect(inside.hover).toEqual(end('s', 'B'));
    const outside = computePreview(
      pose(RAILHEAD),
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
      pose(RAILHEAD),
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
    const p = computePreview(pose(RAILHEAD), {x: 5, y: 5}, [own], 1, false);
    expect(p.hover).toEqual(end('r', 'B'));
    expect(p.shape).toBeNull();
  });

  it('hovers the nearest of two rings in reach', () => {
    const near = oe(end('n', 'A'), {position: {x: 100, y: 54}, heading: 0});
    const p = computePreview(
      pose(RAILHEAD),
      {x: 100, y: 53},
      [SIDE_END, near],
      1,
      false
    );
    expect(p.hover).toEqual(end('n', 'A'));
  });

  it('snaps a 180° curve from a locked heading onto its normal guideline', () => {
    // A network's first section with the aim locked: the anchor stands as a
    // full pose and no open end exists. A pointer just off abreast pulls onto
    // the pose's normal, so the half-circle starting a return loop is exact.
    const p = computePreview(pose(RAILHEAD), {x: 4, y: 100}, [], 1, false);
    expect(p.snap?.kind).toBe('line');
    expect(p.snap?.point.x).toBeCloseTo(0);
    expect(p.snap?.point.y).toBeCloseTo(100);
    if (p.shape?.kind !== 'curved') throw new Error('expected a curve');
    expect(radToDeg(p.shape.arc.sweep)).toBeCloseTo(180);
    expect(p.shape.arc.radius).toBeCloseTo(50);
  });

  it('suspending snapping lays the plain section, hovering nothing', () => {
    const p = computePreview(
      pose(RAILHEAD),
      {x: 100, y: 50},
      [SIDE_END],
      1,
      true
    );
    expect(p.hover).toBeNull();
    expect(p.snap).toBeNull();
    expect(p.closeOnto).toBeNull();
    expect(p.shape).toEqual(shapeTo(RAILHEAD, {x: 100, y: 50}));
  });

  it('suspending snapping with no railhead drops at the raw pointer', () => {
    const p = computePreview(null, {x: 100, y: 50}, [SIDE_END], 1, true);
    expect(p.hover).toBeNull();
    expect(p.shape).toBeNull();
    expect(p.snap).toBeNull();
    expect(p.anchorPoint).toEqual({x: 100, y: 50});
  });
});

describe('aiming a pending anchor', () => {
  it('aims a straight at the pointer, angle-snapping the heading', () => {
    // 43° lies within the 5° threshold of 45°: the aim snaps, and the
    // straight runs to the pointer's projection on the snapped heading.
    const target = {
      x: 100 * Math.cos(degToRad(43)),
      y: 100 * Math.sin(degToRad(43)),
    };
    const p = computePreview(aim({x: 0, y: 0}), target, [], 1, false);
    expect(p.railhead?.heading).toBeCloseTo(Math.PI / 4);
    if (p.shape?.kind !== 'straight') throw new Error('expected a straight');
    expect(p.shape.length).toBeCloseTo(100 * Math.cos(degToRad(2)));
  });

  it('keeps a deliberate off-grid aim', () => {
    // 38° sits 8° and 7° from the nearest multiples: no snap.
    const target = {
      x: 100 * Math.cos(degToRad(38)),
      y: 100 * Math.sin(degToRad(38)),
    };
    const p = computePreview(aim({x: 0, y: 0}), target, [], 1, false);
    expect(p.railhead?.heading).toBeCloseTo(degToRad(38));
    if (p.shape?.kind !== 'straight') throw new Error('expected a straight');
    expect(p.shape.length).toBeCloseTo(100);
  });

  it('offers only straights while aiming; the same pointer curves a locked pose', () => {
    const offAxis = {x: 100, y: 100};
    const aimed = computePreview(aim({x: 0, y: 0}), offAxis, [], 1, false);
    expect(aimed.shape?.kind).toBe('straight');
    const locked = computePreview(pose(RAILHEAD), offAxis, [], 1, false);
    expect(locked.shape?.kind).toBe('curved');
  });

  it('slides the straight onto a guideline, keeping the snapped aim', () => {
    // From (0, 200) toward a pointer a degree off level and 3 off the open
    // end's normal (x = 100): the aim snaps level, and the end slides to the
    // crossing (100, 200) — the length that lines up with the old track,
    // without tilting the run.
    const p = computePreview(
      aim({x: 0, y: 200}),
      {x: 103, y: 202},
      [SIDE_END],
      1,
      false
    );
    expect(p.railhead?.heading).toBeCloseTo(0);
    if (p.shape?.kind !== 'straight') throw new Error('expected a straight');
    expect(p.shape.length).toBeCloseTo(100);
    expect(p.snap?.kind).toBe('line');
    expect(p.snap?.point.x).toBeCloseTo(100);
    expect(p.snap?.point.y).toBeCloseTo(200);
  });

  it('a hovered ring outranks the aim', () => {
    const p = computePreview(
      aim({x: 0, y: 0}),
      {x: 100, y: 55},
      [SIDE_END],
      1,
      false
    );
    expect(p.hover).toEqual(end('s', 'B'));
    expect(p.shape).toBeNull();
  });

  it('suspending snapping aims raw at the pointer', () => {
    const target = {
      x: 100 * Math.cos(degToRad(43)),
      y: 100 * Math.sin(degToRad(43)),
    };
    const p = computePreview(aim({x: 0, y: 0}), target, [], 1, true);
    expect(p.railhead?.heading).toBeCloseTo(degToRad(43));
    if (p.shape?.kind !== 'straight') throw new Error('expected a straight');
    expect(p.shape.length).toBeCloseTo(100);
    expect(p.snap).toBeNull();
  });

  it('previews nothing from a degenerate aim', () => {
    const p = computePreview(aim({x: 3, y: 4}), {x: 3, y: 4}, [], 1, false);
    expect(p.shape).toBeNull();
    expect(p.railhead).toBeNull();
  });
});
