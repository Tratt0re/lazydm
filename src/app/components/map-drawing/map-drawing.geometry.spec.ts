import { describe, expect, it } from 'vitest';

import {
  bounds,
  box,
  carve,
  cellOf,
  doorAt,
  nearest,
  onMap,
  shapes,
  snap,
} from './map-drawing.geometry';

const SHEET = { cols: 20, rows: 20 };
const room = [box(40, 40, 200, 160)];

describe('map drawing geometry', () => {
  it('snaps to the grid and finds the square a point is in', () => {
    expect(snap([59, 61])).toEqual([40, 80]);
    expect(cellOf([79, 81])).toEqual([40, 80]);
  });

  it('adds a rectangle to an empty floor and takes a part away when erasing', () => {
    const { floor } = carve([], [], room, false, SHEET);
    expect(floor).toHaveLength(1);
    expect(bounds(floor, [])).toEqual({ x: 40, y: 40, x2: 200, y2: 160 });

    const holed = carve(floor, [], [box(80, 80, 120, 120)], true, SHEET).floor;
    expect(holed[0]).toHaveLength(2); // the outline and the hole
    expect(onMap(holed, { x: 100, y: 100 })).toBe(false);
    expect(onMap(holed, { x: 60, y: 60 })).toBe(true);
  });

  it('draws an L-shaped corridor one square wide', () => {
    const [horizontal, vertical] = shapes('corr', [40, 40], [160, 120]);
    expect(horizontal[0][0]).toEqual([40, 40]);
    expect(horizontal[0][2]).toEqual([200, 80]);
    expect(vertical[0][0]).toEqual([160, 40]);
    expect(vertical[0][2]).toEqual([200, 160]);
    expect(shapes('rect', [40, 40], [40, 120])).toEqual([]);
    expect(shapes('circle', [40, 40], [40, 40])).toEqual([]);
    expect(shapes('circle', [80, 80], [120, 80])[0][0]).toHaveLength(49);
  });

  it('cuts what is drawn to the sheet', () => {
    const { floor } = carve([], [], [box(-100, -100, 100, 100)], false, SHEET);
    expect(bounds(floor, [])).toEqual({ x: 0, y: 0, x2: 100, y2: 100 });
  });

  it('snaps a door to a wall and refuses one off the map', () => {
    const { floor } = carve([], [], room, false, SHEET);
    expect(doorAt(floor, [], [100, 42])).toEqual({ x: 100, y: 40, angle: 0 });
    expect(doorAt(floor, [], [42, 100])).toEqual({ x: 40, y: 100, angle: Math.PI / 2 });
    expect(doorAt(floor, [], [500, 500])).toBeNull();
    expect(doorAt(floor, [{ x: 100, y: 40, angle: 0 }], [100, 42])).toBeNull();
    expect(nearest(floor, [100, 30]).d).toBe(10);
  });

  it('removes a door left outside the map after erasing', () => {
    const { floor } = carve([], [], room, false, SHEET);
    const door = { x: 60, y: 40, angle: 0 };
    const erased = carve(floor, [door], [box(0, 0, 400, 400)], true, SHEET);
    expect(erased.floor).toEqual([]);
    expect(erased.doors).toEqual([]);
  });

  it('has no bounds when the floor and the texts are empty', () => {
    expect(bounds([], [])).toBeNull();
    expect(bounds([], [{ x: 100, y: 100, s: 'Hi' }])).toEqual({ x: 78, y: 86, x2: 122, y2: 114 });
  });
});
