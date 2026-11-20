const fs = require('node:fs');
const zlib = require('node:zlib');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { promisify } = require('node:util');
const yauzl = require('yauzl');
const { ZIP_LIMITS } = require('./zip-limits');
const { ZIP_PATH_ERRORS, ZipPathError, safeEntryPath } = require('./zip-paths');

/** Why a zip is refused as a whole. The UI turns each code into a plain sentence in the user's language. */
const ZIP_REFUSALS = Object.freeze({
  notAZip: 'not-a-zip',
  tooLargeFile: 'too-large-file',
  tooManyEntries: 'too-many-entries',
  tooManyBytes: 'too-many-bytes',
  ratio: 'ratio',
  encrypted: 'encrypted',
  unsupportedCompression: 'unsupported-compression',
  specialFile: 'special-file',
  unsafePath: 'unsafe-path',
  duplicate: 'duplicate',
  corrupt: 'corrupt',
  empty: 'empty',
  noFolder: 'no-folder',
  multipleFolders: 'multiple-folders',
  newerVersion: 'newer-version',
});

const REFUSAL_MESSAGES = Object.freeze({
  [ZIP_REFUSALS.notAZip]: 'This file is not a zip LazyDM can read.',
  [ZIP_REFUSALS.tooLargeFile]: 'The zip file is too large.',
  [ZIP_REFUSALS.tooManyEntries]: 'The zip holds too many files.',
  [ZIP_REFUSALS.tooManyBytes]: 'The zip is too large once unpacked.',
  [ZIP_REFUSALS.ratio]: 'The zip is packed in a suspicious way and was refused.',
  [ZIP_REFUSALS.encrypted]: 'The zip is protected by a password.',
  [ZIP_REFUSALS.unsupportedCompression]: 'The zip uses a compression method LazyDM cannot read.',
  [ZIP_REFUSALS.specialFile]: 'The zip contains links or special files.',
  [ZIP_REFUSALS.unsafePath]: 'The zip contains a file name that is not allowed.',
  [ZIP_REFUSALS.duplicate]: 'The zip contains the same file name twice.',
  [ZIP_REFUSALS.corrupt]: 'The zip is damaged.',
  [ZIP_REFUSALS.empty]: 'The zip is empty.',
  [ZIP_REFUSALS.noFolder]: 'The zip must hold one campaign folder.',
  [ZIP_REFUSALS.multipleFolders]: 'The zip holds more than one folder.',
  [ZIP_REFUSALS.newerVersion]: 'The zip was made by a newer version of LazyDM.',
});

class ZipRefusedError extends Error {
  constructor(code, options) {
    super(REFUSAL_MESSAGES[code] ?? 'The zip was refused.', options);
    this.name = 'ZipRefusedError';
    this.code = code;
  }
}

const COMPRESSION_STORED = 0;
const COMPRESSION_DEFLATED = 8;
const ENCRYPTED_FLAG = 0x1;
/** Host systems whose `externalFileAttributes` hold a Unix mode: Unix (3) and macOS (19). */
const UNIX_HOSTS = new Set([3, 19]);
const MODE_TYPE_MASK = 0o170000;
const MODE_REGULAR = 0o100000;
const MODE_DIRECTORY = 0o040000;

/** A path with one of these problems is an attack, not a mistake: the whole zip is refused. */
const HOSTILE_PATH_CODES = new Set([
  ZIP_PATH_ERRORS.empty,
  ZIP_PATH_ERRORS.nul,
  ZIP_PATH_ERRORS.control,
  ZIP_PATH_ERRORS.absolute,
  ZIP_PATH_ERRORS.drive,
  ZIP_PATH_ERRORS.backslash,
  ZIP_PATH_ERRORS.traversal,
]);

/** What `yauzl` says when it refuses a name itself (it runs before our own check). */
const YAUZL_PATH_MESSAGE = /invalid relative path|absolute path|invalid characters in fileName/;

/** Why an entry is not taken but does not spoil the zip (`hidden` ones are not even mentioned). */
const ENTRY_SKIPS = Object.freeze({
  hidden: 'hidden',
  name: 'name',
});

