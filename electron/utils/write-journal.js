const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { hashContent, resolveInsideVault } = require('./file-utils');

/**
 * Recovery journal of in-place note writes. Before a note is overwritten its new content is kept in the app's local
 * data folder (never in the vault, so no sync client sees it); once the write is verified the entry is removed.
 * An entry that is still there at the next start means the write may have been cut short.
 */

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
let journalDirOverride = null;

function getJournalDir() {
  if (journalDirOverride) {
    return journalDirOverride;
  }

  // electron is loaded lazily so tests can run without it.
  const { app } = require('electron');
  return path.join(app.getPath('userData'), 'recovery');
}

/** Tests point the journal at a temporary folder. */
function setJournalDirForTests(directory) {
  journalDirOverride = directory;
}

function entryPathOf(rootPath, relativePath) {
  const id = createHash('sha256').update(`${path.resolve(rootPath)}\0${relativePath}`).digest('hex');
  return path.join(getJournalDir(), `${id}.json`);
}

/** Keeps the content about to be written; returns the entry to pass to `complete`. */
function begin(rootPath, relativePath, content, expectedHash) {
  const entryPath = entryPathOf(rootPath, relativePath);
  fs.mkdirSync(path.dirname(entryPath), { recursive: true });
  const entry = {
    rootPath: path.resolve(rootPath),
    path: relativePath,
    content,
    expectedHash: expectedHash ?? null,
    createdAt: Date.now(),
  };
  const descriptor = fs.openSync(entryPath, 'w');
  try {
    fs.writeFileSync(descriptor, JSON.stringify(entry));
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }

  return entryPath;
}

/** The write is verified: the entry is not needed any more. */
function complete(entryPath) {
  fs.rmSync(entryPath, { force: true });
}

/** Entries left by writes that were not verified. */
function listPending() {
  const directory = getJournalDir();
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => {
      const entryPath = path.join(directory, name);
      try {
        return [{ entryPath, ...JSON.parse(fs.readFileSync(entryPath, 'utf8')) }];
      } catch {
        // An unreadable entry cannot be restored: drop it.
        fs.rmSync(entryPath, { force: true });
        return [];
      }
    });
}

/** Removes entries older than the retention time, or whose vault folder is gone. Returns how many. */
function purgeStale(now = Date.now()) {
  let removed = 0;
  for (const entry of listPending()) {
    if (now - entry.createdAt > RETENTION_MS || !fs.existsSync(entry.rootPath)) {
      complete(entry.entryPath);
      removed += 1;
    }
  }

  return removed;
}

/** Id of an entry (its file name without extension): what the UI sends back to resolve it. */
function idOf(entryPath) {
  return path.basename(entryPath, '.json');
}

/** The pending entry with this id, or null. */
function findById(id) {
  return listPending().find((entry) => idOf(entry.entryPath) === id) ?? null;
}

/**
 * What the note on disk looks like next to an entry:
 * - `done`: it already has the journaled content (the entry is only left over);
 * - `untouched`: it still has the content the editor loaded, or is gone: the write never started;
 * - `interrupted`: it is empty or cut short, a prefix of the journaled content: the write stopped half way;
 * - `changed`: anything else (another device or app changed it): the journaled edits must not overwrite it.
 */
function inspect(entry) {
  let disk;
  try {
    disk = fs.readFileSync(resolveInsideVault(entry.rootPath, entry.path));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { state: 'untouched', diskHash: null };
    }
    throw error;
  }

  const diskHash = hashContent(disk);
  if (diskHash === hashContent(Buffer.from(entry.content, 'utf8'))) {
    return { state: 'done', diskHash };
  }

  if (diskHash === entry.expectedHash) {
    return { state: 'untouched', diskHash };
  }

  const text = disk.toString('utf8');
  return { state: entry.content.startsWith(text) ? 'interrupted' : 'changed', diskHash };
}

module.exports = {
  RETENTION_MS,
  findById,
  idOf,
  inspect,
  begin,
  complete,
  listPending,
  purgeStale,
  setJournalDirForTests,
};
