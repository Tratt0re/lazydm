/**
 * The pure parts of the folder graph: zoom and key maths that follow the map page's feel, seeded start positions
 * for the layout, and which nodes stand next to one. The canvas itself is Cytoscape's (section-graph component).
 */

export interface GraphPoint {
  readonly x: number;
  readonly y: number;
}

/** The graph zooms between an eighth and four times its natural size (zoom levels are powers of two, as in the map). */
export const GRAPH_MIN_LEVEL = -3;
export const GRAPH_MAX_LEVEL = 2;
/** The zoom follows its target by this share of the distance each frame (about 120 ms to settle), as in the map. */
export const GRAPH_ZOOM_EASING = 0.22;
export const GRAPH_ZOOM_SETTLED = 0.002;
/** Wheel / pinch deltas (px) become zoom levels with these factors; a pinch arrives as ctrl + wheel. */
export const WHEEL_ZOOM_PER_PIXEL = 0.0022;
export const PINCH_ZOOM_PER_PIXEL = 0.012;
export const WHEEL_DELTA_MAX = 240;
export const BUTTON_ZOOM_STEP = 0.75;
/** An arrow key moves the view this far (px). */
export const KEY_PAN_PIXELS = 60;
export const GRAPH_FIT_PADDING = 24;

const LINE_HEIGHT_PIXELS = 33;
const PAGE_HEIGHT_PIXELS = 400;

/** Zoom levels a wheel or trackpad event asks for: positive zooms in. A pinch (ctrl + wheel) is stronger. */
export function wheelLevelDelta(deltaY: number, deltaMode: number, ctrlKey: boolean): number {
  const unit = deltaMode === 1 ? LINE_HEIGHT_PIXELS : deltaMode === 2 ? PAGE_HEIGHT_PIXELS : 1;
  const delta = Math.max(-WHEEL_DELTA_MAX, Math.min(WHEEL_DELTA_MAX, deltaY * unit));
  return -delta * (ctrlKey ? PINCH_ZOOM_PER_PIXEL : WHEEL_ZOOM_PER_PIXEL);
}

export function clampLevel(level: number): number {
  return Math.min(GRAPH_MAX_LEVEL, Math.max(GRAPH_MIN_LEVEL, level));
}

export const levelToScale = (level: number): number => 2 ** level;
export const scaleToLevel = (scale: number): number => Math.log2(scale);

/** One frame of the eased zoom: the next level, and whether the target is reached. `snap` skips the easing. */
export function easeLevel(
  current: number,
  target: number,
  snap: boolean,
): { readonly level: number; readonly done: boolean } {
  const difference = target - current;
  if (snap || Math.abs(difference) < GRAPH_ZOOM_SETTLED) {
    return { level: target, done: true };
  }

  return { level: current + difference * GRAPH_ZOOM_EASING, done: false };
}

/** How far the content moves for an arrow key (the view goes the way of the arrow); null for any other key. */
export function keyPan(key: string): GraphPoint | null {
  switch (key) {
    case 'ArrowLeft':
      return { x: KEY_PAN_PIXELS, y: 0 };
    case 'ArrowRight':
      return { x: -KEY_PAN_PIXELS, y: 0 };
    case 'ArrowUp':
      return { x: 0, y: KEY_PAN_PIXELS };
    case 'ArrowDown':
      return { x: 0, y: -KEY_PAN_PIXELS };
    default:
      return null;
  }
}

/** What a key does to the zoom: in, out, back to fit; null for any other key. */
export function keyZoom(key: string): 'in' | 'out' | 'fit' | null {
  if (key === '+' || key === '=') {
    return 'in';
  }

  if (key === '-' || key === '_') {
    return 'out';
  }

  return key === '0' ? 'fit' : null;
}

/**
 * Start positions for the layout, the same for the same number of nodes: a sunflower spiral from the centre.
 * Seeding the layout (instead of letting it pick random ones) is what makes a folder look the same every time.
 */
export function seedPositions(count: number, spacing = 70): GraphPoint[] {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, index) => ({
    x: Math.round(Math.sqrt(index) * spacing * Math.cos(index * goldenAngle)),
    y: Math.round(Math.sqrt(index) * spacing * Math.sin(index * goldenAngle)),
  }));
}

/** The node and the nodes it shares a link with, in either direction. */
export function neighbourhood(
  edges: readonly { readonly source: string; readonly target: string }[],
  id: string,
): Set<string> {
  const near = new Set([id]);
  for (const edge of edges) {
    if (edge.source === id) {
      near.add(edge.target);
    } else if (edge.target === id) {
      near.add(edge.source);
    }
  }

  return near;
}
