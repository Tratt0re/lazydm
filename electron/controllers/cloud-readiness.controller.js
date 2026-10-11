const path = require('node:path');
const { cloudReadinessModel, vaultModel } = require('../models');
const { broadcastIpcEvent } = require('../ipc/broadcast');

const DOWNLOAD_CONCURRENCY = 4;
const DOWNLOAD_TIMEOUT_MS = 30 * 1000;
const READINESS_TIMEOUT_MS = 2 * 60 * 1000;
const PENDING_PATHS_PREVIEW_LIMIT = 10;
const MARKDOWN_EXTENSION = '.md';
const CLOUD_STATUS = Object.freeze({
  idle: 'idle',
  checking: 'checking',
  downloading: 'downloading',
  ready: 'ready',
  timeout: 'timeout',
  skipped: 'skipped',
  error: 'error',
});
const CLOUD_EVENT_CHANNELS = Object.freeze({
  statusChanged: 'cloud:statusChanged',
});
const CLOUD_STATE_DEFAULTS = Object.freeze({
  status: CLOUD_STATUS.idle,
  vaultId: null,
  provider: null,
  totalFiles: 0,
  pendingFiles: 0,
  pendingPaths: [],
  conflictPaths: [],
  lastCheckedAtMs: null,
  lastError: null,
});

let cloudState = { ...CLOUD_STATE_DEFAULTS };
let activeVault = null;
let activeToken = 0;
let releaseWait = null;

function getStatus() {
  return { ...cloudState, pendingPaths: [...cloudState.pendingPaths], conflictPaths: [...cloudState.conflictPaths] };
}

function setCloudState(changes) {
  cloudState = { ...cloudState, ...changes };
  broadcastIpcEvent(CLOUD_EVENT_CHANNELS.statusChanged, getStatus());
}

function isCurrent(token) {
  return activeVault !== null && token === activeToken;
}

function isMarkdownPath(relativePath) {
  return path.posix.extname(relativePath).toLocaleLowerCase() === MARKDOWN_EXTENSION;
}

function delay(ms, value) {
  return new Promise((resolve) => {
    globalThis.setTimeout(() => resolve(value), ms);
  });
}

function publishPending(token, remainingPaths) {
  if (!isCurrent(token)) {
    return;
  }

  const changes = {
    pendingFiles: remainingPaths.size,
    pendingPaths: [...remainingPaths].slice(0, PENDING_PATHS_PREVIEW_LIMIT),
  };

  // Downloads continue after a timeout or a skip: report the vault as ready once the last note arrives.
  if (remainingPaths.size === 0 && cloudState.status !== CLOUD_STATUS.downloading) {
    changes.status = CLOUD_STATUS.ready;
  }

  setCloudState(changes);
}

/** Downloads the pending notes a few at a time; resolves with 'done' or 'timeout' (some could not be fetched). */
async function downloadPendingNotes(token, rootPath, pendingPaths) {
  const remainingPaths = new Set(pendingPaths);
  const queue = [...pendingPaths];

  async function worker() {
    while (queue.length > 0 && isCurrent(token)) {
      const relativePath = queue.shift();
      try {
        await cloudReadinessModel.requestDownload(rootPath, relativePath, DOWNLOAD_TIMEOUT_MS);
        if (!(await cloudReadinessModel.isStillDataless(rootPath, relativePath))) {
          remainingPaths.delete(relativePath);
        }
      } catch (error) {
        console.warn('[electron] Cloud download failed ->', relativePath, error instanceof Error ? error.message : error);
      }

      publishPending(token, remainingPaths);
    }
  }

  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, queue.length) }, () => worker()));
  return remainingPaths.size === 0 ? 'done' : CLOUD_STATUS.timeout;
}

/**
 * Makes sure the notes of a vault stored in a cloud folder are on disk before it is indexed.
 * Resolves (never rejects) when every note is local, when the wait times out or when the user skips it.
 */
async function prepare(vault) {
  activeToken += 1;
  activeVault = vault;
  const token = activeToken;
  releaseWait?.();

  setCloudState({
    ...CLOUD_STATE_DEFAULTS,
    status: CLOUD_STATUS.checking,
    vaultId: vault.id,
    provider: cloudReadinessModel.detectCloudProvider(vault.path),
  });

  try {
    const files = await vaultModel.listVaultFiles(vault.path);
    if (!isCurrent(token)) {
      return getStatus();
    }

    const pendingPaths = files.filter((file) => file.isDataless && isMarkdownPath(file.path)).map((file) => file.path);
    setCloudState({
      totalFiles: files.length,
      pendingFiles: pendingPaths.length,
      pendingPaths: pendingPaths.slice(0, PENDING_PATHS_PREVIEW_LIMIT),
      conflictPaths: cloudReadinessModel.findConflictCopies(files),
    });

    if (pendingPaths.length === 0) {
      setCloudState({ status: CLOUD_STATUS.ready, lastCheckedAtMs: Date.now() });
      return getStatus();
    }

    setCloudState({ status: CLOUD_STATUS.downloading });
    const outcome = await Promise.race([
      downloadPendingNotes(token, vault.path, pendingPaths),
      delay(READINESS_TIMEOUT_MS, CLOUD_STATUS.timeout),
      new Promise((resolve) => {
        releaseWait = () => resolve(CLOUD_STATUS.skipped);
      }),
    ]);

    releaseWait = null;
    if (isCurrent(token)) {
      setCloudState({
        status: outcome === 'done' ? CLOUD_STATUS.ready : outcome,
        lastCheckedAtMs: Date.now(),
      });
    }
  } catch (error) {
    if (isCurrent(token)) {
      console.error('[electron] Cloud readiness check failed:', error);
      setCloudState({ status: CLOUD_STATUS.error, lastError: error instanceof Error ? error.message : String(error) });
    }
  }

  return getStatus();
}

/** Stops waiting for downloads (they keep going in the background) so the vault can be used right away. */
function skipWait() {
  releaseWait?.();
  return getStatus();
}

function recheck() {
  if (!activeVault) {
    throw new Error('No vault is open.');
  }

  void prepare(activeVault);
  return getStatus();
}

function cancel() {
  activeToken += 1;
  activeVault = null;
  releaseWait?.();
  releaseWait = null;
  cloudState = { ...CLOUD_STATE_DEFAULTS };
}

module.exports = {
  cancel,
  getStatus,
  prepare,
  recheck,
  skipWait,
};
