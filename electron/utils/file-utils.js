const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatTimestampForFilename(unixTimestampMilliseconds = Date.now()) {
  const date = new Date(Number(unixTimestampMilliseconds));
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  const seconds = pad2(date.getSeconds());

  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function assertExistingDirectory(directoryPath, label) {
  if (typeof directoryPath !== 'string' || directoryPath.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  const normalizedDirectoryPath = path.resolve(directoryPath.trim());
  if (!fs.existsSync(normalizedDirectoryPath)) {
    throw new Error(`${label} does not exist: ${normalizedDirectoryPath}`);
  }

  const stats = fs.statSync(normalizedDirectoryPath);
  if (!stats.isDirectory()) {
    throw new Error(`${label} is not a directory: ${normalizedDirectoryPath}`);
  }

  return normalizedDirectoryPath;
}

function assertReadableDirectory(directoryPath, label) {
  const normalizedDirectoryPath = assertExistingDirectory(directoryPath, label);
  fs.accessSync(normalizedDirectoryPath, fs.constants.R_OK);

  return normalizedDirectoryPath;
}

function assertWritableDirectory(directoryPath, label) {
  const normalizedDirectoryPath = assertReadableDirectory(directoryPath, label);
  fs.accessSync(normalizedDirectoryPath, fs.constants.W_OK);

  return normalizedDirectoryPath;
}

function resolveRealPathOfNearestExisting(targetPath) {
  let existingPath = targetPath;
  const missingSegments = [];

  while (!fs.existsSync(existingPath)) {
    const parentPath = path.dirname(existingPath);
    if (parentPath === existingPath) {
      break;
    }

    missingSegments.unshift(path.basename(existingPath));
    existingPath = parentPath;
  }

  return path.join(fs.realpathSync(existingPath), ...missingSegments);
}

function resolveInsideVault(rootPath, relativePath = '') {
  if (typeof rootPath !== 'string' || rootPath.trim().length === 0) {
    throw new Error('rootPath must be a non-empty string.');
  }

  if (typeof relativePath !== 'string') {
    throw new Error('relativePath must be a string.');
  }

  const realRootPath = fs.realpathSync(path.resolve(rootPath.trim()));
  const resolvedPath = resolveRealPathOfNearestExisting(
    path.resolve(realRootPath, relativePath.trim()),
  );
  const pathFromRoot = path.relative(realRootPath, resolvedPath);

  if (
    pathFromRoot === '..' ||
    pathFromRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(pathFromRoot)
  ) {
    throw new Error(`Path escapes the vault root: ${relativePath}`);
  }

  return resolvedPath;
}

/**
 * Moves a file without ever replacing an existing target: a hard link fails with EEXIST where `rename` would
 * silently overwrite (a sync client or Obsidian may create the target between a check and the move). Falls back
 * to an exclusive copy where hard links are unsupported (exFAT, some network shares).
 */
async function moveFileNoOverwrite(fromAbsolutePath, toAbsolutePath) {
  try {
    await fs.promises.link(fromAbsolutePath, toAbsolutePath);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw error;
    }

    await fs.promises.copyFile(fromAbsolutePath, toAbsolutePath, fs.constants.COPYFILE_EXCL);
  }

  await fs.promises.unlink(fromAbsolutePath);
}

/** Sends a vault file or folder to the system Trash (recoverable); electron is loaded lazily so tests can stub it. */
async function trashVaultItem(absolutePath) {
  const { shell } = require('electron');
  await shell.trashItem(absolutePath);
}

/** True when `error` says the target of a no-overwrite operation is already taken. */
function isAlreadyExistsError(error) {
  return error?.code === 'EEXIST';
}

/** Writes via a temporary file; with `overwrite: false` it fails with EEXIST instead of replacing the target. */
function safeWriteFileAtomic(filePath, content, { overwrite = true } = {}) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new Error('filePath must be a non-empty string.');
  }

  if (!Buffer.isBuffer(content) && typeof content !== 'string') {
    throw new Error('content must be a string or Buffer.');
  }

  const normalizedPath = filePath.trim();
  const directoryPath = path.dirname(normalizedPath);
  fs.mkdirSync(directoryPath, { recursive: true });

  const temporaryPath = `${normalizedPath}.tmp-${process.pid}-${Date.now()}-${randomBytes(4).toString('hex')}`;

  try {
    // fsync so a crash or power cut right after the save cannot leave an empty file behind the rename.
    const descriptor = fs.openSync(temporaryPath, 'w');
    try {
      fs.writeFileSync(descriptor, content);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }

    if (overwrite) {
      fs.renameSync(temporaryPath, normalizedPath);
    } else {
      fs.linkSync(temporaryPath, normalizedPath);
      fs.unlinkSync(temporaryPath);
    }
  } catch (error) {
    if (fs.existsSync(temporaryPath)) {
      fs.unlinkSync(temporaryPath);
    }

    throw error;
  }

  return normalizedPath;
}

/**
 * Writes a file in place (open, truncate, write, fsync) with no temporary file and no rename: a sync client such
 * as iCloud sees one file change instead of a new file next to the note, which it may keep as a `name 2.md` copy.
 * Not atomic: callers keep a recovery copy until `verifyFileHash` confirms the result.
 */
function writeFileInPlace(filePath, content) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new Error('filePath must be a non-empty string.');
  }

  if (!Buffer.isBuffer(content) && typeof content !== 'string') {
    throw new Error('content must be a string or Buffer.');
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const descriptor = fs.openSync(filePath, 'w');
  try {
    fs.writeFileSync(descriptor, content);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }

  return filePath;
}

/** True when the file on disk has exactly this hash (reads it back after an in-place write). */
async function verifyFileHash(filePath, expectedHash) {
  return hashContent(await fs.promises.readFile(filePath)) === expectedHash;
}

function listFilesSortedByMtime(directoryPath, options = {}) {
  if (typeof directoryPath !== 'string' || directoryPath.trim().length === 0) {
    throw new Error('directoryPath must be a non-empty string.');
  }

  const normalizedDirectoryPath = directoryPath.trim();
  const prefix = options.prefix;
  const suffix = options.suffix;
  const descending = options.descending !== false;
  const entries = fs.readdirSync(normalizedDirectoryPath, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .filter((entry) => (typeof prefix === 'string' ? entry.name.startsWith(prefix) : true))
    .filter((entry) => (typeof suffix === 'string' ? entry.name.endsWith(suffix) : true))
    .map((entry) => {
      const fullPath = path.join(normalizedDirectoryPath, entry.name);
      const stats = fs.statSync(fullPath);

      return {
        fileName: entry.name,
        fullPath,
        mtimeMs: Number(stats.mtimeMs),
        sizeBytes: Number(stats.size),
      };
    });

  files.sort((left, right) => {
    const mtimeDiff = left.mtimeMs - right.mtimeMs;
    if (mtimeDiff !== 0) {
      return descending ? -mtimeDiff : mtimeDiff;
    }

    return descending
      ? right.fileName.localeCompare(left.fileName)
      : left.fileName.localeCompare(right.fileName);
  });

  return files;
}

/** SHA-256 of a file content; the vault index and the conflict check on save compare these. */
function hashContent(content) {
  return createHash('sha256').update(content).digest('hex');
}

module.exports = {
  assertExistingDirectory,
  assertReadableDirectory,
  assertWritableDirectory,
  formatTimestampForFilename,
  hashContent,
  isAlreadyExistsError,
  listFilesSortedByMtime,
  moveFileNoOverwrite,
  resolveInsideVault,
  safeWriteFileAtomic,
  trashVaultItem,
  verifyFileHash,
  writeFileInPlace,
};
