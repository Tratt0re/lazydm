import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { writeZip } = require('./helpers/raw-zip');
const importModel = require('../models/campaign-import.model');
const exportModel = require('../models/campaign-export.model');
const campaignModel = require('../models/campaign.model');
const templateModel = require('../models/template.model');
const { ZIP_REFUSALS, ZipRefusedError } = require('../utils/zip-reader');
const { ZIP_LIMITS } = require('../utils/zip-limits');

const { IMPORT_SKIPS, MAX_LISTED_SKIPS, kindOfEntry, scanBundle } = importModel;
const isMedia = (name) => /\.(png|jpg|pdf|mp3)$/i.test(name);

let root;
const zipPath = () => path.join(root, 'test.zip');
const file = (name, data = 'x', extra = {}) => ({ name, data, ...extra });
const manifest = (value) => JSON.stringify({ formatVersion: 1, ...value });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-scan-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

async function scan(entries, limits) {
  writeZip(zipPath(), entries);
  return scanBundle(zipPath(), { isMedia, ...(limits ? { limits } : {}) });
}

async function refusalOf(entries, limits) {
  try {
    await scan(entries, limits);
  } catch (error) {
    expect(error).toBeInstanceOf(ZipRefusedError);
    return error.code;
  }
  return null;
}

describe('kindOfEntry', () => {
  it.each([
    ['lazydm.json', 'manifest'],
    ['campaign.md', 'card'],
    ['agents.md', 'agents'],
    ['_templates/scene.md', 'template'],
    ['scenes/intro.md', 'note'],
    ['enemies/humans/bandit.md', 'note'],
    ['_templates/sub/deep.md', 'note'],
    ['encounters/ambush.json', 'encounters'],
    ['maps/cave.json', 'maps'],
    ['assets/cave.png', 'asset'],
    ['scenes/handout.pdf', 'asset'],
    ['world/data.json', null],
    ['encounters.json', null],
    ['assets/app.exe', null],
    ['scenes/run.sh', null],
  ])('%s is %s', (rel, kind) => {
    expect(kindOfEntry(rel, isMedia)).toBe(kind);
  });
});

describe('scanBundle: what a zip holds', () => {
  it('counts every kind and reads the name, system and description', async () => {
    const result = await scan([
      file(
        'lost-mine/lazydm.json',
        manifest({ title: 'Lost Mine', system: 'dnd5e', description: 'A mine.' }),
      ),
      file('lost-mine/campaign.md', '---\ntitle: Lost Mine\n---\n# Lost Mine\n'),
      file('lost-mine/agents.md', 'Be nice.'),
      file('lost-mine/_templates/scene.md', '---\ntitle: x\n---\n'),
      file('lost-mine/scenes/a.md'),
      file('lost-mine/scenes/b.md'),
      file('lost-mine/enemies/humans/bandit.md'),
      file('lost-mine/encounters/ambush.json', '{}'),
      file('lost-mine/maps/cave.json', '{}'),
      file('lost-mine/assets/cave.png', 'png'),
    ]);

    expect(result).toMatchObject({
      folderName: 'lost-mine',
      title: 'Lost Mine',
      description: 'A mine.',
      system: 'dnd5e',
      hasManifest: true,
      formatVersion: 1,
      hasAgentRules: true,
      counts: { notes: 3, assets: 1, encounters: 1, maps: 1, templates: 1 },
      skipped: [],
      skippedTotal: 0,
      warnings: [],
      files: 10,
    });
  });

  it('works for a plain folder of notes with no manifest (Obsidian, another tool)', async () => {
    const result = await scan([
      file(
        'Phandalin/campaign.md',
        '---\ntitle: "Phandalin"\ndescription: "A town."\nsystem: pf2e\n---\n',
      ),
      file('Phandalin/scenes/a.md'),
    ]);

    expect(result).toMatchObject({
      folderName: 'Phandalin',
      title: 'Phandalin',
      description: 'A town.',
      system: 'pf2e',
      hasManifest: false,
      formatVersion: null,
      counts: { notes: 1 },
    });
  });

  it('falls back to the folder name when there is no manifest and no card', async () => {
    const result = await scan([file('my-notes/a.md')]);

    expect(result.title).toBe('my-notes');
    expect(result.system).toBe('generic');
  });

  it('takes nothing from a card that is not what it should be', async () => {
    const result = await scan([
      file('c/campaign.md', '---\ntitle: [1, 2]\ndescription: {a: 1}\nsystem: 5\n---\n'),
      file('c/a.md'),
    ]);

    expect(result).toMatchObject({ title: 'c', description: null, system: 'generic' });
  });

  it('adds the size of what it would take', async () => {
    const result = await scan([file('c/a.md', 'x'.repeat(100)), file('c/b.md', 'y'.repeat(50))]);

    expect(result.bytes).toBe(150);
  });
});

