import paper from 'paper';
import './style.css';
import {posesCoincide, type Pose} from './domain/geometry';
import {
  curveLeft,
  placeRoute,
  routeBounds,
  straight,
  type RoutePiece,
} from './domain/layout';
import {makeSpace, spaceContains, type Space} from './domain/space';
import {trackLength} from './domain/track';
import {feet, inches, toInches} from './domain/units';
import {drawScene, type Scene} from './render/scene';

const ORIGIN: Pose = {position: {x: 0, y: 0}, heading: 0};

function getLayoutCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>('#layout');
  if (!canvas) {
    throw new Error('Expected a <canvas id="layout"> element in the page');
  }
  return canvas;
}

/**
 * The classic first layout: two straight sides joined by two 180° curves. With
 * an 18" radius and 48" straights it forms an oval that fits a 4'x8' sheet.
 */
function oval(straightLength: number, radius: number): RoutePiece[] {
  return [
    straight(straightLength),
    curveLeft(radius, 180),
    straight(straightLength),
    curveLeft(radius, 180),
  ];
}

/** Returns an anchor pose that centers `route` within `space`. */
function centeredAnchor(space: Space, route: RoutePiece[]): Pose {
  const {pieces} = placeRoute(ORIGIN, route);
  const b = routeBounds(pieces);
  return {
    position: {
      x: (space.size.width - (b.maxX - b.minX)) / 2 - b.minX,
      y: (space.size.height - (b.maxY - b.minY)) / 2 - b.minY,
    },
    heading: 0,
  };
}

function describeLayout(
  space: Space,
  route: RoutePiece[],
  anchor: Pose,
  scene: Scene
): string {
  const placed = placeRoute(anchor, route);
  const closed = posesCoincide(placed.exit, anchor, 1e-6, 1e-6);
  const fits = spaceContains(space, routeBounds(scene.pieces), 1e-6);
  const run = route.reduce(
    (total, piece) => total + trackLength(piece.track),
    0
  );
  return [
    `${feetLabel(space.size.width)}′×${feetLabel(space.size.height)}′ sheet`,
    `mainline run ${toInches(run).toFixed(1)}″`,
    closed ? 'closed loop' : 'open ends',
    fits ? 'fits the sheet' : 'overflows the sheet',
  ].join(' · ');
}

/** A millimetre length as a tidy number of feet, free of round-trip float dust. */
function feetLabel(millimetres: number): string {
  const ft = toInches(millimetres) / 12;
  return String(Math.round(ft * 100) / 100);
}

function main(): void {
  const canvas = getLayoutCanvas();
  paper.setup(canvas);

  const space = makeSpace(feet(8), feet(4));
  const route = oval(inches(48), inches(18));
  const anchor = centeredAnchor(space, route);
  const scene: Scene = {space, pieces: placeRoute(anchor, route).pieces};

  drawScene(scene);
  paper.view.onResize = () => drawScene(scene);

  const status = document.querySelector('#status');
  if (status) {
    status.textContent = describeLayout(space, route, anchor, scene);
  }
}

main();
