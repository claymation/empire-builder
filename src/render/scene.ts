/**
 * Rendering the layout onto a Paper.js canvas. This is the edge: Paper.js and
 * pixel coordinates live here, and the domain (../domain) stays free of them.
 *
 * The domain works in millimetres with +y pointing up; the canvas works in
 * pixels with +y pointing down. A single fitted transform bridges the two.
 */

import paper from 'paper';
import {
  arcEnd,
  arcMidpoint,
  arcStart,
  PlacedArc,
  Point,
} from '../domain/geometry';
import {pieceGeometry, PieceGeometry, PlacedPiece} from '../domain/layout';
import {Space} from '../domain/space';

/** Everything needed to draw one frame: the sheet and the track on it. */
export interface Scene {
  readonly space: Space;
  readonly pieces: readonly PlacedPiece[];
}

/** Pixels of breathing room left between the sheet and the canvas edge. */
const PADDING_PX = 24;

const PLYWOOD_FILL = '#e8d6b3';
const PLYWOOD_EDGE = '#b9966b';
const RAIL_COLOR = '#2b2b2b';
const RAIL_WIDTH_PX = 3;

/** Maps a domain point (mm, y-up) to a canvas point (px, y-down). */
type Transform = (point: Point) => paper.Point;

/**
 * Clears the active project and draws the scene, scaled to fit the current view
 * with the sheet centered.
 */
export function drawScene(scene: Scene): void {
  paper.project.activeLayer.removeChildren();

  const toCanvas = fitTransform(scene.space, paper.view.size);
  drawSheet(scene.space, toCanvas);
  for (const piece of scene.pieces) {
    drawPiece(pieceGeometry(piece), toCanvas);
  }
  paper.view.update();
}

/** Builds a transform that centers the sheet in `viewSize` and flips the y axis. */
function fitTransform(space: Space, viewSize: paper.Size): Transform {
  const {width, height} = space.size;
  const scale = Math.min(
    (viewSize.width - 2 * PADDING_PX) / width,
    (viewSize.height - 2 * PADDING_PX) / height
  );
  const offsetX = (viewSize.width - width * scale) / 2;
  const offsetY = (viewSize.height - height * scale) / 2;
  return point =>
    new paper.Point(
      offsetX + point.x * scale,
      // Flip: domain y grows upward, canvas y grows downward.
      offsetY + (height - point.y) * scale
    );
}

function drawSheet(space: Space, toCanvas: Transform): void {
  const topLeft = toCanvas({x: 0, y: space.size.height});
  const bottomRight = toCanvas({x: space.size.width, y: 0});
  const sheet = new paper.Path.Rectangle({
    from: topLeft,
    to: bottomRight,
  });
  sheet.fillColor = new paper.Color(PLYWOOD_FILL);
  sheet.strokeColor = new paper.Color(PLYWOOD_EDGE);
  sheet.strokeWidth = 2;
}

function drawPiece(geometry: PieceGeometry, toCanvas: Transform): void {
  const path =
    geometry.kind === 'straight'
      ? new paper.Path.Line(toCanvas(geometry.start), toCanvas(geometry.end))
      : arcPath(geometry.arc, toCanvas);
  path.strokeColor = new paper.Color(RAIL_COLOR);
  path.strokeWidth = RAIL_WIDTH_PX;
  path.strokeCap = 'round';
}

/**
 * Draws a curve as a three-point arc. The midpoint pins the arc to the correct
 * side; the fitted transform is a uniform scale plus a reflection, so the arc
 * through the three mapped points is the correctly mirrored arc.
 */
function arcPath(placedArc: PlacedArc, toCanvas: Transform): paper.Path {
  return new paper.Path.Arc(
    toCanvas(arcStart(placedArc)),
    toCanvas(arcMidpoint(placedArc)),
    toCanvas(arcEnd(placedArc))
  );
}
