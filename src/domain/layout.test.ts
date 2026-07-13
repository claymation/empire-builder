import {describe, it, expect} from 'vitest';
import {
  cross,
  degToRad,
  dot,
  normalizeAngle,
  posesAlign,
  posesEqual,
  reversePose,
  subtract,
  unionBounds,
  unitVector,
  type Bounds,
  type Pose,
} from '../lib/geometry';
import {
  anchorSection,
  EMPTY_LAYOUT,
  feasible,
  joinSection,
  openEnds,
  findNeighborEnd,
  placeLayout,
  poseOf,
  type Layout,
  type SectionEnd,
} from './layout';
import {
  curve,
  endPose,
  sectionBounds,
  straight,
  type Section,
  type SectionShape,
} from './section';
import {makeSpace, spaceContains} from './space';
import {feet, inches} from './units';

/** A pose at the origin, facing east (+x). */
const ORIGIN: Pose = {position: {x: 0, y: 0}, heading: 0};

/** A shape given an id, so the layout can join and reference it. */
function withId(id: string, shape: SectionShape): Section {
  return {...shape, id};
}

const end = (sectionId: string, name: 'A' | 'B'): SectionEnd => ({
  sectionId,
  end: name,
});

/** The bounding box covering every placed section of `layout`. */
function layoutBounds(layout: Layout): Bounds {
  return [...placeLayout(layout).sectionsById.values()]
    .map(sectionBounds)
    .reduce(unionBounds);
}

/**
 * The canonical first layout, built end to end: two straights joined by two 180°
 * curves, the last curve closing back onto the anchored A end.
 */
function oval(anchor: Pose, straightLength: number, radius: number): Layout {
  let layout = anchorSection(
    EMPTY_LAYOUT,
    withId('s1', straight(straightLength)),
    'A',
    anchor
  );
  layout = joinSection(
    layout,
    end('s1', 'B'),
    withId('s2', curve(radius, 180)),
    'A'
  );
  layout = joinSection(
    layout,
    end('s2', 'B'),
    withId('s3', straight(straightLength)),
    'A'
  );
  // The last curve's far end lands back on the anchored A: the loop close is
  // derived from that coincidence, no longer named by the caller.
  return joinSection(
    layout,
    end('s3', 'B'),
    withId('s4', curve(radius, 180)),
    'A'
  );
}

