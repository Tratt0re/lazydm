const fs = require('node:fs');
const path = require('node:path');
const { resolveInsideVault } = require('../utils/file-utils');
const { isDatalessStats } = require('./vault.model');

const CLOUD_PROVIDER = Object.freeze({
  icloud: 'icloud',
  box: 'box',
  dropbox: 'dropbox',
  onedrive: 'onedrive',
  googleDrive: 'google-drive',
});

/** macOS File Provider roots (`~/Library/CloudStorage/<Provider>-<account>`) and the folder names used on Windows/Linux. */
const CLOUD_STORAGE_PREFIXES = Object.freeze([
  ['box', CLOUD_PROVIDER.box],
  ['dropbox', CLOUD_PROVIDER.dropbox],
  ['onedrive', CLOUD_PROVIDER.onedrive],
  ['googledrive', CLOUD_PROVIDER.googleDrive],
]);
const CLOUD_FOLDER_NAMES = Object.freeze({
  icloud: CLOUD_PROVIDER.icloud,
  iclouddrive: CLOUD_PROVIDER.icloud,
  box: CLOUD_PROVIDER.box,
  'box drive': CLOUD_PROVIDER.box,
  dropbox: CLOUD_PROVIDER.dropbox,
  onedrive: CLOUD_PROVIDER.onedrive,
  'google drive': CLOUD_PROVIDER.googleDrive,
  'my drive': CLOUD_PROVIDER.googleDrive,
});

/**
 * Conflict copies made by sync clients, e.g. `goblin (conflicted copy 2026-10-11).md` (Dropbox),
 * `goblin 2.md` (iCloud), `goblin (1).md` (Google Drive / Box), `goblin-DESKTOP-AB12.md` (OneDrive).
 * The numbered forms only count when the original file exists next to the copy.
 */
const CONFLICT_COPY_PATTERNS = Object.freeze([
  { pattern: /^(.+?) \([^)]*conflict[^)]*\)$/i, requiresOriginal: false },
  { pattern: /^(.+?) \(\d+\)$/, requiresOriginal: true },
  { pattern: /^(.+?) \d+$/, requiresOriginal: true },
  { pattern: /^(.+?)-[A-Z0-9][A-Z0-9-]{2,}$/, requiresOriginal: true },
]);

function detectCloudProvider(rootPath) {
  const lowerSegments = path
    .resolve(rootPath)
    .split(path.sep)
    .filter(Boolean)
    .map((segment) => segment.toLocaleLowerCase());

  const mobileDocumentsIndex = lowerSegments.indexOf('mobile documents');
  if (mobileDocumentsIndex > 0 && lowerSegments[mobileDocumentsIndex - 1] === 'library') {
    return CLOUD_PROVIDER.icloud;
  }

  const cloudStorageIndex = lowerSegments.indexOf('cloudstorage');
  if (cloudStorageIndex > 0 && lowerSegments[cloudStorageIndex + 1]) {
    const storageName = lowerSegments[cloudStorageIndex + 1].replace(/[^a-z]/g, '');
    const match = CLOUD_STORAGE_PREFIXES.find(([prefix]) => storageName.startsWith(prefix));
    if (match) {
      return match[1];
    }
  }

  const folderName = lowerSegments
    .map((segment) => segment.replace(/\s*-.*$/, ''))
    .find((segment) => CLOUD_FOLDER_NAMES[segment]);
  return folderName ? CLOUD_FOLDER_NAMES[folderName] : null;
}

/**
 * Asks the sync client to download a placeholder. Cloud File Providers fetch a file as soon as it is
 * read, so reading its first byte is enough; the returned promise settles when the content is local.
 */
async function requestDownload(rootPath, relativePath, timeoutMs) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = globalThis.setTimeout(
      () => reject(new Error(`Download timed out: ${relativePath}`)),
      timeoutMs,
    );
  });

  const read = (async () => {
    const handle = await fs.promises.open(resolveInsideVault(rootPath, relativePath), 'r');
    try {
      await handle.read(Buffer.alloc(1), 0, 1, 0);
    } finally {
      await handle.close();
    }
  })();

  try {
    await Promise.race([read, timeout]);
  } finally {
    globalThis.clearTimeout(timer);
  }
}

async function isStillDataless(rootPath, relativePath) {
  return isDatalessStats(await fs.promises.stat(resolveInsideVault(rootPath, relativePath)));
}

/** @param {{ path: string }[]} files - Vault files as listed by the vault model. */
function findConflictCopies(files) {
  const existingPaths = new Set(files.map((file) => file.path.toLocaleLowerCase()));

  return files
    .filter((file) => {
      const extension = path.posix.extname(file.path);
      const directory = path.posix.dirname(file.path);
      const baseName = path.posix.basename(file.path, extension);

      return CONFLICT_COPY_PATTERNS.some(({ pattern, requiresOriginal }) => {
        const match = baseName.match(pattern);
        if (!match) {
          return false;
        }

        const originalPath = path.posix
          .join(directory, `${match[1]}${extension}`)
          .toLocaleLowerCase();
        return !requiresOriginal || existingPaths.has(originalPath);
      });
    })
    .map((file) => file.path);
}

module.exports = {
  CLOUD_PROVIDER,
  detectCloudProvider,
  findConflictCopies,
  isStillDataless,
  requestDownload,
};
