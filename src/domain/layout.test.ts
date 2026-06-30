import {describe, it, expect} from 'vitest';
import {posesAlign, unionBounds, type Bounds, type Pose} from './geometry';
import {
  anchorSection,
  EMPTY_LAYOUT,
  joinSection,
  openEnds,
  partner,
  placeLayout,
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
    anchor
  );
  layout = joinSection(
    layout,
    end('s1', 'B'),
    withId('s2', curve(radius, 180, 'ccw')),
    null
  );
  layout = joinSection(
    layout,
    end('s2', 'B'),
    withId('s3', straight(straightLength)),
    null
  );
  return joinSection(
    layout,
    end('s3', 'B'),
    withId('s4', curve(radius, 180, 'ccw')),
    end('s1', 'A')
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
      ORIGIN
    );
    const placed = placeLayout(layout).sectionsById.get('s1');
    expect(placed).toBeDefined();
    expect(endPose(placed!, 'A')).toEqual(ORIGIN);
    expect(endPose(placed!, 'B').position.x).toBeCloseTo(100);
    expect(openEnds(layout)).toEqual([end('s1', 'A'), end('s1', 'B')]);
  });

  it('threads a run, meeting each joined A end to the previous open end', () => {
    let layout = anchorSection(
      EMPTY_LAYOUT,
      withId('s1', straight(100)),
      ORIGIN
    );
    layout = joinSection(
      layout,
      end('s1', 'B'),
      withId('s2', curve(50, 90, 'ccw')),
      null
    );
    const placed = placeLayout(layout).sectionsById;
    // s2's A sits exactly on s1's B.
    expect(endPose(placed.get('s2')!, 'A')).toEqual(
      endPose(placed.get('s1')!, 'B')
    );
    // The quarter turn leaves heading north at (100 + 50, 50).
    const b = endPose(placed.get('s2')!, 'B');
    expect(b.position.x).toBeCloseTo(150);
    expect(b.position.y).toBeCloseTo(50);
    expect(b.heading).toBeCloseTo(Math.PI / 2);
  });

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
      ORIGIN
    );
    expect(openEnds(layout)).toEqual([end('s1', 'A'), end('s1', 'B')]);
  });

  it('drops a joined end and keeps the free ones, in order', () => {
    let layout = anchorSection(
      EMPTY_LAYOUT,
      withId('s1', straight(100)),
      ORIGIN
    );
    layout = joinSection(
      layout,
      end('s1', 'B'),
      withId('s2', straight(100)),
      null
    );
    // s1.B and s2.A are joined; s1.A and s2.B remain open.
    expect(openEnds(layout)).toEqual([end('s1', 'A'), end('s2', 'B')]);
  });

  it('exposes none once the loop is closed', () => {
    expect(openEnds(oval(ORIGIN, inches(48), inches(18)))).toEqual([]);
  });
});

describe('partner', () => {
  let layout: Layout = anchorSection(
    EMPTY_LAYOUT,
    withId('s1', straight(100)),
    ORIGIN
  );
  layout = joinSection(
    layout,
    end('s1', 'B'),
    withId('s2', straight(100)),
    null
  );

  it('reports the joined end from either side', () => {
    expect(partner(layout, end('s1', 'B'))).toEqual(end('s2', 'A'));
    expect(partner(layout, end('s2', 'A'))).toEqual(end('s1', 'B'));
  });

  it('reports null for an open end', () => {
    expect(partner(layout, end('s1', 'A'))).toBeNull();
    expect(partner(layout, end('s2', 'B'))).toBeNull();
  });
});

describe('anchorSection', () => {
  it('adds the section and one anchor at its A end, leaving inputs untouched', () => {
    const before = EMPTY_LAYOUT;
    const layout = anchorSection(before, withId('s1', straight(100)), ORIGIN);
    expect(layout.sections.map(s => s.id)).toEqual(['s1']);
    expect(layout.anchors).toEqual([
      {sectionEnd: end('s1', 'A'), pose: ORIGIN},
    ]);
    expect(layout.joins).toEqual([]);
    expect(before.sections).toEqual([]); // input unmutated
  });
});

describe('joinSection', () => {
  const base = anchorSection(EMPTY_LAYOUT, withId('s1', straight(100)), ORIGIN);

  it('adds the section and one join between the open end and the new A', () => {
    const layout = joinSection(
      base,
      end('s1', 'B'),
      withId('s2', straight(100)),
      null
    );
    expect(layout.sections.map(s => s.id)).toEqual(['s1', 's2']);
    expect(layout.joins).toEqual([{ends: [end('s1', 'B'), end('s2', 'A')]}]);
    expect(base.sections.map(s => s.id)).toEqual(['s1']); // input unmutated
  });

  it('records a second join closing the new B onto an aligned open end', () => {
    // The oval's last curve closes onto the anchored A end: joinSection records
    // both the join onto the railhead and the closing join.
    const layout = oval(ORIGIN, inches(48), inches(18));
    expect(layout.joins).toContainEqual({
      ends: [end('s4', 'B'), end('s1', 'A')],
    });
  });

  it('records a misaligned closeOnto; placement, not joinSection, rejects it', () => {
    // s2 is a straight from (100,0) to (200,0); asserting its B closes onto
    // s1's A at the origin cannot hold. joinSection is pure topology, so it
    // records the join without complaint — placeLayout is where the geometry is
    // found unsatisfiable.
    const layout = joinSection(
      base,
      end('s1', 'B'),
      withId('s2', straight(100)),
      end('s1', 'A')
    );
    expect(layout.joins).toContainEqual({
      ends: [end('s2', 'B'), end('s1', 'A')],
    });
    expect(() => placeLayout(layout)).toThrow(RangeError);
  });
});
