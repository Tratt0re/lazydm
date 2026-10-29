const fs = require('node:fs');
const path = require('node:path');
const { closeVaultIndexDatabase, openVaultIndexDatabase } = require('../database/vault-index-db');
const { sectionModel, vaultIndexModel, vaultModel } = require('../models');
const { broadcastIpcEvent } = require('../ipc/broadcast');
const { hashContent, resolveInsideVault } = require('../utils/file-utils');
const { parseMarkdownDocument } = require('../utils/markdown-parse');

const WATCH_DEBOUNCE_MS = 300;
/**
 * The watcher reports LazyDM's own writes a moment after they were indexed. A path indexed this recently, with the
 * same size and mtime, is not read and broadcast again; any other change to it differs in size or mtime.
 */
const OWN_WRITE_ECHO_WINDOW_MS = 5000;
const OWN_WRITE_MEMORY_LIMIT = 2000;
const DIRECTORY_SIGNATURE = 'dir';
/** An update touching at least this many files blocks the app with the progress screen (smaller ones only show the banner). */
const LARGE_UPDATE_FILE_COUNT = 20;
/** `.json` of the Encounters / Maps section: read to be indexed, like a note. */
const SPECIAL_JSON_PATTERN = /(^|\/)(encounters|maps)\/(.+\/)?[^/]+\.json$/i;
const INDEX_STATUS = Object.freeze({
  idle: 'idle',
  indexing: 'indexing',
  ready: 'ready',
  error: 'error',
});
const INDEX_EVENT_CHANNELS = Object.freeze({
  statusChanged: 'index:statusChanged',
  updated: 'index:updated',
  /** `.lazydm/vault.json` changed (sections, templates, battle rules): written by the app, an agent or another device. */
  configChanged: 'vault:configChanged',
});
const VAULT_CONFIG_PATH = '.lazydm/vault.json';
const INDEX_STATE_DEFAULTS = Object.freeze({
  status: INDEX_STATUS.idle,
  vaultId: null,
  fileCount: 0,
  lastIndexedAtMs: null,
  lastError: null,
  /** Files looked at so far / to look at in the running full scan (0 outside of one). */
  scannedCount: 0,
  scanTotal: 0,
  /** The running update is big enough to block the app with the progress screen. */
  isLargeUpdate: false,
});
/** A scan reports its progress every this many files (each report is a broadcast). */
const PROGRESS_STEP = 25;
/** A watcher batch is small, so it reports more often. */
const WATCH_PROGRESS_STEP = 5;

let indexState = { ...INDEX_STATE_DEFAULTS };
let activeVault = null;
let activeToken = 0;
let watcher = null;
let watchTimer = null;
let pendingWatchPaths = new Set();
let taskQueue = Promise.resolve();
/** Called with the vault paths found still in the cloud (not downloaded) after the vault was open. */
let datalessHandler = null;
/** Path -> what LazyDM last indexed there and when, to recognise the watcher's echo of its own writes. */
const recentlyIndexed = new Map();

function getStatus() {
  return { ...indexState };
}

/** True once the index of the current vault is open (it is queryable while the first scan runs). */
function isOpen() {
  return activeVault !== null;
}

function setIndexState(changes) {
  indexState = { ...indexState, ...changes };
  broadcastIpcEvent(INDEX_EVENT_CHANNELS.statusChanged, getStatus());
}

function isCurrent(token) {
  return activeVault !== null && token === activeToken;
}

/**
 * Index work runs one task at a time; a task started for a vault that was closed meanwhile does nothing.
 * A failure is recorded in the index state and keeps the queue going, and also rejects the returned promise,
 * so a caller that awaits it (a move, a delete) learns that the index is stale.
 */
function enqueue(token, task) {
  const run = taskQueue.then(() => (isCurrent(token) ? task() : undefined));
  taskQueue = run.catch((error) => {
    if (!isCurrent(token)) {
      return;
    }

    console.error('[electron] Vault index task failed:', error);
    setIndexState({
      status: INDEX_STATUS.error,
      lastError: error instanceof Error ? error.message : String(error),
    });
  });

  return run;
}

/** Enqueues a task nobody awaits: its failure is already recorded in the index state. */
function enqueueDetached(token, task) {
  enqueue(token, task).catch(() => undefined);
}

function toFileSignature(file) {
  return `${file.size}:${file.mtimeMs}`;
}

