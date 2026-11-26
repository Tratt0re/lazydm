import {
  DRAWING_CELL as CELL,
  DRAWING_EXPORT_MAX_PIXELS,
  DRAWING_EXPORT_MAX_SIDE,
  DRAWING_SCATTER_MAX_PIXELS,
  DRAWING_SCATTER_MAX_SIDE,
  DRAWING_THEMES,
  type DrawingPalette,
} from '@/config/map-drawing.config';
import type { MapDrawingDto } from '@/dtos';

import { bounds, hash, nearest, segments, type DrawingFloor } from './map-drawing.geometry';

/** Canvas drawing of a map (ported from the prototype) and its export to image bytes. */

/** The font of the map's texts: bundled with the app, so the image is the same on every system. */
const TEXT_FONT = '600 26px "Barlow Condensed"';

export interface DrawingArea {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

function wallPath(floor: DrawingFloor): Path2D {
  const path = new Path2D();
  for (const polygon of floor) {
    for (const ring of polygon) {
      ring.slice(0, -1).forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
      path.closePath();
    }
  }
  return path;
}

/** Concentric rings: the inner part is then covered by the floor. */
function contours(g: CanvasRenderingContext2D, palette: DrawingPalette, path: Path2D): void {
  g.lineJoin = 'round';
  for (const [w, alpha] of [
    [48, 0.45],
    [32, 0.7],
    [18, 1],
  ]) {
    g.strokeStyle = palette.deco;
    g.globalAlpha = alpha;
    g.lineWidth = w;
    g.stroke(path);
    g.globalAlpha = 1;
    g.strokeStyle = palette.paper;
    g.lineWidth = w - 3.5;
    g.stroke(path);
  }
}

/** Rocks or dots scattered around the walls, always in the same places. */
function scatter(
  g: CanvasRenderingContext2D,
  palette: DrawingPalette,
  floor: DrawingFloor,
  kind: 'rocks' | 'dots',
): void {
  const S = kind === 'rocks' ? 13 : 7;
  const R = 24;
  const cells = new Set<string>();
  for (const [[ax, ay], [bx, by]] of segments(floor)) {
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / S) || 1;
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n;
      const y = ay + ((by - ay) * k) / n;
      for (let i = Math.floor((x - R) / S) - 1; i <= (x + R) / S; i++) {
        for (let j = Math.floor((y - R) / S) - 1; j <= (y + R) / S; j++) {
          cells.add(`${i},${j}`);
        }
      }
    }
  }

  g.fillStyle = palette.deco;
  g.strokeStyle = palette.paper;
  g.lineWidth = 1.5;
  for (const cell of cells) {
    const [i, j] = cell.split(',').map(Number);
    const x = (i + hash(i, j, 3)) * S;
    const y = (j + hash(i, j, 4)) * S;
    const d = nearest(floor, [x, y]).d;
    if (d > R * (0.7 + 0.3 * hash(i, j, 6))) {
      continue;
    }

    g.beginPath();
    if (kind === 'dots') {
      g.arc(x, y, Math.max(0.7, 2.8 * (1 - d / R)), 0, 7);
    } else {
      const r = 5 + hash(i, j, 5) * 5;
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3 + hash(i, j, 7);
        const q = r * (0.7 + 0.5 * hash(i, j, 8 + k));
        g.lineTo(x + q * Math.cos(a), y + q * Math.sin(a));
      }
      g.closePath();
    }
    g.fill();
    if (kind === 'rocks') {
      g.stroke();
    }
  }
}

interface ScatterLayer {
  readonly key: string;
  readonly canvas: HTMLCanvasElement;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Rocks and dots are costly: the layer is recomputed only when the floor, the kind or the colours change. */
let scatterCache: ScatterLayer | null = null;

function scatterLayer(
  palette: DrawingPalette,
  floor: DrawingFloor,
  kind: 'rocks' | 'dots',
  theme: string,
): ScatterLayer {
  const key = `${kind}|${theme}|${JSON.stringify(floor)}`;
  if (scatterCache?.key === key) {
    return scatterCache;
  }

  const all = floor.flat(2);
  const pad = 50;
  const x = Math.min(...all.map((p) => p[0])) - pad;
  const y = Math.min(...all.map((p) => p[1])) - pad;
  const w = Math.max(...all.map((p) => p[0])) + pad - x;
  const h = Math.max(...all.map((p) => p[1])) + pad - y;
  const s = Math.min(
    3,
    DRAWING_SCATTER_MAX_SIDE / Math.max(w, h),
    Math.sqrt(DRAWING_SCATTER_MAX_PIXELS / (w * h)),
  );
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * s);
  canvas.height = Math.ceil(h * s);
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  g.scale(s, s);
  g.translate(-x, -y);
  scatter(g, palette, floor, kind);
  return (scatterCache = { key, canvas, x, y, w: canvas.width / s, h: canvas.height / s });
}

