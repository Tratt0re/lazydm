import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// End to end on a temporary vault with the real indexer, watcher and controllers (only Electron's app, shell and
// windows are stubbed). Needs better-sqlite3 built for Electron: `npm run test:electron:index`. Skipped under plain Node.
const require = createRequire(import.meta.url);
let Database = null;
try {
  Database = require('better-sqlite3');
  new Database(':memory:').close();
} catch {
  Database = null;
}

const describeWithSqlite = Database ? describe : describe.skip;

describeWithSqlite('copies made by sync, from the file system to the repair', () => {
  let userData;
  let vault;
  let trash;
  let controllers;
  let broadcasts;

  const abs = (relativePath) => path.join(vault, relativePath);
  const write = (relativePath, content) => {
    fs.mkdirSync(path.dirname(abs(relativePath)), { recursive: true });
    fs.writeFileSync(abs(relativePath), content);
  };
  const read = (relativePath) => fs.readFileSync(abs(relativePath), 'utf8');
  const exists = (relativePath) => fs.existsSync(abs(relativePath));
  const hashOf = (relativePath) =>
    require('../utils/file-utils').hashContent(fs.readFileSync(abs(relativePath)));

  /** Waits (the watcher and the index are asynchronous) until `check` holds. */
  async function until(check, label, timeoutMs = 6000) {
    const start = Date.now();
    for (;;) {
      const value = await check();
      if (value) {
        return value;
      }
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Timed out waiting for: ${label}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  const copyPaths = () => controllers.cloud.getStatus().conflictPaths;

  beforeAll(async () => {
    userData = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-flow-data-')));
    vault = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-flow-vault-')));
    trash = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-flow-trash-'));
    broadcasts = [];

    const electronPath = require.resolve('electron');
    require.cache[electronPath] = {
      id: electronPath,
      filename: electronPath,
      loaded: true,
      exports: {
        app: { getPath: () => userData, isPackaged: false, getName: () => 'LazyDM' },
        shell: {
          // The system Trash: the file leaves the vault and is kept apart.
          trashItem: async (absolutePath) => {
            fs.renameSync(absolutePath, path.join(trash, path.basename(absolutePath)));
          },
        },
        BrowserWindow: {
          getAllWindows: () => [
            {
              isDestroyed: () => false,
              webContents: {
                isDestroyed: () => false,
                send: (channel, payload) => broadcasts.push({ channel, payload }),
              },
            },
          ],
        },
      },
    };

    write('lost-mine/campaign.md', '---\ntitle: Lost Mine\n---\n# Lost Mine\n');
    write('lost-mine/enemies/goblin.md', '# Goblin\n\nSmall and sneaky.\n');
    write(
      'lost-mine/scenes/cave.md',
      '# Cave\n\nA [[goblin]] guards the way and a [[wolf]] howls outside.\n',
    );

    const { vaultController, indexerController, cloudReadinessController, copiesController } =
      require('../controllers');
    const writeJournal = require('../utils/write-journal');
    writeJournal.setJournalDirForTests(path.join(userData, 'recovery'));
    vi.spyOn(vaultController, 'getReadyVaultPath').mockReturnValue(vault);

    controllers = {
      indexer: indexerController,
      cloud: cloudReadinessController,
      copies: copiesController,
      documents: require('../controllers').documentController,
      review: require('../controllers').reviewController,
    };

    const vaultRecord = { id: 'flow-test', path: vault, name: 'Flow' };
    indexerController.start(vaultRecord);
    await until(() => indexerController.getStatus().status === 'ready', 'first index');
    await cloudReadinessController.prepare(vaultRecord);
    await until(() => cloudReadinessController.getStatus().status === 'ready', 'cloud ready');
  });

  afterAll(() => {
    controllers?.indexer.stop();
    controllers?.cloud.cancel();
    vi.restoreAllMocks();
    for (const dir of [userData, vault, trash]) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('starts with no copies, and the unresolved [[wolf]] alone is not one', () => {
    expect(copyPaths()).toEqual([]);
  });

  it('a note saved in place leaves no other file in the vault and no copy to report', async () => {
    const before = fs.readdirSync(abs('lost-mine/enemies'));
    const note = await controllers.documents.read({ path: 'lost-mine/enemies/goblin.md' });
    const result = await controllers.documents.write({
      path: 'lost-mine/enemies/goblin.md',
      content: `${note.content}A new line.\n`,
      expectedHash: note.contentHash,
    });

    expect(result.status).toBe('saved');
    expect(fs.readdirSync(abs('lost-mine/enemies'))).toEqual(before);
    expect(require('../utils/write-journal').listPending()).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(copyPaths()).toEqual([]);
  });

  it('the banner follows a lone copy dropped by the sync client while the app runs', async () => {
    broadcasts.length = 0;
    write('lost-mine/enemies/wolf 2.md', '# Wolf\n\nHunts in packs.\n');

    await until(
      () => copyPaths().includes('lost-mine/enemies/wolf 2.md'),
      'the orphan to be reported',
    );
    expect(broadcasts.some((item) => item.channel === 'cloud:statusChanged')).toBe(true);

    const review = await controllers.review.list({ scope: 'lost-mine' });
    expect(review.copies).toEqual([
      { path: 'lost-mine/enemies/wolf 2.md', originalPath: 'lost-mine/enemies/wolf.md', kind: 'orphan' },
    ]);
  });

  it('the manual look from the settings reports the same copies', async () => {
    const status = await controllers.cloud.scanConflictCopies();
    expect(status.conflictPaths).toEqual(['lost-mine/enemies/wolf 2.md']);
  });

  it('restoring the name makes the broken link resolve and clears the report', async () => {
    const view = await controllers.copies.compare({ path: 'lost-mine/enemies/wolf 2.md' });
    expect(view.actions).toEqual(['restore-name', 'keep-both']);
    expect(view.original).toBeNull();

    const result = await controllers.copies.resolve({
      path: view.path,
      action: 'restore-name',
      copyHash: view.copy.hash,
      originalHash: null,
    });

    expect(result.path).toBe('lost-mine/enemies/wolf.md');
    expect(exists('lost-mine/enemies/wolf 2.md')).toBe(false);
    expect(read('lost-mine/enemies/wolf.md')).toContain('Hunts in packs');
    // The note did not need to change: it already said [[wolf]].
    expect(read('lost-mine/scenes/cave.md')).toContain('[[wolf]]');

    await until(() => copyPaths().length === 0, 'the report to clear');
    const { vaultIndexModel } = require('../models');
    const broken = vaultIndexModel.listBrokenLinks('lost-mine');
    expect(broken.filter((link) => link.targetName === 'wolf')).toEqual([]);
  });

  it('a pair: keep the original rewrites the links to the copy and trashes it', async () => {
    write('lost-mine/scenes/camp.md', '# Camp\n\nSee [[goblin 2]] for the boss.\n');
    write('lost-mine/enemies/goblin 2.md', '# Goblin\n\nSmall, sneaky and armed.\n');
    await until(
      () => copyPaths().includes('lost-mine/enemies/goblin 2.md'),
      'the pair to be reported',
    );

    const view = await controllers.copies.compare({ path: 'lost-mine/enemies/goblin 2.md' });
    expect(view.kind).toBe('pair');
    expect(view.copy.linkCount).toBe(1);
    expect(view.diff.some((op) => op.type === 'add' && op.text.includes('armed'))).toBe(true);

    const result = await controllers.copies.resolve({
      path: view.path,
      action: 'keep-original',
      copyHash: view.copy.hash,
      originalHash: view.original.hash,
    });

    expect(result.updatedPaths).toEqual(['lost-mine/scenes/camp.md']);
    expect(read('lost-mine/scenes/camp.md')).toContain('[[goblin]]');
    expect(exists('lost-mine/enemies/goblin 2.md')).toBe(false);
    expect(fs.readdirSync(trash)).toContain('goblin 2.md');
    expect(read('lost-mine/enemies/goblin.md')).toContain('A new line.');

    await until(() => copyPaths().length === 0, 'the report to clear');
  });

  it('a pair: keep both turns the copy into a normal note that is no longer reported', async () => {
    write('lost-mine/enemies/bat 2.md', '# Bat\n');
    write('lost-mine/enemies/bat.md', '# Bat the first\n');
    await until(() => copyPaths().includes('lost-mine/enemies/bat 2.md'), 'the bat pair');

    const view = await controllers.copies.compare({ path: 'lost-mine/enemies/bat 2.md' });
    const result = await controllers.copies.resolve({
      path: view.path,
      action: 'keep-both',
      copyHash: view.copy.hash,
      originalHash: view.original.hash,
    });

    expect(result.path).toBe('lost-mine/enemies/bat-copy.md');
    expect(exists('lost-mine/enemies/bat.md')).toBe(true);
    expect(exists('lost-mine/enemies/bat-copy.md')).toBe(true);
    await until(() => copyPaths().length === 0, 'the report to clear');
  });

  it('a repair stops when a file changed since the panel showed it', async () => {
    write('lost-mine/enemies/owl.md', '# Owl\n');
    write('lost-mine/enemies/owl 2.md', '# Owl copy\n');
    await until(() => copyPaths().includes('lost-mine/enemies/owl 2.md'), 'the owl pair');
    const view = await controllers.copies.compare({ path: 'lost-mine/enemies/owl 2.md' });

    // The cloud client touches the original after the user opened the panel.
    write('lost-mine/enemies/owl.md', '# Owl, changed on the other device\n');

    await expect(
      controllers.copies.resolve({
        path: view.path,
        action: 'keep-original',
        copyHash: view.copy.hash,
        originalHash: view.original.hash,
      }),
    ).rejects.toThrow(/changed since/);
    expect(exists('lost-mine/enemies/owl 2.md')).toBe(true);
    expect(fs.readdirSync(trash)).not.toContain('owl 2.md');
  });

  it('a note really named "Session 2" is left alone', async () => {
    write('lost-mine/scenes/session 2.md', '# Session 2\n');
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(copyPaths()).not.toContain('lost-mine/scenes/session 2.md');
  });
});