function rememberIndexed(relativePath, signature) {
  if (recentlyIndexed.size >= OWN_WRITE_MEMORY_LIMIT) {
    const cutoff = Date.now() - OWN_WRITE_ECHO_WINDOW_MS;
    for (const [knownPath, entry] of recentlyIndexed) {
      if (entry.at < cutoff) {
        recentlyIndexed.delete(knownPath);
      }
    }
    if (recentlyIndexed.size >= OWN_WRITE_MEMORY_LIMIT) {
      recentlyIndexed.clear();
    }
  }

  recentlyIndexed.set(relativePath, { signature, at: Date.now() });
}

/** True when the watcher reports a path exactly as LazyDM indexed it a moment ago. */
function isOwnWriteEcho(relativePath, signature) {
  const entry = recentlyIndexed.get(relativePath);
  return (
    entry !== undefined &&
    entry.signature === signature &&
    Date.now() - entry.at < OWN_WRITE_ECHO_WINDOW_MS
  );
}

/** A file touched this recently can change again with the same size and mtime tick: its hash decides. */
const RECENT_EDIT_WINDOW_MS = 1000;

function isFileChanged(file, knownState) {
  return (
    !knownState ||
    knownState.size !== file.size ||
    knownState.mtime_ms !== file.mtimeMs ||
    Date.now() - file.mtimeMs < RECENT_EDIT_WINDOW_MS
  );
}

/** An encounter or a map (`.json` of the Encounters / Maps section) is listed by its `name`, like a note by its title; null for any other file. */
async function readEncounterTitle(rootPath, relativePath) {
  if (!SPECIAL_JSON_PATTERN.test(relativePath)) {
    return null;
  }

  try {
    const raw = await fs.promises.readFile(resolveInsideVault(rootPath, relativePath), 'utf8');
    const name = JSON.parse(raw)?.name;
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  } catch {
    return null;
  }
}

async function indexFile(rootPath, file, knownState) {
  await indexFileContent(rootPath, file, knownState);
  rememberIndexed(file.path, toFileSignature(file));
}

async function indexFileContent(rootPath, file, knownState) {
  if (vaultIndexModel.getFileKind(file.path) !== 'md') {
    vaultIndexModel.saveFile(file, null, await readEncounterTitle(rootPath, file.path));
    return;
  }

  const buffer = await fs.promises.readFile(resolveInsideVault(rootPath, file.path));
  const contentHash = hashContent(buffer);
  if (knownState && knownState.content_hash === contentHash) {
    vaultIndexModel.touchFile(knownState.id, file);
    return;
  }

  const document = parseMarkdownDocument(buffer.toString('utf8'), { sourcePath: file.path });
  if (document.frontmatterError) {
    console.warn('[electron] Invalid frontmatter ->', file.path, document.frontmatterError);
  }

  // A note's kind is the section its folder is: the index keeps that section's type for search and copies.
  const location = sectionModel.parseSectionFolder(path.posix.dirname(file.path));
  const section = location
    ? sectionModel.listScopeSections(rootPath, location.scope).find(
        (item) => item.key === location.section,
      )
    : null;
  vaultIndexModel.saveFile({ ...file, contentHash }, { ...document, type: section?.type ?? null });
}

/** Files whose content is read to be indexed: a placeholder of those would make the read wait for the download. */
function needsContentRead(relativePath) {
  return vaultIndexModel.getFileKind(relativePath) === 'md' || SPECIAL_JSON_PATTERN.test(relativePath);
}

/** Tells the cloud check about placeholders the watcher found while the vault is open, so they get downloaded. */
function reportDataless(paths) {
  if (paths.length > 0) {
    datalessHandler?.(paths);
  }
}

/**
 * Brings the index in line with the files on disk: indexes new or changed files and drops deleted ones.
 * `onProgress(done, total)` counts the files that have to be indexed, not the ones that were only looked at.
 * A note still in the cloud is left for later (collected in `datalessSink`) instead of waiting for its download.
 */
