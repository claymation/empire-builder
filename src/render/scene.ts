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
  Pose,
  segmentEnd,
} from '../domain/geometry';
import {sectionGeometry, PlacedSection} from '../domain/layout';
import {Space} from '../domain/space';
import {fitTransform, ViewTransform} from './transform';

/** Everything needed to draw one frame. */
export interface Scene {
  readonly space: Space;
  /** The track committed so far. */
  readonly sections: readonly PlacedSection[];
  /** The section the pointer would lay next, drawn as a ghost. */
  readonly preview?: PlacedSection | null;
  /** The open end the next section extends from, drawn as a marker. */
  readonly railhead?: Pose | null;
}

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

/** Clears the active project and draws the scene with the given transform. */
export function drawScene(transform: ViewTransform, scene: Scene): void {
  paper.project.activeLayer.removeChildren();
  const toCanvas: ToCanvas = point => {
    const {x, y} = transform.toCanvas(point);
    return new paper.Point(x, y);
  };

  drawSheet(scene.space, toCanvas);
  for (const section of scene.sections) {
    drawSection(section, toCanvas, RAIL_COLOR, false);
  }
  if (scene.preview) {
    drawSection(scene.preview, toCanvas, PREVIEW_COLOR, true);
  }
  if (scene.railhead) {
    drawRailhead(scene.railhead.position, toCanvas);
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
