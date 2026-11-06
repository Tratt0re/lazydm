import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { vaultIndexModel } = require('../models');
const fileUtils = require('../utils/file-utils');
const writeJournal = require('../utils/write-journal');
const cloudReadinessController = require('../controllers/cloud-readiness.controller');
const indexerController = require('../controllers/indexer.controller');
const vaultController = require('../controllers/vault.controller');
const copiesController = require('../controllers/copies.controller');

let vault;
let journal;
let reindexed;
let trashed;

const write = (relativePath, content) => {
  const absolutePath = path.join(vault, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
};
const read = (relativePath) => fs.readFileSync(path.join(vault, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(vault, relativePath));
const hashOf = (relativePath) => fileUtils.hashContent(fs.readFileSync(path.join(vault, relativePath)));

/** The index as the app would hold it for the copies in `copies`, with `incoming` links per target path. */
function indexWith(copies, incoming = {}) {
  vi.spyOn(vaultController, 'getReadyVaultPath').mockReturnValue(vault);
  vi.spyOn(indexerController, 'isOpen').mockReturnValue(true);
  vi.spyOn(cloudReadinessController, 'listSyncCopies').mockReturnValue(copies);
  vi.spyOn(vaultIndexModel, 'listIncomingLinks').mockImplementation(
    (target) => incoming[target] ?? [],
  );
  vi.spyOn(indexerController, 'reindexPaths').mockImplementation(async (paths) => {
    reindexed.push(...paths);
  });
  vi.spyOn(fileUtils, 'trashVaultItem').mockImplementation(async (absolutePath) => {
    trashed.push(path.relative(vault, absolutePath));
  });
}

const PAIR = [
  { path: 'camp/enemies/goblin 2.md', originalPath: 'camp/enemies/goblin.md', kind: 'pair' },
];
const ORPHAN = [
  { path: 'camp/enemies/goblin 2.md', originalPath: 'camp/enemies/goblin.md', kind: 'orphan' },
];
const LINK_TO_COPY = {
  'camp/enemies/goblin 2.md': [{ sourcePath: 'camp/scenes/cave.md', raw: 'goblin 2' }],
};

beforeEach(() => {
  vault = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-copies-')));
  journal = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-copies-journal-'));
  writeJournal.setJournalDirForTests(journal);
  reindexed = [];
  trashed = [];
  write('camp/scenes/cave.md', 'The cave holds a [[goblin 2]] and a [[wolf]].\n');
});

afterEach(() => {
  vi.restoreAllMocks();
  writeJournal.setJournalDirForTests(null);
  fs.rmSync(vault, { recursive: true, force: true });
  fs.rmSync(journal, { recursive: true, force: true });
});

describe('copies compare', () => {
  it('shows what differs between a copy and its original', async () => {
    write('camp/enemies/goblin.md', '# Goblin\nHP 7\nfine\n');
    write('camp/enemies/goblin 2.md', '# Goblin\nHP 9\nfine\n');
    indexWith(PAIR, LINK_TO_COPY);

    const view = await copiesController.compare({ path: PAIR[0].path });

    expect(view.isIdentical).toBe(false);
    expect(view.actions).toEqual(['keep-original', 'keep-both']);
    expect(view.copy.linkCount).toBe(1);
    expect(view.diff.map((op) => `${op.type}:${op.text ?? op.count}`)).toEqual([
      'same:# Goblin',
      'del:HP 7',
      'add:HP 9',
      'same:fine',
      'same:',
    ]);
  });

  it('offers to restore the name when the original is gone', async () => {
    write('camp/enemies/goblin 2.md', '# Goblin\n');
    indexWith(ORPHAN);

    const view = await copiesController.compare({ path: ORPHAN[0].path });

    expect(view.original).toBeNull();
    expect(view.actions).toEqual(['restore-name', 'keep-both']);
  });

  it('refuses a path the scan does not list', async () => {
    write('camp/enemies/other.md', 'x');
    indexWith(PAIR);
    await expect(copiesController.compare({ path: 'camp/enemies/other.md' })).rejects.toThrow(
      /no longer listed/,
    );
  });
});

describe('copies resolve', () => {
  it('keep-original: links follow to the original and the copy goes to the Trash', async () => {
    write('camp/enemies/goblin.md', '# Goblin\n');
    write('camp/enemies/goblin 2.md', '# Goblin\nedited\n');
    indexWith(PAIR, LINK_TO_COPY);

    const result = await copiesController.resolve({
      path: PAIR[0].path,
      action: 'keep-original',
      copyHash: hashOf('camp/enemies/goblin 2.md'),
      originalHash: hashOf('camp/enemies/goblin.md'),
    });

    expect(result.path).toBe('camp/enemies/goblin.md');
    expect(result.updatedPaths).toEqual(['camp/scenes/cave.md']);
    expect(read('camp/scenes/cave.md')).toContain('[[goblin]]');
    expect(trashed).toEqual(['camp/enemies/goblin 2.md']);
    expect(read('camp/enemies/goblin.md')).toBe('# Goblin\n');
    expect(reindexed).toEqual(
      expect.arrayContaining(['camp/enemies/goblin 2.md', 'camp/scenes/cave.md']),
    );
  });

  it('keep-both: the copy gets a -copy name, links follow, nothing is trashed', async () => {
    write('camp/enemies/goblin.md', '# Goblin\n');
    write('camp/enemies/goblin 2.md', '# Goblin 2\n');
    indexWith(PAIR, LINK_TO_COPY);

    const result = await copiesController.resolve({
      path: PAIR[0].path,
      action: 'keep-both',
      copyHash: hashOf('camp/enemies/goblin 2.md'),
      originalHash: hashOf('camp/enemies/goblin.md'),
    });

    expect(result.path).toBe('camp/enemies/goblin-copy.md');
    expect(exists('camp/enemies/goblin 2.md')).toBe(false);
    expect(read('camp/enemies/goblin-copy.md')).toBe('# Goblin 2\n');
    expect(read('camp/scenes/cave.md')).toContain('[[goblin-copy]]');
    expect(trashed).toEqual([]);
  });

  it('keep-both takes the next free -copy name', async () => {
    write('camp/enemies/goblin.md', '# Goblin\n');
    write('camp/enemies/goblin-copy.md', 'taken');
    write('camp/enemies/goblin 2.md', '# Goblin 2\n');
    indexWith(PAIR);

    const result = await copiesController.resolve({
      path: PAIR[0].path,
      action: 'keep-both',
      copyHash: hashOf('camp/enemies/goblin 2.md'),
      originalHash: hashOf('camp/enemies/goblin.md'),
    });

    expect(result.path).toBe('camp/enemies/goblin-copy-2.md');
    expect(read('camp/enemies/goblin-copy.md')).toBe('taken');
  });

  it('restore-name: the lone copy takes the original name back', async () => {
    write('camp/enemies/goblin 2.md', '# Goblin\n');
    indexWith(ORPHAN);

    const result = await copiesController.resolve({
      path: ORPHAN[0].path,
      action: 'restore-name',
      copyHash: hashOf('camp/enemies/goblin 2.md'),
      originalHash: null,
    });

    expect(result.path).toBe('camp/enemies/goblin.md');
    expect(exists('camp/enemies/goblin 2.md')).toBe(false);
    expect(read('camp/enemies/goblin.md')).toBe('# Goblin\n');
    expect(reindexed).toEqual(
      expect.arrayContaining(['camp/enemies/goblin 2.md', 'camp/enemies/goblin.md']),
    );
  });

  it('refuses when a file changed since it was shown', async () => {
    write('camp/enemies/goblin.md', '# Goblin\n');
    write('camp/enemies/goblin 2.md', '# Goblin 2\n');
    indexWith(PAIR);

    await expect(
      copiesController.resolve({
        path: PAIR[0].path,
        action: 'keep-original',
        copyHash: 'stale',
        originalHash: hashOf('camp/enemies/goblin.md'),
      }),
    ).rejects.toThrow(/changed since/);
    expect(exists('camp/enemies/goblin 2.md')).toBe(true);
    expect(trashed).toEqual([]);
  });

  it('refuses keep-original when there is no original, and restore-name when there is one', async () => {
    write('camp/enemies/goblin 2.md', '# Goblin 2\n');
    indexWith(ORPHAN);
    await expect(
      copiesController.resolve({
        path: ORPHAN[0].path,
        action: 'keep-original',
        copyHash: hashOf('camp/enemies/goblin 2.md'),
        originalHash: null,
      }),
    ).rejects.toThrow(/original is gone/);

    vi.restoreAllMocks();
    write('camp/enemies/goblin.md', '# Goblin\n');
    indexWith(PAIR);
    await expect(
      copiesController.resolve({
        path: PAIR[0].path,
        action: 'restore-name',
        copyHash: hashOf('camp/enemies/goblin 2.md'),
        originalHash: hashOf('camp/enemies/goblin.md'),
      }),
    ).rejects.toThrow(/original is back/);
  });

  it('leaves a note changed meanwhile alone and reports it', async () => {
    write('camp/enemies/goblin.md', '# Goblin\n');
    write('camp/enemies/goblin 2.md', '# Goblin 2\n');
    indexWith(PAIR, LINK_TO_COPY);
    const realWrite = require('../models').documentModel.writeDocument;
    vi.spyOn(require('../models').documentModel, 'writeDocument').mockImplementation(
      async (root, relativePath, content, expectedHash) => {
        if (relativePath === 'camp/scenes/cave.md') {
          write('camp/scenes/cave.md', 'someone else edited this\n');
        }
        return realWrite(root, relativePath, content, expectedHash);
      },
    );

    const result = await copiesController.resolve({
      path: PAIR[0].path,
      action: 'keep-both',
      copyHash: hashOf('camp/enemies/goblin 2.md'),
      originalHash: hashOf('camp/enemies/goblin.md'),
    });

    expect(result.failedPaths).toEqual(['camp/scenes/cave.md']);
    expect(read('camp/scenes/cave.md')).toBe('someone else edited this\n');
  });
});
