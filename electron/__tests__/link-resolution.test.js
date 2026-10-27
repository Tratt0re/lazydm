import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The index needs better-sqlite3, which is built for Electron: run this file with
// `ELECTRON_RUN_AS_NODE=1 npx electron node_modules/vitest/vitest.mjs run electron/__tests__/link-resolution.test.js`
// (`npm run test:electron:index`). Under plain Node the suite is skipped.
const require = createRequire(import.meta.url);
let Database = null;
try {
  Database = require('better-sqlite3');
  new Database(':memory:').close();
} catch {
  Database = null;
}

const describeWithSqlite = Database ? describe : describe.skip;

describeWithSqlite('vault index link resolution', () => {
  let userData;
  let model;
  let indexDb;

  beforeAll(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-links-'));
    const electronPath = require.resolve('electron');
    require.cache[electronPath] = {
      id: electronPath,
      filename: electronPath,
      loaded: true,
      exports: { app: { getPath: () => userData, isPackaged: false } },
    };
    indexDb = require('../database/vault-index-db');
    indexDb.openVaultIndexDatabase('links-test');
    model = require('../models/vault-index.model');
  });

  afterAll(() => {
    indexDb?.closeVaultIndexDatabase();
    fs.rmSync(userData, { recursive: true, force: true });
  });

  const note = (filePath, links = []) => {
    const parsedLinks = links.map((raw, index) => {
      const [targetPart] = raw.split(/[|#]/);
      const targetPath = targetPart.trim() || null;
      const base = targetPath ? path.posix.basename(targetPath) : '';
      return {
        raw,
        targetPath,
        targetName: base.toLowerCase().endsWith('.md') ? base.slice(0, -3) : base,
        heading: raw.includes('#') ? raw.split('#')[1] : null,
        label: null,
        kind: 'wikilink',
        line: index + 1,
      };
    });
    model.saveFile(
      { path: filePath, size: 10, mtimeMs: 1 },
      { title: path.posix.basename(filePath, '.md'), frontmatter: {}, tags: [], headings: [], body: '', links: parsedLinks, type: null },
    );
  };

  const resolved = (sourcePath) =>
    indexDb
      .getVaultIndexDatabase()
      .prepare(
        `SELECT l.target_raw AS raw, t.path AS target
         FROM links l JOIN files s ON s.id = l.source_file_id LEFT JOIN files t ON t.id = l.target_file_id
         WHERE s.path = ? ORDER BY l.line`,
      )
      .all(sourcePath)
      .map((row) => [row.raw, row.target]);

  it('resolves by exact path, path suffix, name, and prefers the closest match', () => {
    note('camp/enemies/goblin.md');
    note('camp/npcs/goblin.md');
    note('camp/locations/Cave Of Echoes.md');
    note('camp/npcs/deep/elder.md');
    note('other/enemies/goblin.md');
    note('compendium/dnd/notes/goblin.md');
    note('camp/scene.md', [
      'camp/npcs/goblin', // exact path (no extension)
      'npcs/goblin', // path suffix
      'goblin', // name only: two candidates, the shortest path wins
      'cave of echoes', // name is case-insensitive
      'deep/elder', // suffix over two folders
      'missing-note', // nothing to point to
      '#Treasure', // heading only: its own file
    ]);
    model.resolveLinks();

    expect(resolved('camp/scene.md')).toEqual([
      ['camp/npcs/goblin', 'camp/npcs/goblin.md'],
      ['npcs/goblin', 'camp/npcs/goblin.md'],
      ['goblin', 'camp/npcs/goblin.md'],
      ['cave of echoes', 'camp/locations/Cave Of Echoes.md'],
      ['deep/elder', 'camp/npcs/deep/elder.md'],
      ['missing-note', null],
      ['#Treasure', 'camp/scene.md'],
    ]);
  });

  it('never resolves into another campaign or the compendium', () => {
    note('other/ally.md', ['goblin']);
    note('compendium/dnd/notes/rules.md', ['goblin']);
    model.resolveLinks();

    expect(resolved('other/ally.md')).toEqual([['goblin', 'other/enemies/goblin.md']]);
    expect(resolved('compendium/dnd/notes/rules.md')).toEqual([
      ['goblin', 'compendium/dnd/notes/goblin.md'],
    ]);
  });

  it('breaks a link when its target is deleted and mends it when the target returns', () => {
    note('camp/refs.md', ['unique-target']);
    model.resolveLinks();
    expect(resolved('camp/refs.md')).toEqual([['unique-target', null]]);

    note('camp/lore/unique-target.md');
    model.resolveLinks();
    expect(resolved('camp/refs.md')).toEqual([['unique-target', 'camp/lore/unique-target.md']]);

    model.deletePath('camp/lore/unique-target.md');
    model.resolveLinks();
    expect(resolved('camp/refs.md')).toEqual([['unique-target', null]]);
  });
});