describe('placeLayout', () => {
  it('places nothing for the empty layout', () => {
    expect(placeLayout(EMPTY_LAYOUT).sectionsById.size).toBe(0);
  });

  it('places a planted section at its anchor, exposing two open ends', () => {
    const layout = anchorSection(
      EMPTY_LAYOUT,
      withId('s1', straight(100)),
      'A',
      ORIGIN
    );
    const placed = placeLayout(layout).sectionsById.get('s1');
    expect(placed).toBeDefined();
    expect(endPose(placed!, 'A')).toEqual(ORIGIN);
    expect(endPose(placed!, 'B').position.x).toBeCloseTo(100);
    expect(openEnds(layout)).toEqual([end('s1', 'A'), end('s1', 'B')]);
  });

  it('threads a run, seating each joined A end back-to-back on the previous open end', () => {
    let layout = anchorSection(
      EMPTY_LAYOUT,
      withId('s1', straight(100)),
      'A',
      ORIGIN
    );
    layout = joinSection(
      layout,
      end('s1', 'B'),
      withId('s2', curve(50, 90)),
      'A'
    );
    const placed = placeLayout(layout).sectionsById;
    // s2's A shares s1's B position, the poses mutually reversed.
    const s1b = endPose(placed.get('s1')!, 'B');
    const s2a = endPose(placed.get('s2')!, 'A');
    expect(posesEqual(s2a, reversePose(s1b))).toBe(true);
    // The quarter turn exits north at (100 + 50, 50); B's pose faces back south.
    const b = endPose(placed.get('s2')!, 'B');
    expect(b.position.x).toBeCloseTo(150);
    expect(b.position.y).toBeCloseTo(50);
    expect(normalizeAngle(b.heading)).toBeCloseTo((3 * Math.PI) / 2);
  });

  it('seats a neighbor B↔B: the tails meet, the sections extend apart', () => {
    // s1 runs (0,0)→(100,0). The join meets s1's B with s2's *B*: the tails
    // share (100,0) and the sections extend on opposite sides of it, so s2
    // runs on to its A at (160,0).
    const layout: Layout = {
      sections: [withId('s1', straight(100)), withId('s2', straight(60))],
      joins: [{ends: [end('s1', 'B'), end('s2', 'B')]}],
      anchors: [{sectionEnd: end('s1', 'A'), pose: ORIGIN}],
    };
    const placed = placeLayout(layout).sectionsById;
    const b = endPose(placed.get('s2')!, 'B');
    expect(b.position.x).toBeCloseTo(100);
    expect(b.position.y).toBeCloseTo(0);
    const a = endPose(placed.get('s2')!, 'A');
    expect(a.position.x).toBeCloseTo(160);
    expect(a.position.y).toBeCloseTo(0);
  });

  it('anchors and threads a network placed by a B end', () => {
    // Anchor s1 by its B at the origin: the anchor pose faces into the section,
    // so s1 extends east, its open A at (100,0). Placement must seat s1 by B
    // and still carry the join across to s2.
    let layout = anchorSection(
      EMPTY_LAYOUT,
      withId('s1', straight(100)),
      'B',
      ORIGIN
    );
    layout = joinSection(
      layout,
      end('s1', 'A'),
      withId('s2', straight(40)),
      'A'
    );
    const placed = placeLayout(layout).sectionsById;
    // s1's B sits at the anchor; its A a length up the anchor's heading.
    expect(posesEqual(endPose(placed.get('s1')!, 'B'), ORIGIN)).toBe(true);
    expect(endPose(placed.get('s1')!, 'A').position.x).toBeCloseTo(100);
    // s2's A meets s1's A at (100,0); s2 runs 40 beyond, away from s1.
    expect(endPose(placed.get('s2')!, 'A').position.x).toBeCloseTo(100);
    expect(endPose(placed.get('s2')!, 'B').position.x).toBeCloseTo(140);
  });

  it('places a section reachable only through the anchored end’s join', () => {
    // s1 anchored by A at the origin extends east; s2 joined A↔A onto that
    // same anchored end hangs off it alone, so threading must walk the
    // anchored end's join: s2 extends west, away from s1.
    let layout = anchorSection(
      EMPTY_LAYOUT,
      withId('s1', straight(100)),
      'A',
      ORIGIN
    );
    layout = joinSection(
      layout,
      end('s1', 'A'),
      withId('s2', straight(60)),
      'A'
    );
    const placed = placeLayout(layout);
    const s2a = poseOf(placed, end('s2', 'A'));
    expect(posesEqual(s2a, reversePose(poseOf(placed, end('s1', 'A'))))).toBe(
      true
    );
    const s2b = poseOf(placed, end('s2', 'B'));
    expect(s2b.position.x).toBeCloseTo(-60);
    expect(s2b.position.y).toBeCloseTo(0);
  });

  it('extends a section joined A↔A away from the anchored section', () => {
    // s1, anchored by its B, runs 100 up-and-right at 30°; its open A sits at
    // the far end, facing back down the run. s2 joined A↔A seats back-to-back
    // there, extending the run away from s1 rather than doubling back over it —
    // the placement growing new track out of an anchored A end needs.
    const heading = degToRad(30);
    const anchor: Pose = {position: {x: 3, y: -2}, heading};
    let layout = anchorSection(
      EMPTY_LAYOUT,
      withId('s1', straight(100)),
      'B',
      anchor
    );
    layout = joinSection(
      layout,
      end('s1', 'A'),
      withId('s2', straight(60)),
      'A'
    );
    const placed = placeLayout(layout);
    const s1a = poseOf(placed, end('s1', 'A'));
    const s2a = poseOf(placed, end('s2', 'A'));
    expect(posesEqual(s2a, reversePose(s1a))).toBe(true);
    const s2b = poseOf(placed, end('s2', 'B'));
    expect(s2b.position.x).toBeCloseTo(3 + 160 * Math.cos(heading));
    expect(s2b.position.y).toBeCloseTo(-2 + 160 * Math.sin(heading));
  });

  for (const sweepDeg of [90, -90]) {
    it(`seats a curve joined B↔B beyond the shared point (${sweepDeg}°)`, () => {
      // s1 runs 80 up-and-left at 115°; the join meets its B with the curve's
      // B, so the curve extends beyond the meeting point: its 90° chord carries
      // its far end one radius ahead along the run and one radius aside. The
      // side follows the sweep presented backward — entered through B, a
      // counter-clockwise curve bends right of the run.
      const heading = degToRad(115);
      let layout = anchorSection(
        EMPTY_LAYOUT,
        withId('s1', straight(80)),
        'A',
        {position: {x: -4, y: 7}, heading}
      );
      layout = joinSection(
        layout,
        end('s1', 'B'),
        withId('s2', curve(50, sweepDeg)),
        'B'
      );
      const placed = placeLayout(layout);
      const s1b = poseOf(placed, end('s1', 'B'));
      const s2b = poseOf(placed, end('s2', 'B'));
      expect(posesEqual(s2b, reversePose(s1b))).toBe(true);
      const reach = subtract(
        poseOf(placed, end('s2', 'A')).position,
        s2b.position
      );
      expect(dot(unitVector(heading), reach)).toBeCloseTo(50);
      expect(cross(unitVector(heading), reach)).toBeCloseTo(
        sweepDeg > 0 ? -50 : 50
      );
    });
  }

  it('closes the oval into a loop with no open ends', () => {
    const layout = oval(ORIGIN, inches(48), inches(18));
    expect(() => placeLayout(layout)).not.toThrow();
    // The closing curve's B end lands back on the anchored A.
    const s4Exit = endPose(placeLayout(layout).sectionsById.get('s4')!, 'B');
    expect(posesAlign(s4Exit, ORIGIN, 1e-6, 1e-6)).toBe(true);
    expect(openEnds(layout)).toEqual([]);
  });

  it('gives the oval bounds of (straight + 2·radius) by (2·radius)', () => {
    const b = layoutBounds(oval(ORIGIN, inches(48), inches(18)));
    expect(b.maxX - b.minX).toBeCloseTo(inches(48) + 2 * inches(18));
    expect(b.maxY - b.minY).toBeCloseTo(2 * inches(18));
  });

  it('exactly fills the sheet at the limiting radius', () => {
    // A 24" radius makes the oval 96"×48" — flush with an 8'×4' sheet.
    const sheet = makeSpace(feet(8), feet(4));
    const anchor: Pose = {position: {x: inches(24), y: 0}, heading: 0};
    const b = layoutBounds(oval(anchor, inches(48), inches(24)));
    expect(spaceContains(sheet, b, 1e-6)).toBe(true);
  });

  it('overflows when the radius is a hair too large for the depth', () => {
    // 24.001" radius needs 48.002" of depth; the sheet is only 48" deep.
    const sheet = makeSpace(feet(8), feet(4));
    const anchor: Pose = {position: {x: inches(24.001), y: 0}, heading: 0};
    const b = layoutBounds(oval(anchor, inches(48), inches(24.001)));
    expect(spaceContains(sheet, b)).toBe(false);
  });

  it('places an absorbed network at the poses it had under its own anchor', () => {
    // Two parallel straights heading 30°, each its own network; a 180° curve
    // grown from s1's B closes B↔B onto s2's B, fusing them. s2's anchor is
    // gone, so threading through the new joins must reproduce the poses s2
    // had under it.
    const heading = degToRad(30);
    const anchor1: Pose = {position: {x: 3, y: -2}, heading};
    // One curve-diameter to the left of s1's run.
    const anchor2: Pose = {
      position: {
        x: 3 - 100 * Math.sin(heading),
        y: -2 + 100 * Math.cos(heading),
      },
      heading,
    };
    let layout = anchorSection(
      EMPTY_LAYOUT,
      withId('s1', straight(100)),
      'A',
      anchor1
    );
    layout = anchorSection(layout, withId('s2', straight(100)), 'A', anchor2);
    const separate = placeLayout(layout);
    const merged = joinSection(
      layout,
      end('s1', 'B'),
      withId('s3', curve(50, 180)),
      'A'
    );
    expect(merged.anchors).toEqual([
      {sectionEnd: end('s1', 'A'), pose: anchor1},
    ]);
    const placed = placeLayout(merged);
    for (const name of ['A', 'B'] as const) {
      const pose = poseOf(placed, end('s2', name));
      const before = poseOf(separate, end('s2', name));
      expect(pose.position.x).toBeCloseTo(before.position.x);
      expect(pose.position.y).toBeCloseTo(before.position.y);
      expect(normalizeAngle(pose.heading)).toBeCloseTo(
        normalizeAngle(before.heading)
      );
    }
  });

  it('throws when a closing join does not align', () => {
    // Two straights end to end, then a closing join asserting the second's B
    // meets the first's A — which it cannot: they sit 200 apart.
    const misaligned: Layout = {
      sections: [withId('s1', straight(100)), withId('s2', straight(100))],
      joins: [
        {ends: [end('s1', 'B'), end('s2', 'A')]},
        {ends: [end('s2', 'B'), end('s1', 'A')]},
      ],
      anchors: [{sectionEnd: end('s1', 'A'), pose: ORIGIN}],
    };
    expect(() => placeLayout(misaligned)).toThrow(RangeError);
  });
});

