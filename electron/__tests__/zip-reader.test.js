import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { buildZip, writeZip } = require('./helpers/raw-zip');
const {
  ENTRY_SKIPS,
  ZIP_REFUSALS,
  ZipRefusedError,
  openEntryStream,
  openZip,
  readEntryBuffer,
} = require('../utils/zip-reader');
const { ZIP_LIMITS } = require('../utils/zip-limits');

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-zipreader-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const zipPath = (name = 'test.zip') => path.join(dir, name);

/** Opens a zip made of `entries` and returns the refusal code, or null when it opened. */
async function refusalOf(entries, options, limits) {
  const target = writeZip(zipPath(), entries, options);
  try {
    const archive = await openZip(target, limits);
    archive.close();
  } catch (error) {
    expect(error).toBeInstanceOf(ZipRefusedError);
    return error.code;
  }
  return null;
}

const file = (name, data = 'x', extra = {}) => ({ name, data, ...extra });

describe('openZip: a good zip', () => {
  it('lists its entries with checked names and their declared sizes', async () => {
    writeZip(zipPath(), [
      file('lost-mine/', '', { method: 0 }),
      file('lost-mine/scenes/intro.md', '# Intro\n'),
      file('lost-mine/assets/map.png', Buffer.from([1, 2, 3]), { method: 0 }),
    ]);

    const archive = await openZip(zipPath());
    try {
      expect(archive.entries.map((entry) => [entry.name, entry.isDirectory])).toEqual([
        ['lost-mine', true],
        ['lost-mine/scenes/intro.md', false],
        ['lost-mine/assets/map.png', false],
      ]);
      expect(archive.entries[1].uncompressedSize).toBe(8);
      expect(archive.entries.every((entry) => entry.skipReason === null)).toBe(true);
    } finally {
      archive.close();
    }
  });

  it('reads an entry back, deflated or stored', async () => {
    writeZip(zipPath(), [
      file('c/a.md', '# deflated\n'),
      file('c/b.md', '# stored\n', { method: 0 }),
    ]);

    const archive = await openZip(zipPath());
    try {
      expect((await readEntryBuffer(archive, archive.entries[0])).toString()).toBe('# deflated\n');
      expect((await readEntryBuffer(archive, archive.entries[1])).toString()).toBe('# stored\n');
    } finally {
      archive.close();
    }
  });

  it('keeps non-ASCII names and treats NFC and NFD of one name as the same file', async () => {
    writeZip(zipPath(), [file('c/città.md')]);
    const archive = await openZip(zipPath());
    expect(archive.entries[0].name).toBe('c/città.md');
    archive.close();

    expect(await refusalOf([file('c/caf\u00e9.md'), file('c/cafe\u0301.md')])).toBe(
      ZIP_REFUSALS.duplicate,
    );
  });
});

describe('openZip: not a usable zip', () => {
  it.each([
    ['a missing file', () => zipPath('missing.zip')],
    ['a folder', () => dir],
  ])('refuses %s', async (_name, target) => {
    await expect(openZip(target())).rejects.toMatchObject({ code: ZIP_REFUSALS.notAZip });
  });

  it('refuses a link to a zip, because a link may point anywhere', async () => {
    writeZip(zipPath('real.zip'), [file('c/a.md')]);
    fs.symlinkSync(zipPath('real.zip'), zipPath('link.zip'));

    await expect(openZip(zipPath('link.zip'))).rejects.toMatchObject({
      code: ZIP_REFUSALS.notAZip,
    });
  });

  it.each([
    ['a text file renamed .zip', Buffer.from('this is not a zip at all, just words')],
    ['an empty file', Buffer.alloc(0)],
    ['random bytes', Buffer.from(Array.from({ length: 200 }, (_, index) => (index * 37) % 251))],
  ])('refuses %s', async (_name, bytes) => {
    fs.writeFileSync(zipPath(), bytes);

    await expect(openZip(zipPath())).rejects.toMatchObject({ code: ZIP_REFUSALS.notAZip });
  });

  it('refuses a truncated zip', async () => {
    const whole = buildZip([file('c/a.md', 'x'.repeat(500)), file('c/b.md', 'y'.repeat(500))]);
    fs.writeFileSync(zipPath(), whole.subarray(0, whole.length - 30));

    await expect(openZip(zipPath())).rejects.toMatchObject({ code: ZIP_REFUSALS.notAZip });
  });

  it('refuses a zip with no entries', async () => {
    expect(await refusalOf([])).toBe(ZIP_REFUSALS.empty);
  });

  it('refuses a zip over the file size cap, without opening it', async () => {
    writeZip(zipPath(), [file('c/a.md')]);

    await expect(openZip(zipPath(), { ...ZIP_LIMITS, maxZipBytes: 10 })).rejects.toMatchObject({
      code: ZIP_REFUSALS.tooLargeFile,
    });
  });
});