describe('scanBundle: what is left out', () => {
  it('lists unwelcome files with the reason, and says nothing of hidden ones', async () => {
    const result = await scan([
      file('c/scenes/a.md'),
      file('c/.DS_Store'),
      file('c/.obsidian/app.json'),
      file('c/assets/app.exe', 'MZ'),
      file('c/scenes/run.sh', 'rm -rf'),
      file('c/world/data.json', '{}'),
      file('c/scenes/con.md'),
      file('c/encounters/_party.json', '{"players":[]}'),
    ]);

    expect(result.counts.notes).toBe(1);
    expect(result.skipped).toEqual([
      { path: 'assets/app.exe', reason: IMPORT_SKIPS.type },
      { path: 'scenes/run.sh', reason: IMPORT_SKIPS.type },
      { path: 'world/data.json', reason: IMPORT_SKIPS.type },
      { path: 'scenes/con.md', reason: IMPORT_SKIPS.name },
      { path: 'encounters/_party.json', reason: IMPORT_SKIPS.party },
    ]);
    expect(result.skippedTotal).toBe(5);
  });

  it('skips a note or medium over its own cap', async () => {
    const result = await scan(
      [
        file('c/a.md', 'x'.repeat(50)),
        file('c/b.md', 'x'.repeat(5)),
        file('c/p.png', 'x'.repeat(50)),
      ],
      { ...ZIP_LIMITS, maxTextBytes: 10, maxMediaBytes: 10 },
    );

    expect(result.skipped).toEqual([
      { path: 'a.md', reason: IMPORT_SKIPS.tooLarge },
      { path: 'p.png', reason: IMPORT_SKIPS.tooLarge },
    ]);
    expect(result.counts.notes).toBe(1);
  });

  it('lists at most 20 files and counts the rest', async () => {
    const entries = [file('c/ok.md')];
    for (let index = 0; index < 35; index += 1) {
      entries.push(file(`c/junk/f${String(index).padStart(2, '0')}.exe`, 'MZ'));
    }

    const result = await scan(entries);

    expect(result.skipped).toHaveLength(MAX_LISTED_SKIPS);
    expect(result.skippedTotal).toBe(35);
  });
});

describe('scanBundle: the manifest', () => {
  it('reports what it had to drop, and still takes the zip', async () => {
    const result = await scan([
      file(
        'c/lazydm.json',
        manifest({ title: 'T', system: 'starfinder', battleRule: '../x.json' }),
      ),
      file('c/a.md'),
    ]);

    expect(result.system).toBe('generic');
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        { code: 'unknown-system', field: 'system' },
        { code: 'invalid-field', field: 'battleRule' },
      ]),
    );
  });

  it('ignores a manifest it cannot read, with a warning, and goes on as a folder of notes', async () => {
    const result = await scan([
      file('c/lazydm.json', '{not json'),
      file('c/campaign.md', '---\ntitle: From card\n---\n'),
      file('c/a.md'),
    ]);

    expect(result.hasManifest).toBe(false);
    expect(result.title).toBe('From card');
    expect(result.warnings).toContainEqual({ code: 'manifest-unreadable', field: 'manifest' });
  });

  it('refuses a zip made by a newer version', async () => {
    expect(await refusalOf([file('c/lazydm.json', '{"formatVersion":2}'), file('c/a.md')])).toBe(
      ZIP_REFUSALS.newerVersion,
    );
  });

  it('does not take a manifest in the wrong place for the real one', async () => {
    const result = await scan([
      file('c/scenes/lazydm.json', manifest({ title: 'Impostor' })),
      file('c/a.md'),
    ]);

    expect(result.hasManifest).toBe(false);
    expect(result.title).toBe('c');
  });
});

