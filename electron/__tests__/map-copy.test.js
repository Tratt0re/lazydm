import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createMap, readMap } = require('../models/map.model');
const { copyMapImage } = require('../controllers/document.controller');

describe('copyMapImage', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-map-copy-'));
    fs.mkdirSync(path.join(root, 'camp', 'assets'), { recursive: true });
    fs.mkdirSync(path.join(root, 'camp', 'maps'), { recursive: true });
    fs.writeFileSync(path.join(root, 'camp', 'assets', 'world.png'), 'png-bytes');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function copyMapFile() {
    await createMap(root, {
      folderPath: 'camp/maps',
      slug: 'world',
      name: 'World',
      image: 'camp/assets/world.png',
    });
    fs.mkdirSync(path.join(root, 'compendium', 'srd', 'maps'), { recursive: true });
    fs.copyFileSync(
      path.join(root, 'camp', 'maps', 'world.json'),
      path.join(root, 'compendium', 'srd', 'maps', 'world.json'),
    );
  }

  it('copies the image into the target assets and points the copy at it', async () => {
    await copyMapFile();
    const image = await copyMapImage(
      root,
      'camp/maps/world.json',
      'compendium/srd/maps/world.json',
      'compendium/srd',
    );

    expect(image).toBe('compendium/srd/assets/world.png');
    expect(fs.readFileSync(path.join(root, image), 'utf8')).toBe('png-bytes');
    const copied = await readMap(root, 'compendium/srd/maps/world.json');
    expect(copied.map.image).toBe('compendium/srd/assets/world.png');
    // The source keeps pointing at its own image.
    expect((await readMap(root, 'camp/maps/world.json')).map.image).toBe('camp/assets/world.png');
  });

  it('keeps an image the target already has and still points the copy at it', async () => {
    await copyMapFile();
    fs.mkdirSync(path.join(root, 'compendium', 'srd', 'assets'), { recursive: true });
    fs.writeFileSync(path.join(root, 'compendium', 'srd', 'assets', 'world.png'), 'existing');

    const image = await copyMapImage(
      root,
      'camp/maps/world.json',
      'compendium/srd/maps/world.json',
      'compendium/srd',
    );

    expect(image).toBe('compendium/srd/assets/world.png');
    expect(fs.readFileSync(path.join(root, image), 'utf8')).toBe('existing');
  });

  it('does nothing for a map without an image', async () => {
    await createMap(root, { folderPath: 'camp/maps', slug: 'blank', name: 'Blank', image: null });
    fs.copyFileSync(
      path.join(root, 'camp', 'maps', 'blank.json'),
      path.join(root, 'camp', 'maps', 'blank-copy.json'),
    );
    expect(
      await copyMapImage(root, 'camp/maps/blank.json', 'camp/maps/blank-copy.json', 'camp'),
    ).toBeNull();
  });
});
