import './style.css';
import {makeSpace} from './domain/space';
import {feet} from './domain/units';
import {startEditor} from './editor/editor';

function getLayoutCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>('#layout');
  if (!canvas) {
    throw new Error('Expected a <canvas id="layout"> element in the page');
  }
  return canvas;
}

function main(): void {
  // A 4'x8' sheet is the default workspace for a new layout.
  const space = makeSpace(feet(8), feet(4));
  startEditor(getLayoutCanvas(), space, document.querySelector('#status'));
}

main();