async function reconcile(
  token,
  rootPath,
  relativeDir = '',
  onProgress = null,
  skipOwnWrites = false,
  datalessSink = null,
) {
  const knownStates = vaultIndexModel.listFileStates();
  const files = await vaultModel.listVaultFiles(rootPath, relativeDir);
  const folderPrefix = relativeDir ? `${relativeDir}/` : '';
  const seenPaths = new Set();
  const changedPaths = [];
  const datalessPaths = [];
  const pending = [];

  for (const file of files) {
    seenPaths.add(file.path);
    if (skipOwnWrites && isOwnWriteEcho(file.path, toFileSignature(file))) {
      continue;
    }

    const knownState = knownStates.get(file.path);
    if (!isFileChanged(file, knownState)) {
      continue;
    }

    if (file.isDataless) {
      datalessPaths.push(file.path);
      if (needsContentRead(file.path)) {
        continue;
      }
    }

    pending.push({ file, knownState });
  }

  onProgress?.(0, pending.length);
  let done = 0;
  for (const { file, knownState } of pending) {
    if (!isCurrent(token)) {
      return changedPaths;
    }

    try {
      await indexFile(rootPath, file, knownState);
      changedPaths.push(file.path);
    } catch (error) {
      console.warn('[electron] Failed to index file ->', file.path, error);
    }

    done += 1;
    if (onProgress && done % PROGRESS_STEP === 0) {
      onProgress(done, pending.length);
    }
  }

  for (const knownPath of knownStates.keys()) {
    if (knownPath.startsWith(folderPrefix) && !seenPaths.has(knownPath)) {
      vaultIndexModel.deletePath(knownPath);
      changedPaths.push(knownPath);
    }
  }

  datalessSink?.push(...datalessPaths);
  return changedPaths;
}

function publishChanges(changedPaths) {
  if (changedPaths.length === 0) {
    return;
  }

  vaultIndexModel.resolveLinks(vaultIndexModel.getAffectedScopes(changedPaths));
  setIndexState({ fileCount: vaultIndexModel.countFiles(), lastIndexedAtMs: Date.now() });
  broadcastIpcEvent(INDEX_EVENT_CHANNELS.updated, { paths: changedPaths });
}

async function runFullReconcile(token, { forceBlocking = false } = {}) {
  setIndexState({
    status: INDEX_STATUS.indexing,
    vaultId: activeVault.id,
    lastError: null,
    scannedCount: 0,
    scanTotal: 0,
    isLargeUpdate: forceBlocking,
  });

  const changedPaths = await reconcile(token, activeVault.path, '', (scannedCount, scanTotal) =>
    setIndexState({
      scannedCount,
      scanTotal,
      isLargeUpdate: forceBlocking || scanTotal >= LARGE_UPDATE_FILE_COUNT,
    }),
  );
  if (!isCurrent(token)) {
    return;
  }

  publishChanges(changedPaths);
  setIndexState({
    status: INDEX_STATUS.ready,
    scannedCount: 0,
    scanTotal: 0,
    isLargeUpdate: false,
    fileCount: vaultIndexModel.countFiles(),
    lastIndexedAtMs: Date.now(),
  });
}

async function reindexWatchedPaths(token, relativePaths, { fromWatcher = false } = {}) {
  const rootPath = activeVault.path;
  const changedPaths = [];
  const datalessPaths = [];
  // A big batch (a sync that brought many files) blocks the app with the progress screen right away.
  const isLarge = fromWatcher && relativePaths.length >= LARGE_UPDATE_FILE_COUNT;
  const reportProgress = (scannedCount, scanTotal) =>
    setIndexState({ status: INDEX_STATUS.indexing, scannedCount, scanTotal, isLargeUpdate: true });
  if (isLarge) {
    reportProgress(0, relativePaths.length);
  }

  let handled = 0;
  for (const relativePath of relativePaths) {
    if (!isCurrent(token)) {
      return;
    }

    if (isLarge && handled > 0 && handled % WATCH_PROGRESS_STEP === 0) {
      reportProgress(handled, relativePaths.length);
    }
    handled += 1;

    if (vaultModel.isIgnoredVaultPath(relativePath)) {
      continue;
    }

    try {
      const stats = await fs.promises
        .stat(resolveInsideVault(rootPath, relativePath))
        .catch(() => null);

      if (!stats) {
        if (vaultIndexModel.deletePath(relativePath) > 0) {
          changedPaths.push(relativePath);
        }
      } else if (stats.isDirectory()) {
        // The folder was just handled by LazyDM: changes inside it arrive as their own watcher paths.
        if (fromWatcher && isOwnWriteEcho(relativePath, DIRECTORY_SIGNATURE)) {
          continue;
        }

        // A new or renamed folder can hold no file yet: the lists still have to show it.
        const folderProgress = isLarge
          ? null
          : (scannedCount, scanTotal) => {
              if (fromWatcher && scanTotal >= LARGE_UPDATE_FILE_COUNT) {
                reportProgress(scannedCount, scanTotal);
              }
            };
        changedPaths.push(
          relativePath,
          ...(await reconcile(
            token,
            rootPath,
            relativePath,
            folderProgress,
            fromWatcher,
            fromWatcher ? datalessPaths : null,
          )),
        );
        rememberIndexed(relativePath, DIRECTORY_SIGNATURE);
      } else if (stats.isFile()) {
        const file = { path: relativePath, size: stats.size, mtimeMs: Math.trunc(stats.mtimeMs) };
        if (fromWatcher && isOwnWriteEcho(relativePath, toFileSignature(file))) {
          continue;
        }

        const knownState = vaultIndexModel.getFileState(relativePath);
        if (isFileChanged(file, knownState)) {
          if (vaultModel.isDatalessStats(stats)) {
            datalessPaths.push(relativePath);
            if (needsContentRead(relativePath)) {
              continue;
            }
          }

          await indexFile(rootPath, file, knownState);
          changedPaths.push(relativePath);
        }
      }
    } catch (error) {
      console.warn('[electron] Failed to reindex watched path ->', relativePath, error);
    }
  }

  if (isCurrent(token)) {
    publishChanges(changedPaths);
    if (indexState.isLargeUpdate && indexState.status === INDEX_STATUS.indexing) {
      setIndexState({
        status: INDEX_STATUS.ready,
        scannedCount: 0,
        scanTotal: 0,
        isLargeUpdate: false,
      });
    }
    if (fromWatcher) {
      reportDataless(datalessPaths);
    }
  }
}

