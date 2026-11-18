const { ZIP_LIMITS } = require('./zip-limits');

/** Why an entry's path was refused; the importer reports it as a plain sentence. */
const ZIP_PATH_ERRORS = Object.freeze({
  empty: 'empty',
  nul: 'nul',
  absolute: 'absolute',
  drive: 'drive',
  backslash: 'backslash',
  traversal: 'traversal',
  hidden: 'hidden',
  reserved: 'reserved',
  tooLong: 'too-long',
  tooDeep: 'too-deep',
  control: 'control',
});

class ZipPathError extends Error {
  constructor(code, entryName) {
    super(`Refused zip entry (${code}).`);
    this.name = 'ZipPathError';
    this.code = code;
    this.entryName = entryName;
  }
}

/** Names Windows will not create as files, with or without an extension (`con.txt` is `con`). */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
/** Characters Windows rejects in a file name; a zip written on another system may carry them. */
const WINDOWS_FORBIDDEN = /[<>:"|?*]/;

/**
 * The relative path of a zip entry in `/` form, or a `ZipPathError`. Pure: no disk access. The checks are the same
 * on every platform, so a zip that is refused on one computer is refused on all of them.
 *
 * Refused: empty names, NUL and other control characters, absolute paths (`/etc`), drive letters, backslashes (a
 * Windows-made zip is not a valid one), any `..` or `.` segment, empty segments (`a//b`), hidden segments (`.git`,
 * `.DS_Store`), Windows reserved names and forbidden characters, trailing dots or spaces, and paths longer or
 * deeper than the limits. A trailing `/` (a folder entry) is allowed and dropped.
 */
function safeEntryPath(entryName) {
  if (typeof entryName !== 'string' || entryName.length === 0) {
    throw new ZipPathError(ZIP_PATH_ERRORS.empty, entryName);
  }
  if (entryName.includes('\u0000')) {
    throw new ZipPathError(ZIP_PATH_ERRORS.nul, entryName);
  }
  if (CONTROL_CHARACTERS.test(entryName)) {
    throw new ZipPathError(ZIP_PATH_ERRORS.control, entryName);
  }
  if (entryName.includes('\\')) {
    throw new ZipPathError(ZIP_PATH_ERRORS.backslash, entryName);
  }
  if (entryName.startsWith('/')) {
    throw new ZipPathError(ZIP_PATH_ERRORS.absolute, entryName);
  }
  if (/^[a-zA-Z]:/.test(entryName)) {
    throw new ZipPathError(ZIP_PATH_ERRORS.drive, entryName);
  }
  if (entryName.length > ZIP_LIMITS.maxPathLength) {
    throw new ZipPathError(ZIP_PATH_ERRORS.tooLong, entryName);
  }

  const segments = entryName.endsWith('/')
    ? entryName.slice(0, -1).split('/')
    : entryName.split('/');
  if (segments.length > ZIP_LIMITS.maxDepth) {
    throw new ZipPathError(ZIP_PATH_ERRORS.tooDeep, entryName);
  }

  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw new ZipPathError(ZIP_PATH_ERRORS.traversal, entryName);
    }
    if (segment.startsWith('.')) {
      throw new ZipPathError(ZIP_PATH_ERRORS.hidden, entryName);
    }
    if (
      segment.endsWith('.') ||
      segment.endsWith(' ') ||
      WINDOWS_FORBIDDEN.test(segment) ||
      WINDOWS_RESERVED.test(segment.split('.')[0])
    ) {
      throw new ZipPathError(ZIP_PATH_ERRORS.reserved, entryName);
    }
  }

  return segments.join('/');
}

module.exports = { ZIP_PATH_ERRORS, ZipPathError, safeEntryPath };
