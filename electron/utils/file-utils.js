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
  formatTimestampForFilename,
  listFilesSortedByMtime,
  safeWriteFileAtomic,
};
