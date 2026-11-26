import polygonClipping, { type MultiPolygon } from 'polygon-clipping';

import { DRAWING_CELL as CELL } from '@/config/map-drawing.config';
import type {
  MapDrawingDoorDto,
  MapDrawingPoint,
  MapDrawingPolygon,
  MapDrawingTextDto,
} from '@/dtos';

/** Pure geometry of the map drawing editor (ported 1:1 from the prototype); no DOM, no state. */

export type DrawingFloor = readonly MapDrawingPolygon[];
type Segment = readonly [MapDrawingPoint, MapDrawingPoint];

export interface NearestPoint {
  readonly d: number;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

export interface DrawingBounds {
  readonly x: number;
  readonly y: number;
  readonly x2: number;
  readonly y2: number;
}

/** A stable pseudo-random number in 0..1 for a cell: rocks and dots land in the same place every time. */
export function hash(x: number, y: number, k = 0): number {
  const v = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

export function segments(floor: DrawingFloor): Segment[] {
  return floor.flatMap((polygon) =>
    polygon.flatMap((ring) => ring.slice(1).map((b, i): Segment => [ring[i], b])),
  );
}

/** The wall point closest to `p`, with its distance and the wall's angle. */
export function nearest(floor: DrawingFloor, [px, py]: MapDrawingPoint): NearestPoint {
  let best: NearestPoint = { d: Infinity, x: 0, y: 0, angle: 0 };
  for (const [[ax, ay], [bx, by]] of segments(floor)) {
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(
      0,
      Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)),
    );
    const x = ax + t * dx;
    const y = ay + t * dy;
    const d = Math.hypot(px - x, py - y);
    if (d < best.d) {
      best = { d, x, y, angle: Math.atan2(dy, dx) };
    }
  }
  return best;
}

/** True when the point is on the floor or on a wall. */
export function onMap(floor: DrawingFloor, { x, y }: { x: number; y: number }): boolean {
  let inside = false;
  for (const [[ax, ay], [bx, by]] of segments(floor)) {
    if (ay > y !== by > y && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) {
      inside = !inside;
    }
  }
  return inside || nearest(floor, [x, y]).d < 2;
}

/** The box around the floor and the texts; null when there is nothing. */
export function bounds(
  floor: DrawingFloor,
  texts: readonly MapDrawingTextDto[],
): DrawingBounds | null {
  const all: MapDrawingPoint[] = floor.flat(2).concat(
    texts.flatMap((t): MapDrawingPoint[] => {
      const w = t.s.length * 6 + 10;
      return [
        [t.x - w, t.y - 14],
        [t.x + w, t.y + 14],
      ];
    }),
  );
  if (all.length === 0) {
    return null;
  }

  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}

export const box = (x1: number, y1: number, x2: number, y2: number): MapDrawingPolygon => [
  [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2],
    [x1, y1],
  ],
];

export const snap = (p: MapDrawingPoint): MapDrawingPoint => [
  Math.round(p[0] / CELL) * CELL,
  Math.round(p[1] / CELL) * CELL,
];

export const cellOf = (p: MapDrawingPoint): MapDrawingPoint => [
  Math.floor(p[0] / CELL) * CELL,
  Math.floor(p[1] / CELL) * CELL,
];

/** The shapes a drag from `a` to `b` draws: a room, a circle (48 sides) or an L-shaped corridor one square wide. */
export function shapes(
  tool: 'rect' | 'circle' | 'corr',
  a: MapDrawingPoint,
  b: MapDrawingPoint,
): MapDrawingPolygon[] {
  if (tool === 'rect') {
    return a[0] !== b[0] && a[1] !== b[1]
      ? [
          box(
            Math.min(a[0], b[0]),
            Math.min(a[1], b[1]),
            Math.max(a[0], b[0]),
            Math.max(a[1], b[1]),
          ),
        ]
      : [];
  }

  if (tool === 'circle') {
    const r = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!r) {
      return [];
    }

    const ring = Array.from({ length: 48 }, (_, i): MapDrawingPoint => [
      a[0] + r * Math.cos((i * Math.PI) / 24),
      a[1] + r * Math.sin((i * Math.PI) / 24),
    ]);
    return [[[...ring, ring[0]]]];
  }

  // corridor: `a` and `b` are corners of squares
  const [x1, y1] = a;
  const [x2, y2] = b;
  return [
    box(Math.min(x1, x2), y1, Math.max(x1, x2) + CELL, y1 + CELL),
    box(x2, Math.min(y1, y2), x2 + CELL, Math.max(y1, y2) + CELL),
  ];
}

/** A door snapped to the nearest side of a square, on a wall or in a gap; null when it would float off the map. */
export function doorAt(
  floor: DrawingFloor,
  doors: readonly MapDrawingDoorDto[],
  [px, py]: MapDrawingPoint,
): MapDrawingDoorDto | null {
  const gx = Math.round(px / CELL) * CELL;
  const gy = Math.round(py / CELL) * CELL;
  const door: MapDrawingDoorDto =
    Math.abs(px - gx) < Math.abs(py - gy)
      ? { x: gx, y: Math.floor(py / CELL) * CELL + CELL / 2, angle: Math.PI / 2 }
      : { x: Math.floor(px / CELL) * CELL + CELL / 2, y: gy, angle: 0 };
  return onMap(floor, door) && !doors.some((d) => d.x === door.x && d.y === door.y) ? door : null;
}

/**
 * Adds the shapes to the floor (or takes them away when erasing), each cut to the sheet; doors left off the map
 * are removed.
 */
export function carve(
  floor: DrawingFloor,
  doors: readonly MapDrawingDoorDto[],
  list: readonly MapDrawingPolygon[],
  erase: boolean,
  sheet: { readonly cols: number; readonly rows: number },
): { floor: DrawingFloor; doors: MapDrawingDoorDto[] } {
  const sheetBox = box(0, 0, sheet.cols * CELL, sheet.rows * CELL) as MultiPolygon[number];
  let next = floor as MultiPolygon;
  for (const shape of list) {
    const clipped = polygonClipping.intersection(shape as MultiPolygon[number], sheetBox);
    if (clipped.length > 0) {
      next = erase
        ? polygonClipping.difference(next, clipped)
        : polygonClipping.union(next, clipped);
    }
  }

  return { floor: next, doors: doors.filter((door) => onMap(next, door)) };
}