describe('openZip: hostile paths', () => {
  it.each([
    ['zip-slip', 'c/../../evil.md'],
    ['a parent first', '../evil.md'],
    ['an absolute path', '/etc/passwd'],
    ['a drive letter', 'C:/Windows/evil.md'],
    ['a backslash path', 'c\\..\\evil.md'],
    ['a dot segment', 'c/./a.md'],
    ['an empty segment', 'c//a.md'],
    ['a NUL byte', 'c/a.md\u0000.png'],
    ['a control character', 'c/a\u0007.md'],
  ])('refuses %s as a whole', async (_name, name) => {
    expect(await refusalOf([file('c/ok.md'), file(name)])).toBe(ZIP_REFUSALS.unsafePath);
  });

  it('describes hidden entries and unusable names as skipped, not as an attack', async () => {
    writeZip(zipPath(), [
      file('c/scenes/intro.md'),
      file('c/.DS_Store'),
      file('c/.git/config'),
      file('c/scenes/con.md'),
      file('c/scenes/odd?.md'),
      file('c/scenes/trailing.'),
    ]);

    const archive = await openZip(zipPath());
    try {
      const skipped = Object.fromEntries(
        archive.entries.map((entry) => [entry.name, entry.skipReason]),
      );
      expect(skipped).toEqual({
        'c/scenes/intro.md': null,
        'c/.DS_Store': ENTRY_SKIPS.hidden,
        'c/.git/config': ENTRY_SKIPS.hidden,
        'c/scenes/con.md': ENTRY_SKIPS.name,
        'c/scenes/odd?.md': ENTRY_SKIPS.name,
        'c/scenes/trailing.': ENTRY_SKIPS.name,
      });
    } finally {
      archive.close();
    }
  });

  it('refuses a name that is the same file as another, with or without case', async () => {
    expect(await refusalOf([file('c/a.md'), file('c/a.md')])).toBe(ZIP_REFUSALS.duplicate);
    expect(await refusalOf([file('c/Bandit.md'), file('c/bandit.MD')])).toBe(
      ZIP_REFUSALS.duplicate,
    );
  });
});

describe('openZip: links, encryption and compression', () => {
  const S_IFLNK = 0o120777;
  const S_IFIFO = 0o010644;
  const S_IFCHR = 0o020644;
  const S_IFBLK = 0o060644;
  const S_IFSOCK = 0o140644;

  it.each([
    ['a symlink', S_IFLNK],
    ['a named pipe', S_IFIFO],
    ['a character device', S_IFCHR],
    ['a block device', S_IFBLK],
    ['a socket', S_IFSOCK],
  ])('refuses %s', async (_name, mode) => {
    expect(await refusalOf([file('c/ok.md'), file('c/link', '../../etc/passwd', { mode })])).toBe(
      ZIP_REFUSALS.specialFile,
    );
  });

  it('refuses a link written by macOS too', async () => {
    expect(
      await refusalOf([file('c/link', 'x', { mode: S_IFLNK, versionMadeBy: (19 << 8) | 20 })]),
    ).toBe(ZIP_REFUSALS.specialFile);
  });

  it("does not read a Windows entry's attribute bits as a Unix mode", async () => {
    expect(
      await refusalOf([file('c/a.md', 'x', { mode: S_IFLNK, versionMadeBy: (0 << 8) | 20 })]),
    ).toBeNull();
  });

  it('refuses an encrypted entry', async () => {
    expect(await refusalOf([file('c/a.md', 'x', { flags: 0x1 })])).toBe(ZIP_REFUSALS.encrypted);
  });

  it('refuses compression methods other than stored and deflate', async () => {
    expect(await refusalOf([file('c/a.md', 'x', { method: 12 })])).toBe(
      ZIP_REFUSALS.unsupportedCompression,
    );
    expect(await refusalOf([file('c/a.md', 'x', { method: 14 })])).toBe(
      ZIP_REFUSALS.unsupportedCompression,
    );
  });
});

describe('openZip: caps', () => {
  it('refuses more entries than the cap', async () => {
    const entries = Array.from({ length: 6 }, (_, index) => file(`c/n${index}.md`));

    expect(await refusalOf(entries, undefined, { ...ZIP_LIMITS, maxEntries: 5 })).toBe(
      ZIP_REFUSALS.tooManyEntries,
    );
  });

  it('refuses a zip whose declared sizes add up past the total cap', async () => {
    expect(
      await refusalOf([file('c/a.md', 'x'.repeat(60)), file('c/b.md', 'y'.repeat(60))], undefined, {
        ...ZIP_LIMITS,
        maxTotalBytes: 100,
      }),
    ).toBe(ZIP_REFUSALS.tooManyBytes);
  });

  it('refuses an entry packed at a ratio no campaign has', async () => {
    const zeros = Buffer.alloc(2 * 1024 * 1024);

    expect(await refusalOf([file('c/a.png', zeros)])).toBe(ZIP_REFUSALS.ratio);
  });

  it('refuses an archive whose entries together are packed at that ratio', async () => {
    // Each entry is under the ratio floor on its own; together they are over it.
    const block = Buffer.alloc(600 * 1024);

    expect(
      await refusalOf([file('c/a.md', block), file('c/b.md', block), file('c/c.md', block)]),
    ).toBe(ZIP_REFUSALS.ratio);
  });

  it('does not apply the ratio to a small note that packs well', async () => {
    expect(await refusalOf([file('c/a.md', 'a'.repeat(100 * 1024))])).toBeNull();
  });

  it('does not apply the ratio to real, hard-to-compress content', async () => {
    const noise = Buffer.from(Array.from({ length: 4000 }, (_, index) => (index * 7919) % 256));

    expect(await refusalOf([file('c/a.png', noise, { method: 0 })])).toBeNull();
  });
});

