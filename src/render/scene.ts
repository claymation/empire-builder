/**
 * Rendering the layout onto a Paper.js canvas. This is the edge: Paper.js lives
 * here, and the domain (../domain) stays free of it. The pure coordinate math
 * lives in ./transform; this module is the thin Paper.js wrapper around it.
 *
 * The drawing is split across two layers, each a function of one source: the
 * layout layer (sheet, committed track, and the open ends' rings) draws the
 * placed layout and redraws only when it changes or the view resizes, while
 * the overlay (the selection and the pointer-follow preview) draws the
 * interaction state and is redrawn on its own every time the pointer moves.
 */

import paper from 'paper';
import {
  add,
  arcCenter,
  arcEndPoint,
  arcMidpoint,
  Line,
  normalize,
  normalizeAngle,
  PlacedArc,
  PlacedSegment,
  Point,
  Pose,
  radToDeg,
  scale,
  segmentEnd,
  subtract,
} from '../domain/geometry';
import {PlacedLayout} from '../domain/layout';
import {PlacedSection} from '../domain/section';
import {Snap} from '../domain/snapping';
import {Space} from '../domain/space';
import {toInches} from '../domain/units';
import {assertNever} from '../domain/validate';
import {fitTransform, ViewTransform} from './transform';

/** Pixels of breathing room left between the sheet and the canvas edge. */
const PADDING_PX = 24;

const PLYWOOD_FILL = '#e8d6b3';
const PLYWOOD_EDGE = '#b9966b';
const RAIL_COLOR = '#2b2b2b';
const PREVIEW_COLOR = '#3b82f6';
const RAIL_WIDTH_PX = 3;
const RAILHEAD_RADIUS_PX = 5;
const LABEL_OFFSET_PX = 18;
/** Accent for alignment feedback: the guide line and the open-end snap ring. */
const GUIDE_COLOR = '#ec4899';
const GUIDE_DASH = [4, 4];
const SNAP_RING_RADIUS_PX = 9;
/** Open-end rings: quiet when merely selectable, stronger when selected. */
const OPEN_RING_COLOR = '#9c9c9c';
const OPEN_RING_RADIUS_PX = 6;
const OPEN_RING_WIDTH_PX = 1.5;
const SELECTED_RING_WIDTH_PX = 2.5;
/** The hovered ring's halo, sized between the quiet ring and the snap ring. */
const HOVER_RING_RADIUS_PX = 9;

/** Maps a domain point (mm, y-up) to a canvas point (px, y-down). */
type ToCanvas = (point: Point) => paper.Point;

/** The transform used to draw and to hit-test, for the given canvas size. */
export function sceneTransform(
  space: Space,
  viewWidth: number,
  viewHeight: number
): ViewTransform {
  return fitTransform(space, viewWidth, viewHeight, PADDING_PX);
}

/**
 * Renders the sheet, committed track, and a quiet ring at every open end — the
 * clickable affordance for selecting the railhead. A function of the placed
 * layout alone; the selection reads are the overlay's. Redraw on commit, undo,
 * or resize.
 */
export function renderLayout(
  transform: ViewTransform,
  space: Space,
  placed: PlacedLayout,
  openEndPoints: readonly Point[]
): void {
  const toCanvas = onLayer('layout', transform);
  drawSheet(space, toCanvas);
  for (const section of placed.sectionsById.values()) {
    for (const geometry of section.geometry) {
      drawGeometry(geometry, toCanvas, RAIL_COLOR, false);
    }
  }
  for (const point of openEndPoints) {
    drawOpenEndRing(point, toCanvas);
  }
}

/**
 * Renders the interaction state: the selected open end's ring and the railhead
 * marker, the pointer-follow ghost, and any alignment feedback. The selected
 * ring sits under the rest; the guide sits beneath the ghost; a snap ring
 * rides on top, marking the open end the target has latched onto; a hover ring
 * lights the open end a click would select. Redraw on every move.
 *
 * `selectedEnd` is the selected open end's position — null when drawing grows
 * from a pending anchor, which is a bare `railhead` pose with no end to ring.
 */