describe('openEnds', () => {
  it('has no open end in the empty layout', () => {
    expect(openEnds(EMPTY_LAYOUT)).toEqual([]);
  });

  it('exposes both ends of a planted section, A before B', () => {
    const layout = anchorSection(
      EMPTY_LAYOUT,
      withId('s1', straight(100)),
      'A',
      ORIGIN
    );
    expect(openEnds(layout)).toEqual([end('s1', 'A'), end('s1', 'B')]);
  });

  it('drops a joined end and keeps the free ones, in order', () => {
    let layout = anchorSection(
      EMPTY_LAYOUT,
      withId('s1', straight(100)),
      'A',
      ORIGIN
    );
    layout = joinSection(
      layout,
      end('s1', 'B'),
      withId('s2', straight(100)),
      'A'
    );
    // s1.B and s2.A are joined; s1.A and s2.B remain open.
    expect(openEnds(layout)).toEqual([end('s1', 'A'), end('s2', 'B')]);
  });

  it('exposes none once the loop is closed', () => {
    expect(openEnds(oval(ORIGIN, inches(48), inches(18)))).toEqual([]);
  });
});

describe('findNeighborEnd', () => {
  let layout: Layout = anchorSection(
    EMPTY_LAYOUT,
    withId('s1', straight(100)),
    'A',
    ORIGIN
  );
  layout = joinSection(
    layout,
    end('s1', 'B'),
    withId('s2', straight(100)),
    'A'
  );

  it('reports the joined end from either side', () => {
    expect(findNeighborEnd(layout, end('s1', 'B'))).toEqual(end('s2', 'A'));
    expect(findNeighborEnd(layout, end('s2', 'A'))).toEqual(end('s1', 'B'));
  });

  it('reports null for an open end', () => {
    expect(findNeighborEnd(layout, end('s1', 'A'))).toBeNull();
    expect(findNeighborEnd(layout, end('s2', 'B'))).toBeNull();
  });
});