function toRefusal(error) {
  if (error instanceof ZipRefusedError) {
    return error;
  }

  const code = YAUZL_PATH_MESSAGE.test(String(error?.message))
    ? ZIP_REFUSALS.unsafePath
    : ZIP_REFUSALS.notAZip;
  return new ZipRefusedError(code, { cause: error });
}

/** `file`, `directory` or `special` (a link, a device, a pipe…) from the Unix mode a zip may carry. */
function kindOfMode(entry) {
  if (!UNIX_HOSTS.has(entry.versionMadeBy >>> 8)) {
    return 'file';
  }

  const type = (entry.externalFileAttributes >>> 16) & 0xffff & MODE_TYPE_MASK;
  if (type === 0 || type === MODE_REGULAR) {
    return 'file';
  }

  return type === MODE_DIRECTORY ? 'directory' : 'special';
}

/** The key two names are the same file by on any computer: Unicode-normalised and without case. */
function duplicateKey(name) {
  return name.normalize('NFC').toLowerCase();
}

/**
 * One entry of the central directory, checked. Throws a `ZipRefusedError` for what makes the whole zip unsafe
 * (encryption, a link or special file, an attack path, an unknown compression, a packing ratio no real campaign
 * has). An entry that is only unwelcome (hidden, a name Windows cannot create, a path too long) is described with
 * `skipReason` so the caller can leave it out.
 */
function describeEntry(entry, limits) {
  if ((entry.generalPurposeBitFlag & ENCRYPTED_FLAG) !== 0) {
    throw new ZipRefusedError(ZIP_REFUSALS.encrypted);
  }

  const isDirectory = entry.fileName.endsWith('/');
  if (kindOfMode(entry) === 'special') {
    throw new ZipRefusedError(ZIP_REFUSALS.specialFile);
  }
  if (
    !isDirectory &&
    entry.compressionMethod !== COMPRESSION_STORED &&
    entry.compressionMethod !== COMPRESSION_DEFLATED
  ) {
    throw new ZipRefusedError(ZIP_REFUSALS.unsupportedCompression);
  }

  const described = {
    name: entry.fileName,
    isDirectory,
    skipReason: null,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize,
    crc32: entry.crc32,
    raw: entry,
  };

  try {
    described.name = safeEntryPath(entry.fileName);
  } catch (error) {
    if (!(error instanceof ZipPathError) || HOSTILE_PATH_CODES.has(error.code)) {
      throw new ZipRefusedError(ZIP_REFUSALS.unsafePath, { cause: error });
    }

    described.skipReason =
      error.code === ZIP_PATH_ERRORS.hidden ? ENTRY_SKIPS.hidden : ENTRY_SKIPS.name;
    described.name = entry.fileName.replace(/\/$/, '');
  }

  if (
    !isDirectory &&
    entry.uncompressedSize >= limits.ratioFloorBytes &&
    entry.uncompressedSize > entry.compressedSize * limits.maxCompressionRatio
  ) {
    throw new ZipRefusedError(ZIP_REFUSALS.ratio);
  }

  return described;
}

/** Walks the central directory, one entry at a time (lazy), checking each; nothing is decompressed. */
function readCentralDirectory(zip, limits, zipBytes) {
  return new Promise((resolve, reject) => {
    const entries = [];
    const names = new Set();
    let totalBytes = 0;

    zip.on('error', reject);
    zip.on('end', () => {
      if (entries.length === 0) {
        reject(new ZipRefusedError(ZIP_REFUSALS.empty));
      } else if (
        totalBytes >= limits.ratioFloorBytes &&
        totalBytes > zipBytes * limits.maxCompressionRatio
      ) {
        reject(new ZipRefusedError(ZIP_REFUSALS.ratio));
      } else {
        resolve(entries);
      }
    });
    zip.on('entry', (entry) => {
      try {
        const described = describeEntry(entry, limits);
        if (!described.isDirectory) {
          const key = duplicateKey(described.name);
          if (names.has(key)) {
            throw new ZipRefusedError(ZIP_REFUSALS.duplicate);
          }

          names.add(key);
          totalBytes += described.uncompressedSize;
          if (totalBytes > limits.maxTotalBytes) {
            throw new ZipRefusedError(ZIP_REFUSALS.tooManyBytes);
          }
        }

        entries.push(described);
        zip.readEntry();
      } catch (error) {
        reject(error);
      }
    });
    zip.readEntry();
  });
}

