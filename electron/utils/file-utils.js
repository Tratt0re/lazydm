const fs = require('node:fs');
const path = require('node:path');

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
  const resolvedPath = resolveRealPathOfNearestExisting(path.resolve(realRootPath, relativePath.trim()));
  const pathFromRoot = path.relative(realRootPath, resolvedPath);

  if (pathFromRoot === '..' || pathFromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(pathFromRoot)) {
    throw new Error(`Path escapes the vault root: ${relativePath}`);
  }

  return resolvedPath;
}

function safeWriteFileAtomic(filePath, content) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new Error('filePath must be a non-empty string.');
  }

  if (!Buffer.isBuffer(content) && typeof content !== 'string') {
    throw new Error('content must be a string or Buffer.');
  }

  const normalizedPath = filePath.trim();
  const directoryPath = path.dirname(normalizedPath);
  fs.mkdirSync(directoryPath, { recursive: true });

  const temporaryPath = `${normalizedPath}.tmp-${process.pid}-${Date.now()}`;

  try {
    fs.writeFileSync(temporaryPath, content);
    fs.renameSync(temporaryPath, normalizedPath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) {
      fs.unlinkSync(temporaryPath);
    }

    throw error;
  }

  return normalizedPath;
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

module.exports = {
  assertExistingDirectory,
  assertReadableDirectory,
  assertWritableDirectory,
  formatTimestampForFilename,
  listFilesSortedByMtime,
  resolveInsideVault,
  safeWriteFileAtomic,
};
