import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The index needs better-sqlite3, which is built for Electron: run this file with
// `ELECTRON_RUN_AS_NODE=1 npx electron node_modules/vitest/vitest.mjs run electron/__tests__/folder-graph.test.js`
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

describeWithSqlite('vault index folder graph', () => {
  let userData;
  let model;
  let indexDb;

  beforeAll(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-graph-'));
    const electronPath = require.resolve('electron');
    require.cache[electronPath] = {
      id: electronPath,
      filename: electronPath,
      loaded: true,
      exports: { app: { getPath: () => userData, isPackaged: false } },
    };
    indexDb = require('../database/vault-index-db');
    indexDb.openVaultIndexDatabase('graph-test');
    model = require('../models/vault-index.model');

    note('camp/enemies/captain.md', [
      'ashen cultist',
      'oswin',
      'blackwater keep',
      'crownless king',
    ]);
    note('camp/enemies/ashen cultist.md', ['oswin', 'blackwater keep', 'ashen cultist']);
    note('camp/enemies/humans/oswin.md', ['captain', 'captain']);
    note('camp/enemies/lonely.md', ['no such note']);
    note('camp/enemies/undead/crownless king.md');
    note('camp/_templates/enemy.md', ['{{placeholder}}']);
    note('camp/enemies/_templates/enemy.md', ['ashen cultist']);
    note('camp/locations/blackwater keep.md', ['captain']);
    note('camp/locations/far away.md', ['blackwater keep']);
    note('camp/enemies-extra/stray.md', ['captain']);
    model.resolveLinks();
  });

  afterAll(() => {
    indexDb?.closeVaultIndexDatabase();
    fs.rmSync(userData, { recursive: true, force: true });
  });

  function note(filePath, links = []) {
    const parsedLinks = links.map((raw, index) => ({
      raw,
      targetPath: null,
      targetName: raw,
      heading: null,
      label: null,
      kind: 'wikilink',
      line: index + 1,
    }));
    model.saveFile(
      { path: filePath, size: 10, mtimeMs: 1 },
      {
        title: path.posix.basename(filePath, '.md'),
        frontmatter: {},
        tags: [],
        headings: [],
        body: '',
        links: parsedLinks,
        type: null,
      },
    );
  }

  const paths = (nodes) => nodes.map((node) => node.path);
  const pairs = (edges) => edges.map((edge) => `${edge.source} -> ${edge.target}`);

  it('has a node per note of the folder and its sub-folders, templates left out', () => {
    const graph = model.getFolderGraph('camp/enemies');

    expect(paths(graph.nodes.filter((node) => !node.external)).sort()).toEqual([
      'camp/enemies/ashen cultist.md',
      'camp/enemies/captain.md',
      'camp/enemies/humans/oswin.md',
      'camp/enemies/lonely.md',
      'camp/enemies/undead/crownless king.md',
    ]);
  });

  it('draws one edge per pair, no self-link and no broken link', () => {
    const graph = model.getFolderGraph('camp/enemies');

    expect(pairs(graph.edges)).toEqual([
      'camp/enemies/ashen cultist.md -> camp/enemies/humans/oswin.md',
      'camp/enemies/ashen cultist.md -> camp/locations/blackwater keep.md',
      'camp/enemies/captain.md -> camp/enemies/ashen cultist.md',
      'camp/enemies/captain.md -> camp/enemies/humans/oswin.md',
      'camp/enemies/captain.md -> camp/enemies/undead/crownless king.md',
      'camp/enemies/captain.md -> camp/locations/blackwater keep.md',
      'camp/enemies/humans/oswin.md -> camp/enemies/captain.md',
    ]);
    expect(graph.truncated).toBe(false);
  });

  it('adds the files it links to outside the folder, one hop only', () => {
    const graph = model.getFolderGraph('camp/enemies');
    const external = graph.nodes.filter((node) => node.external);

    expect(paths(external)).toEqual(['camp/locations/blackwater keep.md']);
    // "far away" links to the keep, but it is not linked from the folder: it stays out.
    expect(paths(graph.nodes)).not.toContain('camp/locations/far away.md');
    // a link from the keep back to the captain is not an edge of this folder's graph
    expect(pairs(graph.edges)).not.toContain(
      'camp/locations/blackwater keep.md -> camp/enemies/captain.md',
    );
  });

  it('does not take a folder with the same start for a sub-folder', () => {
    const graph = model.getFolderGraph('camp/enemies');

    expect(paths(graph.nodes)).not.toContain('camp/enemies-extra/stray.md');
  });

  it('is empty for a folder without notes', () => {
    expect(model.getFolderGraph('camp/nothing')).toEqual({
      nodes: [],
      edges: [],
      truncated: false,
    });
  });

  it('keeps the notes of the folder first and says when it cut', () => {
    const graph = model.getFolderGraph('camp/enemies', 5);

    expect(graph.nodes).toHaveLength(5);
    expect(graph.nodes.every((node) => !node.external)).toBe(true);
    expect(graph.truncated).toBe(true);
    const shown = new Set(paths(graph.nodes));
    expect(graph.edges.every((edge) => shown.has(edge.source) && shown.has(edge.target))).toBe(
      true,
    );
  });

  it('fills what is left with the neighbours linked from most notes', () => {
    const graph = model.getFolderGraph('camp/enemies', 6);

    expect(paths(graph.nodes.filter((node) => node.external))).toEqual([
      'camp/locations/blackwater keep.md',
    ]);
    expect(graph.truncated).toBe(false);
  });
});