/**
 * Opens a zip and checks everything the central directory tells, without decompressing a byte: the file is a plain
 * file of a sane size, the entry count and the declared sizes are within the caps, no entry is encrypted, a link or
 * a special file, no path is an attack, no name appears twice, and no entry or archive is packed at a ratio no real
 * campaign has. Declared sizes are only a first filter: `readEntryBuffer` / `openEntryStream` count the bytes that
 * really come out and check them against the entry and the budget.
 *
 * Returns `{ zip, entries, fileBytes, close }`; the caller must `close()` it. Throws a `ZipRefusedError`.
 */
async function openZip(zipPath, limits = ZIP_LIMITS) {
  const stat = await fs.promises.lstat(zipPath).catch(() => null);
  if (!stat || !stat.isFile()) {
    throw new ZipRefusedError(ZIP_REFUSALS.notAZip);
  }
  if (stat.size > limits.maxZipBytes) {
    throw new ZipRefusedError(ZIP_REFUSALS.tooLargeFile);
  }

  let zip;
  try {
    zip = await promisify(yauzl.open)(zipPath, {
      lazyEntries: true,
      autoClose: false,
      decodeStrings: true,
      validateEntrySizes: true,
      strictFileNames: true,
    });
  } catch (error) {
    throw toRefusal(error);
  }

  try {
    if (zip.entryCount > limits.maxEntries) {
      throw new ZipRefusedError(ZIP_REFUSALS.tooManyEntries);
    }

    const entries = await readCentralDirectory(zip, limits, stat.size);
    return { zip, entries, fileBytes: stat.size, close: () => zip.close() };
  } catch (error) {
    zip.close();
    throw toRefusal(error);
  }
}

/**
 * Counts what really comes out of an entry: more than `maxBytes` (or than the shared `budget` has left) stops it,
 * and at the end the size and the CRC-32 must be what the central directory said.
 */
function createEntryGuard(descriptor, { maxBytes, budget }) {
  let bytes = 0;
  let crc = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      crc = zlib.crc32(chunk, crc);
      if (bytes > maxBytes) {
        callback(new ZipRefusedError(ZIP_REFUSALS.corrupt));
      } else if (budget && (budget.remaining -= chunk.length) < 0) {
        callback(new ZipRefusedError(ZIP_REFUSALS.tooManyBytes));
      } else {
        callback(null, chunk);
      }
    },
    flush(callback) {
      callback(
        bytes === descriptor.uncompressedSize && crc >>> 0 === descriptor.crc32
          ? null
          : new ZipRefusedError(ZIP_REFUSALS.corrupt),
      );
    },
  });
}

/**
 * The unpacked bytes of an entry as a readable stream that errors (`ZipRefusedError`) when the entry is bigger
 * than `maxBytes`, when the zip's shared `budget` (`{ remaining }`, bytes) runs out, or when the size or CRC-32 is
 * not the declared one. Use it with `stream.pipeline` so a failure destroys both ends.
 */
async function openEntryStream(archive, descriptor, { maxBytes, budget } = {}) {
  const cap = Math.min(maxBytes ?? Infinity, descriptor.uncompressedSize);
  let source;
  try {
    source = await promisify(archive.zip.openReadStream.bind(archive.zip))(descriptor.raw);
  } catch (error) {
    throw toRefusal(error);
  }

  const guard = createEntryGuard(descriptor, { maxBytes: cap, budget });
  source.on('error', (error) => guard.destroy(toRefusal(error)));
  return source.pipe(guard);
}

/** The whole entry in memory, for the small ones (notes, JSON). Same limits as `openEntryStream`. */
async function readEntryBuffer(archive, descriptor, options = {}) {
  const stream = await openEntryStream(archive, descriptor, options);
  const chunks = [];
  try {
    await pipeline(stream, async (chunkIterable) => {
      for await (const chunk of chunkIterable) {
        chunks.push(chunk);
      }
    });
  } catch (error) {
    throw toRefusal(error);
  }

  return Buffer.concat(chunks);
}

module.exports = {
  ENTRY_SKIPS,
  ZIP_REFUSALS,
  ZipRefusedError,
  openEntryStream,
  openZip,
  readEntryBuffer,
};
