/**
 * Rendering the layout onto a Paper.js canvas. This is the edge: Paper.js lives
 * here, and the domain (../domain) stays free of it. The pure coordinate math
 * lives in ./transform; this module is the thin Paper.js wrapper around it.
 */

import paper from 'paper';
import {
  arcEnd,
  arcMidpoint,
  arcStart,
  PlacedArc,
  Point,
  segmentEnd,
} from '../domain/geometry';
import {pieceGeometry, PlacedPiece} from '../domain/layout';
import {Space} from '../domain/space';
import {fitTransform} from './transform';

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
type ToCanvas = (point: Point) => paper.Point;

/**
 * Clears the active project and draws the scene, scaled to fit the current view
 * with the sheet centered.
 */
export function drawScene(scene: Scene): void {
  paper.project.activeLayer.removeChildren();

  const transform = fitTransform(
    scene.space,
    paper.view.size.width,
    paper.view.size.height,
    PADDING_PX
  );
  const toCanvas: ToCanvas = point => {
    const {x, y} = transform.toCanvas(point);
    return new paper.Point(x, y);
  };

  drawSheet(scene.space, toCanvas);
  for (const piece of scene.pieces) {
    drawPiece(piece, toCanvas);
  }
  paper.view.update();
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

function drawPiece(piece: PlacedPiece, toCanvas: ToCanvas): void {
  const geometry = pieceGeometry(piece);
  const path =
    geometry.kind === 'segment'
      ? new paper.Path.Line(
          toCanvas(geometry.start.position),
          toCanvas(segmentEnd(geometry))
        )
      : arcPath(geometry, toCanvas);
  path.strokeColor = new paper.Color(RAIL_COLOR);
  path.strokeWidth = RAIL_WIDTH_PX;
  path.strokeCap = 'round';
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
