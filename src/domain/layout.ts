/**
 * The track plan as a graph (US-3, US-4, US-5): sections are nodes, joins are the
 * edges between their ends, and anchors place each network in the plane.
 *
 * {@link placeLayout} locates every section by threading each network from its
 * anchor, walking the joins to carry a pose from one section's end to the next.
 * Because joined ends share a pose, tangency holds by construction — there is no
 * way to express a kink between connected sections. {@link openEnds} reports the
 * ends carrying no join, the places a new section can grow from; {@link
 * anchorSection}/{@link joinSection} grow the graph.
 */

import {degToRad, posesAlign, Pose} from './geometry';
import {
  endPose,
  EndName,
  placeSection,
  PlacedSection,
  Section,
  SectionId,
} from './section';

// Distances (mm) below this are treated as zero.
const EPSILON = 1e-9;

/**
 * The largest heading mismatch (radians) at which two section ends count as
 * meeting tangentially — the single tolerance that defines an aligned join. It
 * gates whether the snap offers a point onto an open end (../domain/snapping)
 * and whether {@link placeLayout} accepts a closing join. Wider tolerates a
 * slight kink at a join; tighter demands a more exact approach.
 */
export const CONNECTION_HEADING_TOLERANCE = degToRad(2);

/** A reference to one end of a section: which section, which end. */
export interface SectionEnd {
  readonly section: SectionId;
  readonly end: EndName;
}

/**
 * A join fixes two section ends to the same place: equal position and parallel
 * heading (the same line, either direction), within tolerance. Unordered and
 * directionless; threading discovers a route's direction from an anchor. Each
 * end takes part in at most one join.
 */
export interface Join {
  readonly ends: readonly [SectionEnd, SectionEnd];
}

/**
 * Anchors a network to the plane: its `sectionEnd` sits at world pose `pose`,
 * and every other pose in its network derives by threading. One anchor per
 * network fixes that network's absolute placement.
 */
export interface Anchor {
  readonly sectionEnd: SectionEnd;
  readonly pose: Pose;
}

/**
 * The track plan as a graph: the sections, the joins between their ends, and the
 * anchors that place each network. Plain, serializable data; placed geometry is
 * derived on demand by {@link placeLayout}, never stored here.
 */
export interface Layout {
  readonly sections: readonly Section[];
  readonly joins: readonly Join[];
  readonly anchors: readonly Anchor[];
}

/** The empty plan: no sections, joins, or anchors. */
export const EMPTY_LAYOUT: Layout = {sections: [], joins: [], anchors: []};

/**
 * Every section located, keyed by id. Iterate `sectionsById.values()` to draw
 * them all; look one up by id to read an end's world pose.
 */
export interface PlacedLayout {
  readonly sectionsById: ReadonlyMap<SectionId, PlacedSection>;
}

/**
 * Locates every section by threading each network from its anchor: place the
 * anchored section by its `entry`, then walk each section's exit join to place
 * the neighbor's `entry` at the pose carried across the shared join (exit→entry).
 * On reaching an already-placed section — the join that closes a cycle, e.g. the
 * oval's last join — it does not re-place: it checks the join is aligned
 * ({@link posesAlign}) and stops. An unaligned revisit throws {@link RangeError}:
 * no single placement aligns the closing join. Threading is forward-only — every
 * section is reached downstream of an anchor's `entry`.
 */
export function placeLayout(layout: Layout): PlacedLayout {
  const byId = new Map(layout.sections.map(section => [section.id, section]));
  const placed = new Map<SectionId, PlacedSection>();
  for (const anchor of layout.anchors) {
    threadNetwork(layout, byId, anchor, placed);
  }
  return {sectionsById: placed};
}

/**
 * Every section end carrying no join — the places a new section can grow from.
 * Pure topology: openness is the absence of a join, so this needs only the
 * `Layout`, not a placement. An anchored end is open until something joins it; a
 * loop closes by joining onto it, after which the network exposes no open end and
 * drawing has nowhere to go. Ordering is deterministic: sections in order, entry
 * before exit. A caller wanting an end's world pose derives it from a
 * {@link PlacedLayout}.
 */