export function renderOverlay(
  transform: ViewTransform,
  ghost: PlacedSection | null,
  railhead: Pose | null,
  selectedEnd: Point | null,
  snap: Snap | null,
  hover: Point | null
): void {
  const toCanvas = onLayer('overlay', transform);
  if (selectedEnd) {
    drawSelectedRing(selectedEnd, toCanvas);
  }
  // The guide sits under the ghost, the ring on top, so resolve both up front
  // and draw them around it.
  const {guide, ring} = snapFeedback(snap);
  if (guide) {
    drawGuide(guide, toCanvas, transform.scale);
  }
  if (ghost) {
    // The ghost is one drafted shape — a single segment or arc. Draw it and
    // label that shape (a curve shows its sweep and radius, a straight its
    // length).
    const [shape] = ghost.geometry;
    if (shape) {
      drawGeometry(shape, toCanvas, PREVIEW_COLOR, true);
      drawDimensionsLabel(shape, toCanvas);
    }
  }
  if (railhead) {
    drawRailhead(railhead.position, toCanvas);
  }
  if (ring) {
    drawSnapRing(ring, toCanvas);
  }
  if (hover) {
    drawHoverRing(hover, toCanvas);
  }
}

/**
 * The alignment feedback a snap calls for: a guide `line` to draw beneath the
 * ghost, a `ring` point to draw on top, or neither.
 */
function snapFeedback(snap: Snap | null): {
  guide: Line | null;
  ring: Point | null;
} {
  if (!snap) {
    return {guide: null, ring: null};
  }
  switch (snap.kind) {
    case 'line':
      return {guide: snap.line, ring: null};
    case 'end':
      return {guide: null, ring: snap.point};
    case 'angle':
      return {guide: null, ring: null};
    default:
      return assertNever(snap);
  }
}

/**
 * Draws an alignment guide along `line`, extended past the canvas in both
 * directions so it reads as a full-bleed line. The reach is the canvas spread
 * converted to domain units, which always overshoots the visible area.
 */
function drawGuide(line: Line, toCanvas: ToCanvas, viewScale: number): void {
  const reach = (paper.view.size.width + paper.view.size.height) / viewScale;
  const step = scale(normalize(line.direction), reach);
  const guide = new paper.Path.Line(
    toCanvas(subtract(line.origin, step)),
    toCanvas(add(line.origin, step))
  );
  guide.strokeColor = new paper.Color(GUIDE_COLOR);
  guide.strokeWidth = 1;
  guide.dashArray = GUIDE_DASH;
}

/** Rings the open end a target has latched onto. */
function drawSnapRing(point: Point, toCanvas: ToCanvas): void {
  const ring = new paper.Path.Circle(toCanvas(point), SNAP_RING_RADIUS_PX);
  ring.strokeColor = new paper.Color(GUIDE_COLOR);
  ring.strokeWidth = 2;
}

/** Rings an open end, quietly; the overlay marks the selected one. */
function drawOpenEndRing(point: Point, toCanvas: ToCanvas): void {
  const circle = new paper.Path.Circle(toCanvas(point), OPEN_RING_RADIUS_PX);
  circle.strokeColor = new paper.Color(OPEN_RING_COLOR);
  circle.strokeWidth = OPEN_RING_WIDTH_PX;
}

/** Rings the selected open end, covering its quiet ring. */
function drawSelectedRing(point: Point, toCanvas: ToCanvas): void {
  const ring = new paper.Path.Circle(toCanvas(point), OPEN_RING_RADIUS_PX);
  ring.strokeColor = new paper.Color(PREVIEW_COLOR);
  ring.strokeWidth = SELECTED_RING_WIDTH_PX;
}

/** Halos the open end a click would select. */
function drawHoverRing(point: Point, toCanvas: ToCanvas): void {
  const halo = new paper.Path.Circle(toCanvas(point), HOVER_RING_RADIUS_PX);
  halo.strokeColor = new paper.Color(PREVIEW_COLOR);
  halo.strokeWidth = 2;
}

/**
 * Labels the preview with its dimensions: a curve its sweep and radius
 * (`90.0° · r 15.1″`), a straight its heading and length (`∠ 30.0° · ℓ 34.1″`
 * — the ∠ marking a direction rather than a sweep, the script ℓ keeping the
 * prefix from reading as a digit 1). The heading is the value aiming a first
 * section chooses, and it shows the angle snap catching a tidy multiple. The
 * label sits by the preview's leading end — near the pointer, where the eye
 * is — pushed clear of the track: radially out from the arc's center for a
 * curve, square off the run for a straight.
 */