/** Reindexes some paths right away (after LazyDM changed them), without waiting for the watcher. */
function reindexPaths(relativePaths) {
  const token = activeToken;
  return enqueue(token, () => reindexWatchedPaths(token, [...new Set(relativePaths)]));
}

function flushWatchedPaths() {
  watchTimer = null;
  const relativePaths = [...pendingWatchPaths];
  pendingWatchPaths = new Set();

  if (relativePaths.includes(VAULT_CONFIG_PATH)) {
    broadcastIpcEvent(INDEX_EVENT_CHANNELS.configChanged, {});
  }

  const token = activeToken;
  enqueueDetached(token, () => reindexWatchedPaths(token, relativePaths, { fromWatcher: true }));
}

function startWatcher() {
  const token = activeToken;
  watcher = fs.watch(activeVault.path, { recursive: true }, (_eventType, fileName) => {
    if (!isCurrent(token)) {
      return;
    }

    if (!fileName) {
      enqueueDetached(token, () => runFullReconcile(token));
      return;
    }

    pendingWatchPaths.add(String(fileName).split(path.sep).join('/'));
    globalThis.clearTimeout(watchTimer);
    watchTimer = globalThis.setTimeout(flushWatchedPaths, WATCH_DEBOUNCE_MS);
  });

  watcher.on('error', (error) => {
    console.warn('[electron] Vault watcher error:', error);
    setIndexState({ lastError: error instanceof Error ? error.message : String(error) });
    if (!isCurrent(token)) {
      return;
    }

    // A dead watcher would miss every later external edit: start a new one, then catch up on what was missed.
    stopWatcher();
    try {
      startWatcher();
      enqueueDetached(token, () => runFullReconcile(token));
    } catch (restartError) {
      console.error('[electron] Vault watcher could not restart:', restartError);
    }
  });
}

function stopWatcher() {
  globalThis.clearTimeout(watchTimer);
  watchTimer = null;
  pendingWatchPaths = new Set();

  if (watcher) {
    watcher.close();
    watcher = null;
  }
}

/** Opens the index of a vault, starts watching its folder and reconciles it with the files on disk. */
function start(vault, { onDataless = null } = {}) {
  if (!vault || typeof vault.id !== 'string' || typeof vault.path !== 'string') {
    throw new Error('vault must have an id and a path.');
  }

  if (activeVault?.id === vault.id && activeVault.path === vault.path) {
    return getStatus();
  }

  stop();
  datalessHandler = onDataless;
  openVaultIndexDatabase(vault.id);
  activeVault = { id: vault.id, path: vault.path };
  activeToken += 1;

  const token = activeToken;
  startWatcher();
  enqueueDetached(token, () => runFullReconcile(token));

  return getStatus();
}

function stop() {
  if (!activeVault) {
    return;
  }

  activeToken += 1;
  activeVault = null;
  datalessHandler = null;
  recentlyIndexed.clear();
  stopWatcher();
  closeVaultIndexDatabase();
  indexState = { ...INDEX_STATE_DEFAULTS };
}

/** Drops the whole index of the current vault and builds it again from the files. */
function rebuild() {
  if (!activeVault) {
    throw new Error('No vault is open.');
  }

  const token = activeToken;
  enqueueDetached(token, async () => {
    vaultIndexModel.deleteAll();
    await runFullReconcile(token, { forceBlocking: true });
  });

  return getStatus();
}

module.exports = {
  getStatus,
  isOpen,
  rebuild,
  reindexPaths,
  start,
  stop,
};
