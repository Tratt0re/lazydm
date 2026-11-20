const fs = require('node:fs');
const zlib = require('node:zlib');

/**
 * A zip writer for tests only. Unlike `yazl` it writes whatever it is told, so a test can build the hostile
 * archives the importer must refuse: path traversal, links, lying sizes, encryption flags, duplicate names.
 *
 * Each entry: `{ name, data, method?, flags?, versionMadeBy?, mode?, declaredUncompressed?, declaredCompressed?,
 * crc? }`. `data` is a Buffer or string (the real content); the `declared*` and `crc` fields override what the
 * central directory says, to build an archive that lies.
 */
function buildZip(entries, { comment = '', entryCountOverride = null } = {}) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data ?? '', 'utf8');
    const method = entry.method ?? 8;
    const packed = method === 8 ? zlib.deflateRawSync(data) : data;
    const crc = entry.crc ?? zlib.crc32(data);
    const flags = (entry.flags ?? 0) | 0x800;
    const compressedSize = entry.declaredCompressed ?? packed.length;
    const uncompressedSize = entry.declaredUncompressed ?? data.length;
    const versionMadeBy = entry.versionMadeBy ?? (3 << 8) | 20;
    const mode = entry.mode ?? 0o100644;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(compressedSize >>> 0, 18);
    local.writeUInt32LE(uncompressedSize >>> 0, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(versionMadeBy, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc >>> 0, 16);
    central.writeUInt32LE(compressedSize >>> 0, 20);
    central.writeUInt32LE(uncompressedSize >>> 0, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(((mode << 16) | (entry.name.endsWith('/') ? 0x10 : 0)) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + packed.length;
  }

  const centralBytes = Buffer.concat(centrals);
  const commentBytes = Buffer.from(comment, 'utf8');
  const count = entryCountOverride ?? entries.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(count, 8);
  eocd.writeUInt16LE(count, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(commentBytes.length, 20);

  return Buffer.concat([...locals, centralBytes, eocd, commentBytes]);
}

/** Writes `buildZip(entries)` to `filePath` and returns the path. */
function writeZip(filePath, entries, options) {
  fs.writeFileSync(filePath, buildZip(entries, options));
  return filePath;
}

module.exports = { buildZip, writeZip };
