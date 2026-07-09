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

import {posesAlign, Pose, reversePose} from '../lib/geometry';
import {
  endPose,
  EndName,
  endsOf,
  placeSection,
  PlacedSection,
  Section,
  SectionId,
} from './section';

/** A reference to one end of a section: which section, which end. */
export interface SectionEnd {
  readonly sectionId: SectionId;
  readonly end: EndName;
}

/**
 * A join seats two section ends back-to-back: they share a position and their
 * poses are mutually reversed — each faces its own section, so the sections
 * extend on opposite sides of the shared point. Unordered and directionless;
 * threading discovers a route's direction from an anchor. Each end takes part
 * in at most one join.
 */
export interface Join {
  readonly ends: readonly [SectionEnd, SectionEnd];
}

/** A section end paired with a world pose. */
export interface SectionEndPose {
  readonly sectionEnd: SectionEnd;
  readonly pose: Pose;
}

/**
 * Anchors a network to the plane: a section end fixed at an absolute world pose,
 * from which every other pose in its network derives by threading. One anchor per
 * network fixes that network's placement. It is a {@link SectionEndPose} used in
 * that role — the pose is chosen, not derived.
 */
export type Anchor = SectionEndPose;

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
 * Locates every section by threading each network from its anchor: seat the
 * anchored section by the end its anchor names, then walk the joins, seating each
 * neighbor by the end its join names at the pose carried across that join. On
 * reaching an already-placed section — the join that closes a cycle, e.g. the
 * oval's last join — it does not re-place: it checks the join is aligned ({@link
 * posesAlign}) and stops. An unaligned revisit throws {@link RangeError}: no
 * single placement aligns the closing join.
 *
 * A section's placement is a function of the anchor, shapes, and joins, not of
 * the order joins are walked: whichever join reaches a section first seats it,
 * and any later join only checks alignment. A consistent network places the same
 * way under any order; an inconsistent one throws under any order.
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
 * drawing has nowhere to go. Ordering is deterministic: sections in order, each
 * section's ends in {@link endsOf} order. A caller wanting an end's world pose
 * derives it from a {@link PlacedLayout}.
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
    for (const end of endsOf(section)) {
      const sectionEnd: SectionEnd = {sectionId: section.id, end};
      if (!joined.has(endKey(sectionEnd))) {
        open.push(sectionEnd);
      }
    }
  }
  return open;
}

/** The world pose of `end` within a placed layout. */
export function poseOf(placed: PlacedLayout, end: SectionEnd): Pose {
  const section = placed.sectionsById.get(end.sectionId);
  if (!section) {
    throw new RangeError(`end references unplaced section ${end.sectionId}`);
  }
  return endPose(section, end.end);
}

/** Each open end paired with its world pose, ready to snap onto. */
export function openEndPoses(
  layout: Layout,
  placed: PlacedLayout
): SectionEndPose[] {
  return openEnds(layout).map(sectionEnd => ({
    sectionEnd,
    pose: poseOf(placed, sectionEnd),
  }));
}

/** Finds the end joined to `at`, at its neighbor; null if `at` is open. Symmetric. */
export function findNeighborEnd(
  layout: Layout,
  at: SectionEnd
): SectionEnd | null {
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

/** Start a new network: add `section`, anchored by its `end` at `pose`. */
export function anchorSection(
  layout: Layout,
  section: Section,
  end: EndName,
  pose: Pose
): Layout {
  return {
    sections: [...layout.sections, section],
    joins: layout.joins,
    anchors: [
      ...layout.anchors,
      {sectionEnd: {sectionId: section.id, end}, pose},
    ],
  };
}

/**
 * Join `section` onto open end `at`, seating the section's `end` there and
 * recording that join. When the section's other end lands on an existing open end
 * `closeOnto`, record that join too — the close.
 *
 * Joins keep one anchor per network: a close that fuses two networks drops the
 * absorbed network's anchor — the one `closeOnto`'s network carried — so the
 * network drawn from keeps its placement authority. The absorbed sections
 * re-derive their poses by threading through the new join. A close within one
 * network (the loop) keeps its anchor; membership, not the presence of
 * `closeOnto`, decides.
 *
 * Pure topology: whether a `closeOnto` actually aligns is a geometric fact,
 * surfaced where geometry is computed ({@link placeLayout}), not enforced here.
 */
export function joinSection(
  layout: Layout,
  at: SectionEnd,
  section: Section,
  end: EndName,
  closeOnto: SectionEnd | null
): Layout {
  const newEnd: SectionEnd = {sectionId: section.id, end};
  const joins: Join[] = [...layout.joins, {ends: [at, newEnd]}];
  let anchors = layout.anchors;
  if (closeOnto) {
    joins.push({
      ends: [{sectionId: section.id, end: otherEnd(section, end)}, closeOnto],
    });
    const closeOntoNetwork = networkOf(layout, closeOnto.sectionId);
    const spansTwoNetworks = !closeOntoNetwork.has(at.sectionId);
    if (spansTwoNetworks) {
      // The close fuses the two networks into one, which keeps `at`'s anchor:
      // the absorbed network's anchor is dropped, leaving one per network.
      anchors = anchors.filter(
        anchor => !closeOntoNetwork.has(anchor.sectionEnd.sectionId)
      );
    }
  }
  return {
    sections: [...layout.sections, section],
    joins,
    anchors,
  };
}

/** A section's end that is not `end` — the far end of a two-ended section. */
export function otherEnd(section: Section, end: EndName): EndName {
  const farEnd = endsOf(section).find(candidate => candidate !== end);
  if (!farEnd) {
    throw new RangeError(`section ${section.id} has no end besides ${end}`);
  }
  return farEnd;
}

/**
 * The ids of every section in `sectionId`'s network — its connected component of
 * the section–join graph. Computed from `joins` on demand rather than stored on
 * sections, so there is no derived network id to keep consistent as joins
 * accumulate.
 */
function networkOf(
  layout: Layout,
  sectionId: SectionId
): ReadonlySet<SectionId> {
  // One pass over the joins builds the adjacency, so the walk is linear in
  // sections and joins.
  const neighborsById = new Map<SectionId, SectionId[]>();
  const addNeighbor = (from: SectionId, to: SectionId) => {
    const neighbors = neighborsById.get(from);
    if (neighbors) {
      neighbors.push(to);
    } else {
      neighborsById.set(from, [to]);
    }
  };
  for (const join of layout.joins) {
    const [a, b] = join.ends;
    addNeighbor(a.sectionId, b.sectionId);
    addNeighbor(b.sectionId, a.sectionId);
  }
  const members = new Set<SectionId>([sectionId]);
  const pending = [sectionId];
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    for (const neighborId of neighborsById.get(id) ?? []) {
      if (!members.has(neighborId)) {
        members.add(neighborId);
        pending.push(neighborId);
      }
    }
  }
  return members;
}

