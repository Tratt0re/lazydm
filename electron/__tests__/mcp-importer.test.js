import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { importCampaign, scanSource } = require('../mcp/importer');
const { parseMarkdownDocument } = require('../utils/markdown-parse');

let root;
let vault;
let source;
let reindexed;

const deps = () => ({
  vaultPath: vault,
  isMedia: (name) => /\.(png|jpg|pdf|mp3)$/i.test(name),
  reindex: async (paths) => {
    reindexed.push(...paths);
  },
});

function put(base, rel, content = 'x') {
  const file = path.join(base, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

const read = (rel) => fs.readFileSync(path.join(vault, rel), 'utf8');

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-import-')));
  vault = path.join(root, 'codex');
  source = path.join(root, 'obsidian');
  fs.mkdirSync(path.join(vault, '.lazydm'), { recursive: true });
  fs.mkdirSync(source);
  reindexed = [];

  put(
    source,
    'NPCs/Goblin Boss.md',
    '---\ncr: 1\n---\nHe leads [[Cragmaw Hideout]] and fears [[Sildar|the knight]].\n',
  );
  put(source, 'NPCs/Sildar.md', '# Sildar Hallwinter\nAllied with [[Goblin Boss]].\n');
  put(source, 'NPCs/Orcs/Hill Orc.md', 'See ![[map.png]] and [boss](../Goblin%20Boss.md).\n');
  put(source, 'NPCs/Orcs/Deep/Deepest/Chief.md', 'Deep.\n');
  put(source, 'Places/Cragmaw Hideout.md', 'Home of [[Goblin Boss]]. Missing: [[Nowhere]].\n');
  put(source, 'Places/Sildar.md', 'A place with the same file name.\n');
  put(source, 'Daily.md', 'A note in the root.\n');
  put(source, 'attachments/map.png', 'PNG');
  put(source, 'attachments/unused.png', 'PNG2');
  put(source, 'board.canvas', '{}');
  put(source, '.obsidian/workspace.json', '{}');
  put(source, '.git/config', 'x');
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('scanSource', () => {
  it('reports folders, counts and what cannot be imported, without copying anything', async () => {
    const scan = await scanSource({ sourcePath: source }, deps());

    expect(scan.totals.notes).toBe(7);
    expect(scan.totals.media).toBe(2);
    expect(scan.totals.unsupportedFiles).toEqual({ '.canvas': 1 });
    expect(scan.totals.skippedHiddenEntries).toBe(2);
    expect(scan.folders.map((folder) => folder.name)).toEqual([
      '.',
      'NPCs',
      'Places',
      'attachments',
    ]);
    expect(scan.folders.find((folder) => folder.name === 'NPCs')).toMatchObject({
      notes: 4,
      notesDeeperThanOneSubfolder: 1,
    });
    expect(scan.links.wikilinks).toBeGreaterThan(0);
    expect(scan.links.markdownLinks).toBe(1);
    expect(scan.sameNameAfterSlug.map((item) => item.name)).toEqual(['sildar']);
    expect(scan.targetSections).toContain('characters');
    expect(fs.readdirSync(vault)).toEqual(['.lazydm']);
  });
});

describe('source limits', () => {
  it('refuses a relative path, a missing folder, a file, and a drive root', async () => {
    await expect(scanSource({ sourcePath: 'obsidian' }, deps())).rejects.toThrow(/absolute/);
    await expect(scanSource({ sourcePath: path.join(root, 'nope') }, deps())).rejects.toThrow(
      /not found/,
    );
    await expect(
      scanSource({ sourcePath: path.join(source, 'Daily.md') }, deps()),
    ).rejects.toThrow(/not a folder/);
    await expect(scanSource({ sourcePath: path.parse(root).root }, deps())).rejects.toThrow(
      /root of a drive/,
    );
  });

  it('refuses a source inside the Codex or one that contains it', async () => {
    put(vault, 'lost-mine/campaign.md', '# x');

    await expect(scanSource({ sourcePath: path.join(vault, 'lost-mine') }, deps())).rejects.toThrow(
      /inside the Codex/,
    );
    await expect(scanSource({ sourcePath: root }, deps())).rejects.toThrow(
      /inside the Codex, or contains it/,
    );
  });

  it('does not follow symbolic links out of the source', async () => {
    const outside = path.join(root, 'secrets');
    put(outside, 'private.md', 'secret');
    fs.symlinkSync(outside, path.join(source, 'link-to-secrets'));
    fs.symlinkSync(path.join(outside, 'private.md'), path.join(source, 'secret-note.md'));

    const scan = await scanSource({ sourcePath: source }, deps());

    expect(scan.totals.skippedSymlinks).toBe(2);
    expect(scan.totals.notes).toBe(7);
    expect(JSON.stringify(scan)).not.toContain('private.md');
  });
});

describe('importCampaign', () => {
  const mapping = { NPCs: 'characters', Places: 'locations', '.': 'sessions' };

  it('dry run reports the plan and writes nothing', async () => {
    const result = await importCampaign(
      { sourcePath: source, name: 'Lost Mine', mapping, dryRun: true },
      deps(),
    );

    expect(result.dryRun).toBe(true);
    expect(result.notes).toBe(7);
    expect(result.bySection).toEqual({ characters: 4, locations: 2, sessions: 1 });
    expect(result.mediaCopied).toBe(1);
    expect(result.foldersFlattenedToOneLevel).toBe(1);
    expect(result.skipped.mediaNotCopied).toBe(1);
    expect(fs.readdirSync(vault)).toEqual(['.lazydm']);
    expect(reindexed).toEqual([]);
  });

  it('creates the campaign with notes in sections, a slug name, and a reindex', async () => {
    const result = await importCampaign({ sourcePath: source, name: 'Lost Mine', mapping }, deps());

    expect(result.dryRun).toBe(false);
    expect(fs.existsSync(path.join(vault, 'lost-mine/campaign.md'))).toBe(true);
    expect(fs.existsSync(path.join(vault, 'lost-mine/characters/goblin-boss.md'))).toBe(true);
    expect(fs.existsSync(path.join(vault, 'lost-mine/characters/orcs/hill-orc.md'))).toBe(true);
    expect(fs.existsSync(path.join(vault, 'lost-mine/characters/orcs/chief.md'))).toBe(true);
    expect(fs.existsSync(path.join(vault, 'lost-mine/locations/cragmaw-hideout.md'))).toBe(true);
    expect(fs.existsSync(path.join(vault, 'lost-mine/sessions/daily.md'))).toBe(true);
    expect(fs.readFileSync(path.join(vault, 'lost-mine/assets/map.png'), 'utf8')).toBe('PNG');
    expect(fs.existsSync(path.join(vault, 'lost-mine/assets/unused.png'))).toBe(false);
    expect(reindexed).toContain('lost-mine/characters/goblin-boss.md');
    expect(reindexed).toContain('lost-mine/assets/map.png');
    expect(result.written).toBe(reindexed.length);
  });

  it('keeps frontmatter, and puts the readable name in the title when the note shows none', async () => {
    await importCampaign({ sourcePath: source, name: 'Lost Mine', mapping }, deps());

    const goblin = parseMarkdownDocument(read('lost-mine/characters/goblin-boss.md'));
    expect(goblin.frontmatter.cr).toBe(1);
    expect(goblin.title).toBe('Goblin Boss');

    const sildar = parseMarkdownDocument(read('lost-mine/characters/sildar.md'));
    expect(sildar.title).toBe('Sildar Hallwinter');
  });

  it('keeps links working, adding the old name as label, and disambiguates equal file names', async () => {
    const result = await importCampaign({ sourcePath: source, name: 'Lost Mine', mapping }, deps());

    const goblin = read('lost-mine/characters/goblin-boss.md');
    expect(goblin).toContain('[[cragmaw-hideout|Cragmaw Hideout]]');
    // Two imported notes are called "sildar": the link names the path, so it cannot resolve to the wrong one.
    expect(goblin).toContain('[[characters/sildar|the knight]]');
    expect(read('lost-mine/locations/cragmaw-hideout.md')).toContain('[[goblin-boss|Goblin Boss]]');

    const hillOrc = read('lost-mine/characters/orcs/hill-orc.md');
    expect(hillOrc).toContain('![[map.png]]');
    expect(hillOrc).toContain('[boss](../goblin-boss.md)');

    expect(read('lost-mine/locations/cragmaw-hideout.md')).toContain('[[Nowhere]]');
    expect(result.linksLeftAsWritten).toBe(1);
  });

  it('skips unmapped folders and lists them', async () => {
    const result = await importCampaign(
      { sourcePath: source, name: 'Lost Mine', mapping: { NPCs: 'characters' } },
      deps(),
    );

    expect(result.notes).toBe(4);
    expect(result.skipped.foldersNotMapped).toEqual({ Places: 2, '.': 1 });
    expect(fs.existsSync(path.join(vault, 'lost-mine/locations'))).toBe(false);
  });

  it('copies every media file on request', async () => {
    const result = await importCampaign(
      { sourcePath: source, name: 'Lost Mine', mapping, includeAllMedia: true },
      deps(),
    );

    expect(result.mediaCopied).toBe(2);
    expect(fs.existsSync(path.join(vault, 'lost-mine/assets/unused.png'))).toBe(true);
  });

  it('refuses a bad mapping and a taken or reserved campaign name', async () => {
    const attempt = (input) =>
      importCampaign({ sourcePath: source, name: 'Lost Mine', mapping, ...input }, deps());

    await expect(attempt({ mapping: {} })).rejects.toThrow(/empty/);
    await expect(attempt({ mapping: { Nope: 'characters' } })).rejects.toThrow(
      /not a folder of the source/,
    );
    await expect(attempt({ mapping: { NPCs: 'assets' } })).rejects.toThrow(/not a section/);
    await expect(attempt({ mapping: { NPCs: 'encounters' } })).rejects.toThrow(/not a section/);
    await expect(attempt({ name: '   ' })).rejects.toThrow(/name is required/);
    await expect(attempt({ name: 'Compendium' })).rejects.toThrow(/folder name/);
    await expect(attempt({ name: '...' })).rejects.toThrow(/folder name/);

    // A folder that is already there is never touched, not even to clean up after a failed import.
    fs.mkdirSync(path.join(vault, 'lost-mine'));
    put(vault, 'lost-mine/mine.md', 'keep me');
    await expect(attempt({})).rejects.toThrow(/already exists/);
    expect(read('lost-mine/mine.md')).toBe('keep me');
  });

  it('names a taken file with a suffix instead of overwriting', async () => {
    put(source, 'NPCs/goblin-boss.md', 'another');

    const result = await importCampaign({ sourcePath: source, name: 'Lost Mine', mapping }, deps());

    expect(result.renamedBecauseTakenCount).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(vault, 'lost-mine/characters/goblin-boss.md'))).toBe(true);
    expect(fs.existsSync(path.join(vault, 'lost-mine/characters/goblin-boss-2.md'))).toBe(true);
  });

  it('keeps the written campaign when only the index step fails', async () => {
    const failing = {
      ...deps(),
      reindex: async () => {
        throw new Error('index failed');
      },
    };

    await expect(
      importCampaign({ sourcePath: source, name: 'Lost Mine', mapping }, failing),
    ).rejects.toThrow(/index failed/);
    // The files are complete on disk; the index follows on the next scan or file-watch event.
    expect(fs.existsSync(path.join(vault, 'lost-mine/characters/goblin-boss.md'))).toBe(true);
    expect(fs.existsSync(path.join(vault, 'lost-mine/assets/map.png'))).toBe(true);
  });

  it('removes the new campaign folder when a note cannot be written', async () => {
    const originalWrite = fs.promises.writeFile;
    fs.promises.writeFile = async (file, ...rest) => {
      if (String(file).includes('hill-orc')) {
        throw new Error('disk full');
      }
      return originalWrite(file, ...rest);
    };

    try {
      await expect(
        importCampaign({ sourcePath: source, name: 'Lost Mine', mapping }, deps()),
      ).rejects.toThrow(/disk full/);
    } finally {
      fs.promises.writeFile = originalWrite;
    }

    expect(fs.existsSync(path.join(vault, 'lost-mine'))).toBe(false);
    expect(reindexed).toEqual([]);
  });
});
