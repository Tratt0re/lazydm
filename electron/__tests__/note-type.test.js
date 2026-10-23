import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createDocument } = require('../models/document.model');
const { getBuiltInTemplate } = require('../models/template.model');
const { DEFAULT_SECTIONS } = require('../models/section.model');
const { parseMarkdownDocument } = require('../utils/markdown-parse');

describe('a note does not carry its kind in the frontmatter', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-note-type-'));
    fs.mkdirSync(path.join(root, 'camp', 'enemies', 'humans'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('writes no type or subtype for a new note in a section or a sub-folder', async () => {
    for (const folderPath of ['camp/enemies', 'camp/enemies/humans']) {
      const note = await createDocument(root, {
        folderPath,
        slug: 'bandit',
        title: 'Bandit',
        type: 'enemy',
        section: 'Enemies',
      });
      expect(note.frontmatter).not.toHaveProperty('type');
      expect(note.frontmatter).not.toHaveProperty('subtype');
      expect(note.frontmatter.title).toBe('Bandit');
    }
  });

  it('writes no type for a section without a template either', async () => {
    const note = await createDocument(root, {
      folderPath: 'camp/enemies',
      slug: 'x',
      title: 'X',
      type: 'faction',
      section: 'Factions',
    });
    expect(note.frontmatter).not.toHaveProperty('type');
  });

  it('keeps a type the user writes in a template', async () => {
    fs.mkdirSync(path.join(root, '_templates'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '_templates', 'enemy.md'),
      '---\ntype: beast\ntitle: "{{title}}"\n---\n# {{title}}\n',
    );
    const note = await createDocument(root, {
      folderPath: 'camp/enemies',
      slug: 'wolf',
      title: 'Wolf',
      type: 'enemy',
      section: 'Enemies',
    });
    expect(note.frontmatter.type).toBe('beast');
  });

  it('ships built-in templates without a type key', () => {
    for (const section of DEFAULT_SECTIONS.filter((item) => item.type && !item.isSpecial)) {
      const { frontmatter } = parseMarkdownDocument(getBuiltInTemplate(section.type));
      expect(frontmatter).not.toHaveProperty('type');
    }
  });
});

describe('moving and copying leave the frontmatter alone', () => {
  let root;
  const { getCopyLocation, moveNoteFile } = require('../controllers/document.controller');

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-note-move-'));
    fs.mkdirSync(path.join(root, 'camp', 'enemies', 'humans'), { recursive: true });
    fs.mkdirSync(path.join(root, 'camp', 'locations'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'camp', 'enemies', 'humans', 'bandit.md'),
      '---\ntitle: Bandit\ntype: beast\nsubtype: humanoid\n---\n# Bandit\n',
    );
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('moves a note without touching type or subtype', async () => {
    const { vaultIndexModel } = require('../models');
    const original = vaultIndexModel.listOutgoingLinks;
    vaultIndexModel.listOutgoingLinks = () => [];
    let ok;
    try {
      ok = await moveNoteFile(root, 'camp/enemies/humans/bandit.md', 'camp/locations/bandit.md');
    } finally {
      vaultIndexModel.listOutgoingLinks = original;
    }
    expect(ok).toBe(true);
    const text = fs.readFileSync(path.join(root, 'camp', 'locations', 'bandit.md'), 'utf8');
    expect(text).toBe('---\ntitle: Bandit\ntype: beast\nsubtype: humanoid\n---\n# Bandit\n');
  });

  it('copies a note to the folder it has in its source, whatever its frontmatter says', async () => {
    const location = await getCopyLocation(root, 'camp/enemies/humans/bandit.md', 'camp2');
    expect(location).toEqual({ section: 'enemies', subfolder: 'humans', canHaveSubfolder: true });
  });

  it('copies a note outside any section to notes/', async () => {
    fs.writeFileSync(path.join(root, 'camp', 'stray.md'), '---\ntype: enemy\n---\n# Stray\n');
    const location = await getCopyLocation(root, 'camp/stray.md', 'camp2');
    expect(location).toEqual({ section: 'notes', subfolder: null, canHaveSubfolder: false });
  });
});