describe('scanBundle: the shape of the zip', () => {
  it('refuses more than one top-level folder', async () => {
    expect(await refusalOf([file('one/a.md'), file('two/b.md')])).toBe(
      ZIP_REFUSALS.multipleFolders,
    );
  });

  it('counts folders that differ only in case as one, as a computer that ignores case does', async () => {
    const result = await scan([file('Lost/a.md'), file('lost/b.md')]);

    expect(result.counts.notes).toBe(2);
  });

  it('refuses files outside any folder', async () => {
    expect(await refusalOf([file('a.md'), file('c/b.md')])).toBe(ZIP_REFUSALS.noFolder);
    expect(await refusalOf([file('only-a-file.md')])).toBe(ZIP_REFUSALS.noFolder);
  });

  it('refuses a zip that holds folders and nothing else', async () => {
    expect(await refusalOf([file('c/', '', { method: 0 })])).toBe(ZIP_REFUSALS.noFolder);
  });

  it('takes folder entries and the files in them together', async () => {
    const result = await scan([
      file('c/', '', { method: 0 }),
      file('c/scenes/', '', { method: 0 }),
      file('c/scenes/a.md'),
    ]);

    expect(result.counts.notes).toBe(1);
  });

  it('passes on the refusals of the reader', async () => {
    expect(await refusalOf([file('c/../../evil.md'), file('c/a.md')])).toBe(
      ZIP_REFUSALS.unsafePath,
    );
    expect(await refusalOf([file('c/link', 'x', { mode: 0o120777 })])).toBe(
      ZIP_REFUSALS.specialFile,
    );
    expect(await refusalOf([file('c/a.md', 'x', { flags: 1 })])).toBe(ZIP_REFUSALS.encrypted);
    expect(await refusalOf([file('c/a.md'), file('c/A.md')])).toBe(ZIP_REFUSALS.duplicate);
  });

  it('leaves nothing on the disk', async () => {
    await scan([file('c/a.md'), file('c/assets/p.png', 'png')]);
    await refusalOf([file('c/../../evil.md')]);

    expect(fs.readdirSync(root)).toEqual(['test.zip']);
  });

  it('closes the zip after the scan, success or refusal', async () => {
    await scan([file('c/a.md')]);
    await refusalOf([file('c/../x.md')]);
    // A closed file can be removed and written again at once.
    fs.rmSync(zipPath());
    writeZip(zipPath(), [file('c/a.md')]);

    expect((await scanBundle(zipPath(), { isMedia })).counts.notes).toBe(1);
  });
});

describe('scanBundle reads what exportCampaign wrote', () => {
  let vault;

  beforeEach(async () => {
    vault = path.join(root, 'codex');
    fs.mkdirSync(path.join(vault, '.lazydm'), { recursive: true });
    fs.writeFileSync(path.join(vault, '.lazydm', 'vault.json'), '{"schemaVersion":1,"name":"t"}\n');
    await campaignModel.createCampaign(vault, {
      slug: 'lost-mine',
      name: 'Lost Mine',
      description: 'A mine, lost.',
      system: 'dnd5e',
    });
  });

  const put = (rel, content = '# x\n') => {
    const target = path.join(vault, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };

  it('gives back the counts of the campaign it came from', async () => {
    put('lost-mine/scenes/intro.md');
    put('lost-mine/enemies/humans/bandit.md');
    put('lost-mine/encounters/ambush.json', '{}');
    put('lost-mine/encounters/_party.json', '{"players":["A real name"]}');
    put('lost-mine/maps/cave.json', '{}');
    put('lost-mine/assets/cave.png', 'png');
    put('lost-mine/agents.md', 'Be nice.');
    put('_templates/enemy.md', '---\ntitle: "{{title}}"\n---\n');
    templateModel.setCampaignRule(vault, 'lost-mine', 'enemy', '_templates/enemy.md');
    const out = path.join(root, 'out.zip');

    await exportModel.exportCampaign(vault, 'lost-mine', out, { isMedia, appVersion: '1.0.0' });
    const result = await scanBundle(out, { isMedia });

    expect(result).toMatchObject({
      folderName: 'lost-mine',
      title: 'Lost Mine',
      description: 'A mine, lost.',
      system: 'dnd5e',
      hasManifest: true,
      hasAgentRules: true,
      // The card (campaign.md) and agents.md are counted apart from the notes.
      counts: { notes: 2, assets: 1, encounters: 1, maps: 1, templates: 1 },
      skipped: [],
      warnings: [],
    });
  });
});
