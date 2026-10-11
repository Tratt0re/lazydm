const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { closeVaultIndexDatabase, openVaultIndexDatabase } = require('../database/vault-index-db');
const { vaultIndexModel, vaultModel } = require('../models');
const { broadcastIpcEvent } = require('../ipc/broadcast');
const { resolveInsideVault } = require('../utils/file-utils');
const { parseMarkdownDocument } = require('../utils/markdown-parse');

const WATCH_DEBOUNCE_MS = 300;
const INDEX_STATUS = Object.freeze({
  idle: 'idle',
  indexing: 'indexing',
  ready: 'ready',
  error: 'error',
});
const INDEX_EVENT_CHANNELS = Object.freeze({
  statusChanged: 'index:statusChanged',
  updated: 'index:updated',
});
const INDEX_STATE_DEFAULTS = Object.freeze({
  status: INDEX_STATUS.idle,
  vaultId: null,
  fileCount: 0,
  lastIndexedAtMs: null,
  lastError: null,
});

let indexState = { ...INDEX_STATE_DEFAULTS };
let activeVault = null;
let activeToken = 0;
let watcher = null;
let watchTimer = null;
let pendingWatchPaths = new Set();
let taskQueue = Promise.resolve();

function getStatus() {
  return { ...indexState };
}

function setIndexState(changes) {
  indexState = { ...indexState, ...changes };
  broadcastIpcEvent(INDEX_EVENT_CHANNELS.statusChanged, getStatus());
}

function isCurrent(token) {
  return activeVault !== null && token === activeToken;
}

/** Index work runs one task at a time; a task started for a vault that was closed meanwhile does nothing. */
function enqueue(token, task) {
  taskQueue = taskQueue
    .then(() => (isCurrent(token) ? task() : undefined))
    .catch((error) => {
      if (!isCurrent(token)) {
        return;
      }

      console.error('[electron] Vault index task failed:', error);
      setIndexState({ status: INDEX_STATUS.error, lastError: error instanceof Error ? error.message : String(error) });
    });

  return taskQueue;
}

function hashContent(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function isFileChanged(file, knownState) {
  return !knownState || knownState.size !== file.size || knownState.mtime_ms !== file.mtimeMs;
}

async function indexFile(rootPath, file, knownState) {
  if (vaultIndexModel.getFileKind(file.path) !== 'md') {
    vaultIndexModel.saveFile(file);
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

  vaultIndexModel.saveFile({ ...file, contentHash }, document);
}

/** Brings the index in line with the files on disk: indexes new or changed files and drops deleted ones. */
async function reconcile(token, rootPath, relativeDir = '') {
  const knownStates = vaultIndexModel.listFileStates();
  const files = await vaultModel.listVaultFiles(rootPath, relativeDir);
  const folderPrefix = relativeDir ? `${relativeDir}/` : '';
  const seenPaths = new Set();
  const changedPaths = [];

  for (const file of files) {
    if (!isCurrent(token)) {
      return changedPaths;
    }

    seenPaths.add(file.path);
    const knownState = knownStates.get(file.path);
    if (!isFileChanged(file, knownState)) {
      continue;
    }

    try {
      await indexFile(rootPath, file, knownState);
      changedPaths.push(file.path);
    } catch (error) {
      console.warn('[electron] Failed to index file ->', file.path, error);
    }
  }

  for (const knownPath of knownStates.keys()) {
    if (knownPath.startsWith(folderPrefix) && !seenPaths.has(knownPath)) {
      vaultIndexModel.deletePath(knownPath);
      changedPaths.push(knownPath);
    }
  }

  return changedPaths;
}

function publishChanges(changedPaths) {
  if (changedPaths.length === 0) {
    return;
  }

  vaultIndexModel.resolveLinks();
  setIndexState({ fileCount: vaultIndexModel.countFiles(), lastIndexedAtMs: Date.now() });
  broadcastIpcEvent(INDEX_EVENT_CHANNELS.updated, { paths: changedPaths });
}

async function runFullReconcile(token) {
  setIndexState({ status: INDEX_STATUS.indexing, vaultId: activeVault.id, lastError: null });

  const changedPaths = await reconcile(token, activeVault.path);
  if (!isCurrent(token)) {
    return;
  }

  publishChanges(changedPaths);
  setIndexState({
    status: INDEX_STATUS.ready,
    fileCount: vaultIndexModel.countFiles(),
    lastIndexedAtMs: Date.now(),
  });
}

async function reindexWatchedPaths(token, relativePaths) {
  const rootPath = activeVault.path;
  const changedPaths = [];

  for (const relativePath of relativePaths) {
    if (!isCurrent(token)) {
      return;
    }

    if (vaultModel.isIgnoredVaultPath(relativePath)) {
      continue;
    }

    try {
      const stats = await fs.promises.stat(resolveInsideVault(rootPath, relativePath)).catch(() => null);

      if (!stats) {
        if (vaultIndexModel.deletePath(relativePath) > 0) {
          changedPaths.push(relativePath);
        }
      } else if (stats.isDirectory()) {
        changedPaths.push(...(await reconcile(token, rootPath, relativePath)));
      } else if (stats.isFile()) {
        const file = { path: relativePath, size: stats.size, mtimeMs: Math.trunc(stats.mtimeMs) };
        const knownState = vaultIndexModel.getFileState(relativePath);
        if (isFileChanged(file, knownState)) {
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
  }
}

function flushWatchedPaths() {
  watchTimer = null;
  const relativePaths = [...pendingWatchPaths];
  pendingWatchPaths = new Set();

  const token = activeToken;
  enqueue(token, () => reindexWatchedPaths(token, relativePaths));
}

function startWatcher() {
  const token = activeToken;
  watcher = fs.watch(activeVault.path, { recursive: true }, (_eventType, fileName) => {
    if (!isCurrent(token)) {
      return;
    }

    if (!fileName) {
      enqueue(token, () => runFullReconcile(token));
      return;
    }

    pendingWatchPaths.add(String(fileName).split(path.sep).join('/'));
    globalThis.clearTimeout(watchTimer);
    watchTimer = globalThis.setTimeout(flushWatchedPaths, WATCH_DEBOUNCE_MS);
  });

  watcher.on('error', (error) => {
    console.warn('[electron] Vault watcher error:', error);
    setIndexState({ lastError: error instanceof Error ? error.message : String(error) });
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
function start(vault) {
  if (!vault || typeof vault.id !== 'string' || typeof vault.path !== 'string') {
    throw new Error('vault must have an id and a path.');
  }

  if (activeVault?.id === vault.id && activeVault.path === vault.path) {
    return getStatus();
  }

  stop();
  openVaultIndexDatabase(vault.id);
  activeVault = { id: vault.id, path: vault.path };
  activeToken += 1;

  const token = activeToken;
  startWatcher();
  enqueue(token, () => runFullReconcile(token));

  return getStatus();
}

function stop() {
  if (!activeVault) {
    return;
  }

  activeToken += 1;
  activeVault = null;
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
  enqueue(token, async () => {
    vaultIndexModel.deleteAll();
    await runFullReconcile(token);
  });

  return getStatus();
}

module.exports = {
  getStatus,
  rebuild,
  start,
  stop,
};
