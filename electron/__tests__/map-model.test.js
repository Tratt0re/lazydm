import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createMap, normalizeMap, readMap, writeMap } = require('../models/map.model');

describe('normalizeMap: drawing', () => {
  const square = [
    [0, 0],
    [80, 0],
    [80, 80],
    [0, 80],
    [0, 0],
  ];
  const drawingOf = (drawing) => normalizeMap({ drawing }, 'm').drawing;

  it('is null for an imported map and for anything that is not an object', () => {
    expect(drawingOf(undefined)).toBeNull();
    expect(drawingOf('x')).toBeNull();
    expect(drawingOf([])).toBeNull();
  });

  it('keeps a valid drawing and fills the defaults of an empty one', () => {
    expect(drawingOf({})).toEqual({
      cols: 30,
      rows: 20,
      floor: [],
      doors: [],
      texts: [],
      style: {
        grid: 'cross',
        border: 'contour',
        shadow: true,
        theme: 'slate',
        format: 'png',
        resolution: 2,
        quality: 92,
      },
    });

    const drawing = drawingOf({
      cols: 10,
      rows: 8,
      floor: [[square]],
      doors: [{ x: 40, y: 0, angle: 1.5 }],
      texts: [{ x: 20, y: 20, s: ' Hall ' }],
      style: { grid: 'lines', border: 'rocks', shadow: false, theme: 'moss', format: 'jpg' },
    });
    expect(drawing.floor).toEqual([[square]]);
    expect(drawing.doors).toEqual([{ x: 40, y: 0, angle: 1.5 }]);
    expect(drawing.texts).toEqual([{ x: 20, y: 20, s: 'Hall' }]);
    expect(drawing.style).toMatchObject({
      grid: 'lines',
      border: 'rocks',
      shadow: false,
      theme: 'moss',
      format: 'jpg',
    });
  });

  it('falls back to defaults for values outside the lists and clamps the numbers', () => {
    const drawing = drawingOf({
      cols: 9999,
      rows: 1,
      style: { grid: 'x', border: 'y', theme: 'z', format: 'gif', resolution: 9, quality: 5 },
    });
    expect(drawing).toMatchObject({ cols: 200, rows: 4 });
    expect(drawing.style).toMatchObject({
      grid: 'cross',
      border: 'contour',
      theme: 'slate',
      format: 'png',
      resolution: 2,
      quality: 50,
    });
  });

  it('drops what is malformed, keeps points inside the sheet and caps the lists', () => {
    const drawing = drawingOf({
      cols: 4,
      rows: 4,
      floor: [
        [
          [
            [0, 0],
            [999, 0],
            [0, 80],
          ],
        ],
        [
          [
            [0, 0],
            ['a', 1],
            [10, 10],
            [0, 0],
          ],
        ],
        'x',
        [square],
      ],
      doors: [{ x: 'a', y: 1 }, { x: -5, y: 500, angle: 'q' }, null],
      texts: [
        { x: 1, y: 1, s: '   ' },
        { x: 1, y: 1, s: 'x'.repeat(500) },
      ],
    });
    // rings that are not a loop (or lose a bad point and stop being one) are dropped; the square survives
    expect(drawing.floor).toEqual([[square]]);
    expect(drawing.doors).toEqual([{ x: 0, y: 160, angle: 0 }]);
    expect(drawing.texts).toHaveLength(1);
    expect(drawing.texts[0].s).toHaveLength(120);
  });
});