function drawDimensionsLabel(
  geometry: PlacedSegment | PlacedArc,
  toCanvas: ToCanvas
): void {
  if (geometry.kind === 'arc') {
    const degrees = Math.abs(radToDeg(geometry.sweep));
    const radius = toInches(geometry.radius);
    const end = toCanvas(arcEndPoint(geometry));
    const outward = end.subtract(toCanvas(arcCenter(geometry))).normalize();
    placeLabel(
      `${degrees.toFixed(1)}° · r ${radius.toFixed(1)}″`,
      end,
      outward
    );
  } else {
    const heading = radToDeg(normalizeAngle(geometry.start.heading));
    const length = toInches(geometry.length);
    const end = toCanvas(segmentEnd(geometry));
    const along = end.subtract(toCanvas(geometry.start.position)).normalize();
    const outward = new paper.Point(along.y, -along.x);
    placeLabel(
      `∠ ${heading.toFixed(1)}° · ℓ ${length.toFixed(1)}″`,
      end,
      outward
    );
  }
}

/**
 * Places a label `from` a point, pushed clear of it in the unit `outward`
 * direction. The push clears the whole label box, not just its center, so wide
 * text doesn't fall back across a diagonal curve. To stay readable near the
 * canvas edge the label flips to the inward side rather than run off it; and as
 * a last resort — a corner, where neither side fully clears — it is nudged back
 * inside, so it never clips.
 */
function placeLabel(
  content: string,
  from: paper.Point,
  outward: paper.Point
): void {
  const label = new paper.PointText(from);
  label.content = content;
  label.fillColor = new paper.Color(PREVIEW_COLOR);
  label.fontSize = 13;
  label.justification = 'center';
  const positionAlong = (direction: paper.Point) => {
    const halfExtent =
      (Math.abs(direction.x) * label.bounds.width +
        Math.abs(direction.y) * label.bounds.height) /
      2;
    return from.add(direction.multiply(LABEL_OFFSET_PX + halfExtent));
  };
  label.position = positionAlong(outward);
  if (!paper.view.bounds.contains(label.bounds)) {
    label.position = positionAlong(outward.multiply(-1));
  }
  label.position = label.position.add(
    nudgeInside(label.bounds, paper.view.bounds)
  );
}

/** The translation bringing `box` fully within `bounds`; zero if already inside. */
function nudgeInside(
  box: paper.Rectangle,
  bounds: paper.Rectangle
): paper.Point {
  const dx =
    box.left < bounds.left
      ? bounds.left - box.left
      : box.right > bounds.right
        ? bounds.right - box.right
        : 0;
  const dy =
    box.top < bounds.top
      ? bounds.top - box.top
      : box.bottom > bounds.bottom
        ? bounds.bottom - box.bottom
        : 0;
  return new paper.Point(dx, dy);
}

/** Activates the named layer (creating it once), clears it, and returns a mapper. */
function onLayer(name: string, transform: ViewTransform): ToCanvas {
  const existing = paper.project.layers.find(l => l.name === name);
  const layer = existing ?? new paper.Layer({name});
  layer.activate();
  layer.removeChildren();
  return point => {
    const {x, y} = transform.toCanvas(point);
    return new paper.Point(x, y);
  };
}

function drawSheet(space: Space, toCanvas: ToCanvas): void {
  const sheet = new paper.Path.Rectangle({
    from: toCanvas({x: 0, y: space.height}),
    to: toCanvas({x: space.width, y: 0}),
  });
  sheet.fillColor = new paper.Color(PLYWOOD_FILL);
  sheet.strokeColor = new paper.Color(PLYWOOD_EDGE);
  sheet.strokeWidth = 2;
}

function drawGeometry(
  geometry: PlacedSegment | PlacedArc,
  toCanvas: ToCanvas,
  color: string,
  preview: boolean
): void {
  const path =
    geometry.kind === 'segment'
      ? new paper.Path.Line(
          toCanvas(geometry.start.position),
          toCanvas(segmentEnd(geometry))
        )
      : arcPath(geometry, toCanvas);
  path.strokeColor = new paper.Color(color);
  path.strokeWidth = RAIL_WIDTH_PX;
  path.strokeCap = 'round';
  if (preview) {
    path.dashArray = [8, 6];
  }
}

function drawRailhead(position: Point, toCanvas: ToCanvas): void {
  const dot = new paper.Path.Circle(toCanvas(position), RAILHEAD_RADIUS_PX);
  dot.fillColor = new paper.Color(PREVIEW_COLOR);
}

/**
 * Draws a curve as a three-point arc. The midpoint pins the arc to the correct
 * side; the fitted transform is a uniform scale plus a reflection, so the arc
 * through the three mapped points is the correctly mirrored arc.
 */
function arcPath(placedArc: PlacedArc, toCanvas: ToCanvas): paper.Path {
  return new paper.Path.Arc(
    toCanvas(placedArc.start.position),
    toCanvas(arcMidpoint(placedArc)),
    toCanvas(arcEndPoint(placedArc))
  );
}
