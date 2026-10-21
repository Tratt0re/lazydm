import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  isAlreadyExistsError,
  moveFileNoOverwrite,
  resolveInsideVault,
  safeWriteFileAtomic,
} = require('../utils/file-utils');

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-test-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('moveFileNoOverwrite', () => {
  it('moves a file to a free target', async () => {
    fs.writeFileSync(path.join(dir, 'a.md'), 'A');
    await moveFileNoOverwrite(path.join(dir, 'a.md'), path.join(dir, 'b.md'));
    expect(fs.existsSync(path.join(dir, 'a.md'))).toBe(false);
    expect(fs.readFileSync(path.join(dir, 'b.md'), 'utf8')).toBe('A');
  });

  it('never replaces a target that appeared meanwhile, and keeps the source', async () => {
    fs.writeFileSync(path.join(dir, 'a.md'), 'A');
    fs.writeFileSync(path.join(dir, 'b.md'), 'OTHER');
    const error = await moveFileNoOverwrite(path.join(dir, 'a.md'), path.join(dir, 'b.md')).catch(
      (e) => e,
    );
    expect(isAlreadyExistsError(error)).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'b.md'), 'utf8')).toBe('OTHER');
    expect(fs.readFileSync(path.join(dir, 'a.md'), 'utf8')).toBe('A');
  });
});

describe('safeWriteFileAtomic', () => {
  it('overwrites by default', () => {
    const file = path.join(dir, 'n.md');
    safeWriteFileAtomic(file, 'one');
    safeWriteFileAtomic(file, 'two');
    expect(fs.readFileSync(file, 'utf8')).toBe('two');
  });

  it('with overwrite:false fails on an existing file and leaves no temp file', () => {
    const file = path.join(dir, 'n.md');
    fs.writeFileSync(file, 'mine');
    expect(() => safeWriteFileAtomic(file, 'new', { overwrite: false })).toThrow();
    expect(fs.readFileSync(file, 'utf8')).toBe('mine');
    expect(fs.readdirSync(dir)).toEqual(['n.md']);
  });
});

describe('resolveInsideVault', () => {
  it('rejects paths that escape the vault', () => {
    expect(() => resolveInsideVault(dir, '../outside')).toThrow(/escapes/);
  });

  it('rejects a symlink pointing outside the vault', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-out-'));
    fs.symlinkSync(outside, path.join(dir, 'link'));
    expect(() => resolveInsideVault(dir, 'link/file.md')).toThrow(/escapes/);
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it('accepts a new file inside the vault', () => {
    expect(resolveInsideVault(dir, 'camp/new.md')).toContain('camp');
  });
});

describe('safeWriteFileAtomic durability', () => {
  it('leaves no temp files behind after a successful write', () => {
    const file = path.join(dir, 'durable.md');
    safeWriteFileAtomic(file, 'content');
    expect(fs.readdirSync(dir)).toEqual(['durable.md']);
    expect(fs.readFileSync(file, 'utf8')).toBe('content');
  });

  it('writes Buffers as well as strings', () => {
    const file = path.join(dir, 'bin.dat');
    safeWriteFileAtomic(file, Buffer.from([1, 2, 3]));
    expect([...fs.readFileSync(file)]).toEqual([1, 2, 3]);
  });
});