describe('anchorSection', () => {
  it('adds the section and one anchor at the named end, leaving inputs untouched', () => {
    const before = EMPTY_LAYOUT;
    const layout = anchorSection(
      before,
      withId('s1', straight(100)),
      'A',
      ORIGIN
    );
    expect(layout.sections.map(s => s.id)).toEqual(['s1']);
    expect(layout.anchors).toEqual([
      {sectionEnd: end('s1', 'A'), pose: ORIGIN},
    ]);
    expect(layout.joins).toEqual([]);
    expect(before.sections).toEqual([]); // input unmutated
  });

  it('anchors at the B end when named', () => {
    const layout = anchorSection(
      EMPTY_LAYOUT,
      withId('s1', straight(100)),
      'B',
      ORIGIN
    );
    expect(layout.anchors).toEqual([
      {sectionEnd: end('s1', 'B'), pose: ORIGIN},
    ]);
  });
});

describe('joinSection', () => {
  const base = anchorSection(
    EMPTY_LAYOUT,
    withId('s1', straight(100)),
    'A',
    ORIGIN
  );

  it('adds the section and one join between the open end and the attaching end', () => {
    const layout = joinSection(
      base,
      end('s1', 'B'),
      withId('s2', straight(100)),
      'A'
    );
    expect(layout.sections.map(s => s.id)).toEqual(['s1', 's2']);
    expect(layout.joins).toEqual([{ends: [end('s1', 'B'), end('s2', 'A')]}]);
    expect(base.sections.map(s => s.id)).toEqual(['s1']); // input unmutated
  });

  it('attaches by the named end, joining the open end to that end', () => {
    const layout = joinSection(
      base,
      end('s1', 'B'),
      withId('s2', straight(100)),
      'B'
    );
    expect(layout.joins).toEqual([{ends: [end('s1', 'B'), end('s2', 'B')]}]);
  });

  it('derives the far join when the far end lands back on an open end', () => {
    // The oval's last curve lands its B on the anchored A: joinSection records
    // both the join onto the railhead and the derived closing join.
    const layout = oval(ORIGIN, inches(48), inches(18));
    expect(layout.joins).toContainEqual({
      ends: [end('s4', 'B'), end('s1', 'A')],
    });
  });

  /** Two parallel straights, each its own network: s1 at the origin, s2 one
   *  curve-diameter above it, both heading east. */
  function twoNetworks(): Layout {
    const layout = anchorSection(
      EMPTY_LAYOUT,
      withId('s1', straight(100)),
      'A',
      ORIGIN
    );
    return anchorSection(layout, withId('s2', straight(100)), 'A', {
      position: {x: 0, y: 100},
      heading: 0,
    });
  }

  it('a fuse onto another network drops the absorbed anchor, keeping from’s', () => {
    const before = twoNetworks();
    // s3's far end lands back-to-back on s2's B, fusing the two networks.
    const merged = joinSection(
      before,
      end('s1', 'B'),
      withId('s3', curve(50, 180)),
      'A'
    );
    expect(merged.anchors).toEqual([
      {sectionEnd: end('s1', 'A'), pose: ORIGIN},
    ]);
    expect(before.anchors).toHaveLength(2); // input unmutated
  });

  it('a same-network loop keeps the anchor: membership decides, not the far join', () => {
    const closed = oval(ORIGIN, inches(48), inches(18));
    expect(closed.anchors).toEqual([
      {sectionEnd: end('s1', 'A'), pose: ORIGIN},
    ]);
  });

  it('a plain join never touches the anchors', () => {
    const grown = joinSection(
      twoNetworks(),
      end('s1', 'B'),
      withId('s3', straight(40)),
      'A'
    );
    expect(grown.anchors).toHaveLength(2);
  });

  it('throws when the far end would kink onto an open end', () => {
    // s2's open A sits exactly where s3's far end lands, but faces north — not
    // back toward it. The join would kink, so the domain refuses it at commit
    // rather than record a bad join for placement to discover later.
    let layout = anchorSection(
      EMPTY_LAYOUT,
      withId('s1', straight(100)),
      'A',
      ORIGIN
    );
    layout = anchorSection(layout, withId('s2', straight(100)), 'A', {
      position: {x: 100, y: 100},
      heading: Math.PI / 2,
    });
    expect(() =>
      joinSection(layout, end('s1', 'B'), withId('s3', curve(50, 180)), 'A')
    ).toThrow(RangeError);
  });

  it('joins the seating end when a coincident sibling would kink', () => {
    // s2.A and s3.A both sit at (150,0): s2 faces north (a kink), s3 faces east
    // (seats back-to-back with the far end). The join must find s3 regardless of
    // s2 being anchored first — the verdict follows geometry, not insertion order.
    let layout = anchorSection(
      EMPTY_LAYOUT,
      withId('s1', straight(100)),
      'A',
      ORIGIN
    );
    layout = anchorSection(layout, withId('s2', straight(100)), 'A', {
      position: {x: 150, y: 0},
      heading: Math.PI / 2,
    });
    layout = anchorSection(layout, withId('s3', straight(100)), 'A', {
      position: {x: 150, y: 0},
      heading: 0,
    });
    // A straight from s1's B lands its far end at (150,0) facing west — the
    // reverse of s3's east-facing A.
    const joined = joinSection(
      layout,
      end('s1', 'B'),
      withId('s4', straight(50)),
      'A'
    );
    expect(joined.joins).toContainEqual({
      ends: [end('s4', 'B'), end('s3', 'A')],
    });
  });

  it('derives no far join when the far end reaches open space', () => {
    // s2 runs on to (200,0); nothing sits there, so only the near join is
    // recorded and both far ends stay open.
    const layout = joinSection(
      base,
      end('s1', 'B'),
      withId('s2', straight(100)),
      'A'
    );
    expect(layout.joins).toEqual([{ends: [end('s1', 'B'), end('s2', 'A')]}]);
    expect(openEnds(layout)).toContainEqual(end('s2', 'B'));
  });
});

