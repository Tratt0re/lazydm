const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

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

module.exports = {
  RETENTION_MS,
  begin,
  complete,
  listPending,
  purgeStale,
  setJournalDirForTests,
};