export function openEnds(layout: Layout): readonly SectionEnd[] {
  const joined = new Set<string>();
  for (const join of layout.joins) {
    for (const end of join.ends) {
      joined.add(endKey(end));
    }
  }
  const open: SectionEnd[] = [];
  for (const section of layout.sections) {
    for (const end of ['entry', 'exit'] as const) {
      const sectionEnd: SectionEnd = {section: section.id, end};
      if (!joined.has(endKey(sectionEnd))) {
        open.push(sectionEnd);
      }
    }
  }
  return open;
}

/** The end joined to `at`, or null if `at` is open. Symmetric. */
export function partner(layout: Layout, at: SectionEnd): SectionEnd | null {
  for (const join of layout.joins) {
    const [a, b] = join.ends;
    if (sameEnd(a, at)) {
      return b;
    }
    if (sameEnd(b, at)) {
      return a;
    }
  }
  return null;
}

/** Start a new network: add `section`, anchored by its `entry` at `pose`. */
export function anchorSection(
  layout: Layout,
  section: Section,
  pose: Pose
): Layout {
  return {
    sections: [...layout.sections, section],
    joins: layout.joins,
    anchors: [
      ...layout.anchors,
      {sectionEnd: {section: section.id, end: 'entry'}, pose},
    ],
  };
}

/**
 * Join `section` onto open end `at`, recording a join between `at` and the new
 * section's `entry`. When the new `exit` lands on an existing open end
 * `closeOnto`, record that join too — the loop close.
 *
 * Pure topology: whether a `closeOnto` actually aligns is a geometric fact,
 * surfaced where geometry is computed ({@link placeLayout}), not enforced here.
 */
export function joinSection(
  layout: Layout,
  at: SectionEnd,
  section: Section,
  closeOnto?: SectionEnd
): Layout {
  const entry: SectionEnd = {section: section.id, end: 'entry'};
  const joins: Join[] = [...layout.joins, {ends: [at, entry]}];
  if (closeOnto) {
    const exit: SectionEnd = {section: section.id, end: 'exit'};
    joins.push({ends: [exit, closeOnto]});
  }
  return {
    sections: [...layout.sections, section],
    joins,
    anchors: layout.anchors,
  };
}

/**
 * Threads one network: places the anchored section by its `entry`, then follows
 * each placed section's exit join forward, placing each neighbor's `entry` and
 * checking the join where it closes back onto an already-placed section.
 */
function threadNetwork(
  layout: Layout,
  byId: ReadonlyMap<SectionId, Section>,
  anchor: Anchor,
  placed: Map<SectionId, PlacedSection>
): void {
  const start = byId.get(anchor.sectionEnd.section);
  if (!start) {
    throw new RangeError(
      `anchor references unknown section ${anchor.sectionEnd.section}`
    );
  }
  // The anchor names the section's entry (anchorSection plants it there).
  const pending: Array<{section: Section; entry: Pose}> = [
    {section: start, entry: anchor.pose},
  ];
  for (let item = pending.shift(); item; item = pending.shift()) {
    const {section, entry} = item;
    if (placed.has(section.id)) {
      continue;
    }
    const placedSection = placeSection(section, entry);
    placed.set(section.id, placedSection);

    const neighbor = partner(layout, {section: section.id, end: 'exit'});
    if (!neighbor) {
      continue;
    }
    const exit = endPose(placedSection, 'exit');
    const alreadyPlaced = placed.get(neighbor.section);
    if (alreadyPlaced) {
      // The join closes a cycle: never re-place, only require it to align.
      const meeting = endPose(alreadyPlaced, neighbor.end);
      if (!posesAlign(exit, meeting, EPSILON, CONNECTION_HEADING_TOLERANCE)) {
        throw new RangeError(
          'a closing join does not align; geometry is unsatisfiable'
        );
      }
      continue;
    }
    const next = byId.get(neighbor.section);
    if (!next) {
      throw new RangeError(
        `join references unknown section ${neighbor.section}`
      );
    }
    pending.push({section: next, entry: exit});
  }
}

/** A stable string key for a section end, for membership tests. */
function endKey(end: SectionEnd): string {
  return `${end.section}:${end.end}`;
}

/** Whether two ends reference the same section end. */
function sameEnd(a: SectionEnd, b: SectionEnd): boolean {
  return a.section === b.section && a.end === b.end;
}