describe('normalizeMap', () => {
  it('opens a minimal or empty file with defaults', () => {
    expect(normalizeMap({}, 'world')).toEqual({
      version: 1,
      name: 'world',
      image: null,
      drawing: null,
      pins: [],
      paths: [],
      notes: [],
    });
    expect(normalizeMap(null, 'world').name).toBe('world');
    expect(normalizeMap('nonsense', 'world').pins).toEqual([]);
  });

  it('keeps only an image path that stays inside the vault', () => {
    expect(normalizeMap({ image: 'camp/assets/map.png' }, 'm').image).toBe('camp/assets/map.png');
    expect(normalizeMap({ image: '/etc/passwd.png' }, 'm').image).toBeNull();
    expect(normalizeMap({ image: 'camp/../../secret.png' }, 'm').image).toBeNull();
    expect(normalizeMap({ image: 'camp/assets/notes.md' }, 'm').image).toBeNull();
  });

  it('clamps coordinates to 0..1 and drops pins without a position', () => {
    const map = normalizeMap(
      {
        pins: [
          { id: 'a', x: 2, y: -1, label: 'Keep' },
          { id: 'b', x: 'left', y: 0.5 },
          { id: 'c', x: Number.NaN, y: 0.5 },
        ],
      },
      'm',
    );
    expect(map.pins).toHaveLength(1);
    expect(map.pins[0]).toMatchObject({ id: 'a', x: 1, y: 0, label: 'Keep' });
  });

  it('falls back to the palette and the icon list for unknown values', () => {
    const [pin] = normalizeMap(
      { pins: [{ id: 'a', x: 0.5, y: 0.5, color: '#ff0000', icon: 'not-an-icon' }] },
      'm',
    ).pins;
    expect(pin.color).toBe('red');
    expect(pin.icon).toBe('map-pin');
    expect(
      normalizeMap({ pins: [{ id: 'a', x: 0, y: 0, color: 'teal', icon: 'castle' }] }, 'm').pins[0],
    ).toMatchObject({ color: 'teal', icon: 'castle' });
  });

  it('refuses a pin link that leaves the vault', () => {
    const links = ['camp/locations/keep.md', '/etc/passwd', '../outside.md', ''].map(
      (link) => normalizeMap({ pins: [{ id: 'a', x: 0, y: 0, link }] }, 'm').pins[0].link,
    );
    expect(links).toEqual(['camp/locations/keep.md', null, null, null]);
  });

  it('needs two valid points for a path and clamps its width', () => {
    const map = normalizeMap(
      {
        paths: [
          { id: 'one', points: [{ x: 0, y: 0 }] },
          {
            id: 'bad',
            points: [
              { x: 0, y: 0 },
              { x: 'a', y: 1 },
            ],
          },
          {
            id: 'ok',
            width: 99,
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
          },
        ],
      },
      'm',
    );
    expect(map.paths.map((item) => item.id)).toEqual(['ok']);
    expect(map.paths[0].width).toBe(12);
    expect(map.paths[0].color).toBe('blue');
  });

  it('keeps a path closed only when it has the three points of an area', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ];
    const map = normalizeMap(
      {
        paths: [
          { id: 'area', closed: true, points: square },
          { id: 'two', closed: true, points: square.slice(0, 2) },
          { id: 'line', points: square },
          { id: 'text', closed: 'yes', points: square },
        ],
      },
      'm',
    );
    const closed = Object.fromEntries(map.paths.map((path) => [path.id, path.closed]));
    expect(closed).toEqual({ area: true, two: false, line: false, text: false });
  });

  it('keeps note text and drops notes without a position', () => {
    const map = normalizeMap(
      {
        notes: [
          { id: 'n', x: 0.1, y: 0.2, text: 'Ambush here' },
          { id: 'x', text: 'lost' },
        ],
      },
      'm',
    );
    expect(map.notes).toEqual([{ id: 'n', x: 0.1, y: 0.2, text: 'Ambush here', color: 'yellow' }]);
  });

  it('makes ids unique and gives missing ones a new id', () => {
    const map = normalizeMap(
      {
        pins: [
          { id: 'same', x: 0, y: 0 },
          { id: 'same', x: 1, y: 1 },
          { x: 0.5, y: 0.5 },
        ],
      },
      'm',
    );
    expect(map.pins).toHaveLength(2);
    expect(new Set(map.pins.map((pin) => pin.id)).size).toBe(2);
  });

  it('drops unknown fields', () => {
    const map = normalizeMap(
      { name: 'M', secret: 'x', pins: [{ id: 'a', x: 0, y: 0, extra: 1 }] },
      'm',
    );
    expect(map).not.toHaveProperty('secret');
    expect(map.pins[0]).not.toHaveProperty('extra');
  });
});

describe('map files', () => {
  let vault;

  beforeEach(() => {
    vault = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-map-'));
  });

  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  it('creates a map, refuses a taken name, and only works inside the Maps section', async () => {
    const created = await createMap(vault, {
      folderPath: 'camp/maps',
      slug: 'coast',
      name: 'The Coast',
      image: 'camp/assets/coast.png',
    });
    expect(created.path).toBe('camp/maps/coast.json');
    expect(created.map).toMatchObject({ name: 'The Coast', image: 'camp/assets/coast.png' });

    await expect(
      createMap(vault, {
        folderPath: 'camp/maps',
        slug: 'coast',
        name: 'Again',
        image: 'camp/assets/c.png',
      }),
    ).rejects.toThrow(/already exists/);
    await expect(
      createMap(vault, {
        folderPath: 'camp/encounters',
        slug: 'x',
        name: 'X',
        image: 'camp/assets/c.png',
      }),
    ).rejects.toThrow(/Not a map file/);
  });

  it('creates a drawn map without an image and keeps its drawing through a save', async () => {
    const created = await createMap(vault, {
      folderPath: 'camp/maps',
      slug: 'dungeon',
      name: 'Dungeon',
      image: null,
      drawing: { cols: 12, rows: 9 },
    });
    expect(created.map.image).toBeNull();
    expect(created.map.drawing).toMatchObject({ cols: 12, rows: 9 });

    const saved = await writeMap(
      vault,
      created.path,
      { ...created.map, image: 'camp/assets/dungeon.png' },
      created.contentHash,
    );
    expect(saved.status).toBe('saved');
    const reread = await readMap(vault, created.path);
    expect(reread.map.image).toBe('camp/assets/dungeon.png');
    expect(reread.map.drawing).toMatchObject({ cols: 12, rows: 9 });
  });

  it('saves with the hash it loaded and reports a conflict when the file changed', async () => {
    const file = await createMap(vault, {
      folderPath: 'camp/maps',
      slug: 'coast',
      name: 'Coast',
      image: 'camp/assets/coast.png',
    });
    const edited = { ...file.map, pins: [{ id: 'p', x: 0.5, y: 0.5, label: 'Port' }] };

    const saved = await writeMap(vault, file.path, edited, file.contentHash);
    expect(saved.status).toBe('saved');
    expect((await readMap(vault, file.path)).map.pins[0].label).toBe('Port');

    // A second writer still holding the first hash must not overwrite the saved version.
    const stale = await writeMap(vault, file.path, { ...file.map, name: 'Mine' }, file.contentHash);
    expect(stale.status).toBe('conflict');
    expect(stale.current.map.pins[0].label).toBe('Port');
    expect((await readMap(vault, file.path)).map.name).toBe('Coast');
  });

  it('opens a file that is not valid JSON empty and reports why', async () => {
    fs.mkdirSync(path.join(vault, 'camp/maps'), { recursive: true });
    fs.writeFileSync(path.join(vault, 'camp/maps/broken.json'), '{ not json');
    const file = await readMap(vault, 'camp/maps/broken.json');
    expect(file.parseError).toBeTruthy();
    expect(file.map).toMatchObject({ name: 'broken', pins: [], paths: [], notes: [] });
  });
});
