/**
 * Rendering the layout onto a Paper.js canvas. This is the edge: Paper.js lives
 * here, and the domain (../domain) stays free of it. The pure coordinate math
 * lives in ./transform; this module is the thin Paper.js wrapper around it.
 *
 * The drawing is split across two layers so the frequent case is cheap: the
 * static layer (sheet and committed track) changes only when track is committed
 * or the view resizes, while the overlay (the pointer-follow preview and the
 * railhead marker) is redrawn on its own every time the pointer moves.
 */

import paper from 'paper';
import {
  arcEnd,
  arcMidpoint,
  arcStart,
  PlacedArc,
  Point,
  Pose,
  segmentEnd,
} from '../domain/geometry';
import {sectionGeometry, PlacedSection} from '../domain/layout';
import {Space} from '../domain/space';
import {fitTransform, ViewTransform} from './transform';

/** Pixels of breathing room left between the sheet and the canvas edge. */
const PADDING_PX = 24;

const PLYWOOD_FILL = '#e8d6b3';
const PLYWOOD_EDGE = '#b9966b';
const RAIL_COLOR = '#2b2b2b';
const PREVIEW_COLOR = '#3b82f6';
const RAIL_WIDTH_PX = 3;
const RAILHEAD_RADIUS_PX = 5;

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

/** Renders the sheet and committed track. Redraw on commit, undo, or resize. */
export function renderStatic(
  transform: ViewTransform,
  space: Space,
  sections: readonly PlacedSection[]
): void {
  const toCanvas = onLayer('static', transform);
  drawSheet(space, toCanvas);
  for (const section of sections) {
    drawSection(section, toCanvas, RAIL_COLOR, false);
  }
}

/** Renders the pointer-follow preview and railhead marker. Redraw on every move. */
export function renderOverlay(
  transform: ViewTransform,
  preview: PlacedSection | null,
  railhead: Pose | null
): void {
  const toCanvas = onLayer('overlay', transform);
  if (preview) {
    drawSection(preview, toCanvas, PREVIEW_COLOR, true);
  }
  if (railhead) {
    drawRailhead(railhead.position, toCanvas);
  }
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

function drawSection(
  section: PlacedSection,
  toCanvas: ToCanvas,
  color: string,
  ghost: boolean
): void {
  const geometry = sectionGeometry(section);
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
  if (ghost) {
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
    toCanvas(arcStart(placedArc)),
    toCanvas(arcMidpoint(placedArc)),
    toCanvas(arcEnd(placedArc))
  );
}