describe('feasible', () => {
  const eastAt = (x: number, y: number): Pose => ({
    position: {x, y},
    heading: 0,
  });

  // s1 straight(100) from the origin heading east; open ends at (0,0) and
  // (100,0). A section laid from (100,0) heading east extends into open space.
  const base = anchorSection(
    EMPTY_LAYOUT,
    withId('s1', straight(100)),
    'A',
    ORIGIN
  );

  it('accepts a section whose far end reaches open space', () => {
    expect(feasible(base, eastAt(100, 0), straight(50))).toBe(true);
  });

  it('accepts a far end that seats back-to-back on an open end', () => {
    // A straight from (100,0) east ends at (150,0); place an open end there
    // facing east, so the far end seats back-to-back.
    const layout = anchorSection(
      base,
      withId('s2', straight(30)),
      'A',
      eastAt(150, 0)
    );
    expect(feasible(layout, eastAt(100, 0), straight(50))).toBe(true);
  });

  it('rejects a far end that meets an open end off-tangent', () => {
    // An open end at (150,0) facing north: the far end shares the point but
    // faces east — a kink.
    const layout = anchorSection(base, withId('s2', straight(30)), 'A', {
      position: {x: 150, y: 0},
      heading: Math.PI / 2,
    });
    expect(feasible(layout, eastAt(100, 0), straight(50))).toBe(false);
  });
});
