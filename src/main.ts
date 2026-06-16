import paper from 'paper';
import './style.css';
import {trackLength, type Track} from './domain/track';

function getLayoutCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>('#layout');
  if (!canvas) {
    throw new Error('Expected a <canvas id="layout"> element in the page');
  }
  return canvas;
}

/**
 * Bootstraps the Paper.js scope onto the layout canvas and draws a placeholder
 * so we can see the canvas is live. Rendering lives here, at the edge; the
 * domain layer (./domain) stays free of Paper.js.
 */
function main(): void {
  const canvas = getLayoutCanvas();
  paper.setup(canvas);

  const baseline = new paper.Path.Line({
    from: [40, paper.view.center.y],
    to: [paper.view.size.width - 40, paper.view.center.y],
    strokeColor: '#555',
    strokeWidth: 2,
  });
  baseline.dashArray = [10, 6];

  // Demonstrates the domain/render boundary: geometry is computed by pure
  // domain code, then handed to Paper.js purely for drawing.
  const piece: Track = {kind: 'curved', radius: 360, sweepDegrees: 90};
  const label = new paper.PointText({
    point: [40, 32],
    content: `Sample curve arc length: ${trackLength(piece).toFixed(1)} mm`,
    fillColor: '#555',
    fontSize: 14,
  });
  label.bringToFront();

  paper.view.update();
}

main();