describe('entries that lie about their size', () => {
  async function open(entries) {
    writeZip(zipPath(), entries);
    return openZip(zipPath());
  }

  it('stops an entry that unpacks to more than it declared', async () => {
    const real = Buffer.from('x'.repeat(5000));
    const archive = await open([
      file('c/a.md', real, { declaredUncompressed: 10, crc: zlib.crc32(real) }),
    ]);
    try {
      await expect(readEntryBuffer(archive, archive.entries[0])).rejects.toBeInstanceOf(Error);
    } finally {
      archive.close();
    }
  });

  it('stops an entry that unpacks to less than it declared', async () => {
    const archive = await open([file('c/a.md', 'short', { declaredUncompressed: 5000 })]);
    try {
      await expect(readEntryBuffer(archive, archive.entries[0])).rejects.toBeInstanceOf(Error);
    } finally {
      archive.close();
    }
  });

  it('stops an entry whose CRC-32 is wrong', async () => {
    const archive = await open([file('c/a.md', 'hello', { crc: 12345 })]);
    try {
      await expect(readEntryBuffer(archive, archive.entries[0])).rejects.toMatchObject({
        code: ZIP_REFUSALS.corrupt,
      });
    } finally {
      archive.close();
    }
  });

  it('stops an entry bigger than the cap the caller gives, whatever it declares', async () => {
    const archive = await open([file('c/a.md', 'x'.repeat(2000))]);
    try {
      await expect(
        readEntryBuffer(archive, archive.entries[0], { maxBytes: 100 }),
      ).rejects.toMatchObject({ code: ZIP_REFUSALS.corrupt });
    } finally {
      archive.close();
    }
  });

  it('stops entries once the shared byte budget of the zip is spent', async () => {
    const archive = await open([file('c/a.md', 'a'.repeat(300)), file('c/b.md', 'b'.repeat(300))]);
    const budget = { remaining: 400 };
    try {
      await readEntryBuffer(archive, archive.entries[0], { budget });
      expect(budget.remaining).toBe(100);
      await expect(readEntryBuffer(archive, archive.entries[1], { budget })).rejects.toMatchObject({
        code: ZIP_REFUSALS.tooManyBytes,
      });
    } finally {
      archive.close();
    }
  });

  it('rejects a deflate stream that is garbage', async () => {
    const zip = buildZip([file('c/a.md', 'hello world, hello world')]);
    // Corrupt the packed bytes (the local header is 30 bytes + the name, then the data).
    const corrupt = Buffer.from(zip);
    const start = 30 + 'c/a.md'.length;
    for (let index = start; index < start + 8; index += 1) {
      corrupt[index] = 0xff;
    }
    fs.writeFileSync(zipPath(), corrupt);
    const archive = await openZip(zipPath());
    try {
      await expect(readEntryBuffer(archive, archive.entries[0])).rejects.toBeInstanceOf(Error);
    } finally {
      archive.close();
    }
  });

  it('streams a large entry in pieces and never holds it whole', async () => {
    const big = Buffer.alloc(8 * 1024 * 1024);
    for (let index = 0; index < big.length; index += 1) {
      big[index] = (index * 31 + (index >> 8)) & 0xff;
    }
    writeZip(zipPath(), [file('c/big.png', big, { method: 0 })]);
    const archive = await openZip(zipPath());
    try {
      const stream = await openEntryStream(archive, archive.entries[0], { maxBytes: big.length });
      let total = 0;
      let largestChunk = 0;
      for await (const chunk of stream) {
        total += chunk.length;
        largestChunk = Math.max(largestChunk, chunk.length);
      }
      expect(total).toBe(big.length);
      expect(largestChunk).toBeLessThan(big.length / 4);
    } finally {
      archive.close();
    }
  });
});

describe('the reader never writes', () => {
  it('leaves the folder it works in exactly as it found it', async () => {
    writeZip(zipPath(), [file('c/../../evil.md'), file('c/a.md')]);
    const before = fs.readdirSync(dir).sort();

    await expect(openZip(zipPath())).rejects.toBeInstanceOf(ZipRefusedError);

    expect(fs.readdirSync(dir).sort()).toEqual(before);
    expect(fs.existsSync(path.join(path.dirname(dir), 'evil.md'))).toBe(false);
  });
});
