import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { hashContent, writeFileInPlace } = require('../utils/file-utils');
const writeJournal = require('../utils/write-journal');
const documentModel = require('../models/document.model');

let vault;
let journal;
beforeEach(() => {
  vault = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-vault-'));
  journal = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-journal-'));
  writeJournal.setJournalDirForTests(journal);
});
afterEach(() => {
  writeJournal.setJournalDirForTests(null);
  fs.rmSync(vault, { recursive: true, force: true });
  fs.rmSync(journal, { recursive: true, force: true });
});

describe('writeFileInPlace', () => {
  it('rewrites the file without leaving another file next to it', () => {
    const file = path.join(vault, 'a.md');
    fs.writeFileSync(file, 'old and longer content');
    writeFileInPlace(file, 'new');
    expect(fs.readFileSync(file, 'utf8')).toBe('new');
    expect(fs.readdirSync(vault)).toEqual(['a.md']);
  });

  it('keeps the same inode (no rename)', () => {
    const file = path.join(vault, 'a.md');
    fs.writeFileSync(file, 'old');
    const before = fs.statSync(file).ino;
    writeFileInPlace(file, 'new');
    expect(fs.statSync(file).ino).toBe(before);
  });
});

describe('writeDocument', () => {
  it('saves, leaves no journal entry and no extra file', async () => {
    fs.writeFileSync(path.join(vault, 'n.md'), 'one');
    const result = await documentModel.writeDocument(vault, 'n.md', 'two', hashContent('one'));
    expect(result.status).toBe('saved');
    expect(fs.readFileSync(path.join(vault, 'n.md'), 'utf8')).toBe('two');
    expect(writeJournal.listPending()).toEqual([]);
    expect(fs.readdirSync(vault)).toEqual(['n.md']);
  });

  it('does not touch the file when the content is unchanged', async () => {
    const file = path.join(vault, 'n.md');
    fs.writeFileSync(file, 'same');
    const past = new Date(2020, 0, 1);
    fs.utimesSync(file, past, past);
    const result = await documentModel.writeDocument(vault, 'n.md', 'same', hashContent('same'));
    expect(result.status).toBe('saved');
    expect(fs.statSync(file).mtimeMs).toBe(past.getTime());
  });

  it('reports a conflict and writes nothing when the file changed meanwhile', async () => {
    fs.writeFileSync(path.join(vault, 'n.md'), 'theirs');
    const result = await documentModel.writeDocument(vault, 'n.md', 'mine', hashContent('one'));
    expect(result.status).toBe('conflict');
    expect(fs.readFileSync(path.join(vault, 'n.md'), 'utf8')).toBe('theirs');
  });
});

describe('write journal', () => {
  it('keeps an entry until it is completed', () => {
    const entry = writeJournal.begin(vault, 'n.md', 'text', 'hash');
    expect(writeJournal.listPending()).toHaveLength(1);
    expect(writeJournal.listPending()[0]).toMatchObject({ path: 'n.md', content: 'text' });
    writeJournal.complete(entry);
    expect(writeJournal.listPending()).toEqual([]);
  });

  it('purges old entries and entries of a vault that is gone', () => {
    writeJournal.begin(vault, 'n.md', 'text', 'hash');
    expect(writeJournal.purgeStale(Date.now())).toBe(0);
    expect(writeJournal.purgeStale(Date.now() + writeJournal.RETENTION_MS + 1000)).toBe(1);
    writeJournal.begin(vault, 'm.md', 'text', 'hash');
    fs.rmSync(vault, { recursive: true, force: true });
    expect(writeJournal.purgeStale()).toBe(1);
  });
});

describe('write journal inspect', () => {
  const entryFor = (content, expectedHash) => {
    writeJournal.begin(vault, 'n.md', content, expectedHash);
    return writeJournal.listPending()[0];
  };

  it('knows a finished write', () => {
    fs.writeFileSync(path.join(vault, 'n.md'), 'new text');
    expect(writeJournal.inspect(entryFor('new text', hashContent('old'))).state).toBe('done');
  });

  it('knows a write that never started', () => {
    fs.writeFileSync(path.join(vault, 'n.md'), 'old');
    expect(writeJournal.inspect(entryFor('new text', hashContent('old'))).state).toBe('untouched');
  });

  it('knows a write cut short (empty or a prefix)', () => {
    fs.writeFileSync(path.join(vault, 'n.md'), '');
    expect(writeJournal.inspect(entryFor('new text', hashContent('old'))).state).toBe('interrupted');
    fs.writeFileSync(path.join(vault, 'n.md'), 'new t');
    expect(writeJournal.inspect(writeJournal.listPending()[0]).state).toBe('interrupted');
  });

  it('never overwrites a note changed by someone else', () => {
    fs.writeFileSync(path.join(vault, 'n.md'), 'something else entirely');
    expect(writeJournal.inspect(entryFor('new text', hashContent('old'))).state).toBe('changed');
  });
});