/**
 * Threads one network: seats the anchored section by the end its anchor names, at
 * the anchor pose, then follows every end's join to seat the neighbor by the end
 * that join names, at the pose carried across the join — the near end's pose
 * reversed, seating the joined ends back-to-back. Each join is walked from both
 * sides, so a join on the anchored end reaches its neighbor. A section reached
 * again — back across the join that seated it, or by the join that closes a
 * cycle — is not re-placed: the join is only required to align
 * ({@link posesAlign}), else the geometry is unsatisfiable.
 *
 * A placement to seat is queued per join side; order of visitation does not
 * matter, since a section's placement is fixed by the anchor, shapes, and joins
 * alone.
 */
function threadNetwork(
  layout: Layout,
  byId: ReadonlyMap<SectionId, Section>,
  anchor: Anchor,
  placed: Map<SectionId, PlacedSection>
): void {
  const start = byId.get(anchor.sectionEnd.sectionId);
  if (!start) {
    throw new RangeError(
      `anchor references unknown section ${anchor.sectionEnd.sectionId}`
    );
  }
  const pending: Array<{section: Section; end: EndName; pose: Pose}> = [
    {section: start, end: anchor.sectionEnd.end, pose: anchor.pose},
  ];
  for (
    let placement = pending.shift();
    placement;
    placement = pending.shift()
  ) {
    const priorPlacedSection = placed.get(placement.section.id);
    if (priorPlacedSection) {
      // Reached again: never re-place, only require the arriving join aligns.
      if (
        !posesAlign(placement.pose, endPose(priorPlacedSection, placement.end))
      ) {
        throw new RangeError(
          'a closing join does not align; geometry is unsatisfiable'
        );
      }
      continue;
    }
    const placedSection = placeSection(
      placement.section,
      placement.end,
      placement.pose
    );
    placed.set(placement.section.id, placedSection);

    // Carry a pose across every end's join to the neighbor waiting there —
    // including the end this section was seated by, so a join on an anchored
    // end is walked too. Joined ends sit back-to-back: the neighbor's end
    // seats at the reverse of this end's pose. A carry back to the section
    // that seated this one finds it already placed and only re-checks
    // alignment.
    for (const from of endsOf(placement.section)) {
      const neighborEnd = findNeighborEnd(layout, {
        sectionId: placement.section.id,
        end: from,
      });
      if (!neighborEnd) {
        continue;
      }
      const neighbor = byId.get(neighborEnd.sectionId);
      if (!neighbor) {
        throw new RangeError(
          `join references unknown section ${neighborEnd.sectionId}`
        );
      }
      pending.push({
        section: neighbor,
        end: neighborEnd.end,
        pose: reversePose(endPose(placedSection, from)),
      });
    }
  }
}

/** A stable string key for a section end, for membership tests. */
function endKey(end: SectionEnd): string {
  return `${end.sectionId}:${end.end}`;
}

/** Whether two ends reference the same section end. */
export function sameEnd(a: SectionEnd, b: SectionEnd): boolean {
  return a.sectionId === b.sectionId && a.end === b.end;
}
