/**
 * Caps for reading and writing a campaign zip (design-principles §6g). A zip comes from someone else, so every
 * limit is checked against the bytes really read, never against the sizes the zip declares. They sit near the
 * limits of the MCP folder import (`electron/mcp/importer.js`) so the two stay comparable.
 */
const ZIP_LIMITS = Object.freeze({
  /** Entries in the archive, folders included. */
  maxEntries: 20000,
  /** Uncompressed bytes of all the entries together. */
  maxTotalBytes: 1024 * 1024 * 1024,
  /** Uncompressed bytes of one media file. */
  maxMediaBytes: 200 * 1024 * 1024,
  /** Uncompressed bytes of one note, encounter, map or manifest. */
  maxTextBytes: 2 * 1024 * 1024,
  /** Uncompressed over compressed size, for the archive as a whole and for each entry. */
  maxCompressionRatio: 100,
  /** The ratio is only checked above this many uncompressed bytes (a tiny note can pack tightly). */
  ratioFloorBytes: 1024 * 1024,
  /** Folders deep, counting the campaign folder. */
  maxDepth: 12,
  /** Characters of an entry's path. */
  maxPathLength: 240,
  /** Bytes of the zip file itself. */
  maxZipBytes: 1024 * 1024 * 1024,
});

module.exports = { ZIP_LIMITS };