/** Draws the whole map into `area` (world pixels) of the context, whatever transform it has. */
export function drawScene(
  g: CanvasRenderingContext2D,
  drawing: Pick<MapDrawingDto, 'floor' | 'doors' | 'texts' | 'style'>,
  area: DrawingArea,
): void {
  const { floor, doors, texts, style } = drawing;
  const palette = DRAWING_THEMES[style.theme];
  g.fillStyle = palette.paper;
  g.fillRect(area.x, area.y, area.w, area.h);

  const box = bounds(floor, []);
  if (box) {
    const path = wallPath(floor);
    if (style.border === 'contour') {
      contours(g, palette, path);
    } else if (style.border !== 'none') {
      const layer = scatterLayer(palette, floor, style.border, style.theme);
      g.drawImage(layer.canvas, layer.x, layer.y, layer.w, layer.h);
    }

    g.fillStyle = palette.floor;
    g.fill(path, 'evenodd');
    g.save();
    g.clip(path, 'evenodd');
    if (style.shadow) {
      g.strokeStyle = palette.ink;
      g.lineJoin = 'round';
      g.globalAlpha = 0.1;
      for (const w of [34, 22, 12]) {
        g.lineWidth = w;
        g.stroke(path);
      }
      g.globalAlpha = 1;
    }

    if (style.grid !== 'none') {
      g.strokeStyle = palette.grid;
      g.lineWidth = 1;
      g.globalAlpha = style.grid === 'lines' ? 0.35 : 0.8;
      g.beginPath();
      const x0 = Math.floor(box.x / CELL) * CELL;
      const y0 = Math.floor(box.y / CELL) * CELL;
      if (style.grid === 'lines') {
        for (let x = x0; x <= box.x2; x += CELL) {
          g.moveTo(x, box.y);
          g.lineTo(x, box.y2);
        }
        for (let y = y0; y <= box.y2; y += CELL) {
          g.moveTo(box.x, y);
          g.lineTo(box.x2, y);
        }
      } else {
        for (let x = x0; x <= box.x2; x += CELL) {
          for (let y = y0; y <= box.y2; y += CELL) {
            g.moveTo(x - 4, y);
            g.lineTo(x + 4, y);
            g.moveTo(x, y - 4);
            g.lineTo(x, y + 4);
          }
        }
      }
      g.stroke();
      g.globalAlpha = 1;
    }
    g.restore();
    g.strokeStyle = palette.ink;
    g.lineWidth = 5;
    g.lineJoin = 'round';
    g.stroke(path);
  }

  for (const door of doors) {
    g.save();
    g.translate(door.x, door.y);
    g.rotate(door.angle);
    g.fillStyle = palette.door;
    g.strokeStyle = palette.text;
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(-18, -6, 36, 12, 4);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(0, 6);
    g.stroke();
    g.restore();
  }

  g.font = TEXT_FONT;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 5;
  for (const text of texts) {
    g.strokeStyle = palette.floor;
    g.strokeText(text.s, text.x, text.y);
    g.fillStyle = palette.text;
    g.fillText(text.s, text.x, text.y);
  }
}

export interface DrawingImage {
  readonly bytes: Uint8Array;
  readonly mimeType: 'image/png' | 'image/jpeg';
  readonly extension: 'png' | 'jpg';
  /** The resolution was lowered to stay within the export limits. */
  readonly reduced: boolean;
}

/** The whole fixed sheet as image bytes, in the format, resolution and quality of the drawing's style. */
export async function exportDrawing(drawing: MapDrawingDto): Promise<DrawingImage | null> {
  if (drawing.floor.length === 0) {
    return null; // nothing drawn: there is no image to make
  }

  await document.fonts.load(TEXT_FONT);
  const w = drawing.cols * CELL;
  const h = drawing.rows * CELL;
  const wanted = drawing.style.resolution;
  const scale = Math.min(
    wanted,
    DRAWING_EXPORT_MAX_SIDE / Math.max(w, h),
    Math.sqrt(DRAWING_EXPORT_MAX_PIXELS / (w * h)),
  );
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  g.scale(scale, scale);
  drawScene(g, drawing, { x: 0, y: 0, w, h });

  const isJpg = drawing.style.format === 'jpg';
  const mimeType = isJpg ? 'image/jpeg' : 'image/png';
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mimeType, drawing.style.quality / 100),
  );
  if (!blob) {
    throw new Error('The image could not be generated.');
  }

  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    mimeType,
    extension: isJpg ? 'jpg' : 'png',
    reduced: scale < wanted,
  };
}
