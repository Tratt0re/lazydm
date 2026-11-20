import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { writeZip } = require('./helpers/raw-zip');
const importModel = require('../models/campaign-import.model');
const exportModel = require('../models/campaign-export.model');
const bundleModel = require('../models/campaign-bundle.model');
const campaignModel = require('../models/campaign.model');
const sectionModel = require('../models/section.model');
const templateModel = require('../models/template.model');
const battleRuleModel = require('../models/battle-rule.model');
const { readVaultConfig } = require('../models/vault.model');
const zipReader = require('../utils/zip-reader');
const { ZIP_LIMITS } = require('../utils/zip-limits');

const { ZIP_REFUSALS, ZipRefusedError } = zipReader;
const { IMPORT_SKIPS, importBundle } = importModel;
const isMedia = (name) => /\.(png|jpg|pdf|mp3)$/i.test(name);

let root;
let vault;
let reindexed;

const zipPath = (name = 'in.zip') => path.join(root, name);
const file = (name, data = 'x', extra = {}) => ({ name, data, ...extra });
const manifest = (value) => JSON.stringify({ formatVersion: 1, ...value });
const options = (extra = {}) => ({
  isMedia,
  reindex: async (paths) => {
    reindexed.push(...paths);
  },
  ...extra,
});
const read = (rel) => fs.readFileSync(path.join(vault, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(vault, rel));

/** Every entry of the Codex, relative and sorted (the config folder left out). */
const tree = () =>
  fs
    .readdirSync(vault, { recursive: true })
    .map(String)
    .filter((entry) => !entry.startsWith('.lazydm'))
    .sort();

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-import-'));
  vault = path.join(root, 'codex');
  reindexed = [];
  fs.mkdirSync(path.join(vault, '.lazydm'), { recursive: true });
  fs.writeFileSync(path.join(vault, '.lazydm', 'vault.json'), '{"schemaVersion":1,"name":"t"}\n');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

async function importZip(entries, extra) {
  writeZip(zipPath(), entries);
  return importBundle(vault, zipPath(), options(extra));
}

describe('importBundle: a campaign zip becomes a new campaign', () => {
  it('writes the notes, assets, encounters, maps and templates, and returns what it did', async () => {
    const result = await importZip([
      file(
        'lost-mine/lazydm.json',
        manifest({ title: 'Lost Mine', description: 'A mine.', system: 'dnd5e' }),
      ),
      file(
        'lost-mine/campaign.md',
        '---\ntitle: Lost Mine\ncover: assets/cover.png\n---\n# Lost Mine\n',
      ),
      file('lost-mine/agents.md', 'Be nice.'),
      file('lost-mine/_templates/scene.md', '---\ntitle: "{{title}}"\n---\n'),
      file('lost-mine/scenes/intro.md', '# Intro\n'),
      file('lost-mine/enemies/humans/bandit.md', '# Bandit\n'),
      file('lost-mine/encounters/ambush.json', '{"name":"Ambush","entities":[]}'),
      file('lost-mine/maps/cave.json', '{"name":"Cave"}'),
      file('lost-mine/assets/cave.png', Buffer.from([1, 2, 3, 4]), { method: 0 }),
    ]);

    expect(result).toMatchObject({
      slug: 'lost-mine',
      name: 'Lost Mine',
      skippedTotal: 0,
      warnings: [],
      counts: { notes: 2, assets: 1, encounters: 1, maps: 1, templates: 1 },
    });
    expect(read('lost-mine/scenes/intro.md')).toBe('# Intro\n');
    expect(read('lost-mine/agents.md')).toBe('Be nice.');
    expect(fs.readFileSync(path.join(vault, 'lost-mine/assets/cave.png'))).toEqual(
      Buffer.from([1, 2, 3, 4]),
    );
    expect(JSON.parse(read('lost-mine/encounters/ambush.json')).name).toBe('Ambush');
    expect(JSON.parse(read('lost-mine/maps/cave.json')).name).toBe('Cave');
    const card = await campaignModel.readCampaign(vault, 'lost-mine');
    expect(card).toMatchObject({ name: 'Lost Mine', description: 'A mine.', system: 'dnd5e' });
    expect(read('lost-mine/campaign.md')).toContain('cover: assets/cover.png');
    expect(result.files).toBe(reindexed.length);
    expect(reindexed).toEqual(
      expect.arrayContaining([
        'lost-mine/campaign.md',
        'lost-mine/scenes/intro.md',
        'lost-mine/assets/cave.png',
        'lost-mine/encounters/ambush.json',
      ]),
    );
  });

  it('works for a plain folder of notes, with no manifest and no card', async () => {
    const result = await importZip([
      file('My Notes/scenes/a.md', '# A\n'),
      file('My Notes/world/b.md', '# B\n'),
    ]);

    expect(result.slug).toBe('my-notes');
    expect(read('my-notes/scenes/a.md')).toBe('# A\n');
    expect(await campaignModel.readCampaign(vault, 'my-notes')).toMatchObject({
      name: 'My Notes',
      system: null,
    });
  });

  it('applies the manifest settings to the new campaign only', async () => {
    const result = await importZip([
      file(
        'c/lazydm.json',
        manifest({
          title: 'Phandalin',
          system: 'pf2e',
          sections: {
            hidden: ['spells'],
            labels: { characters: 'NPCs' },
            custom: [{ key: 'factions', type: 'faction', label: 'Factions', icon: 'flag' }],
          },
          templates: {
            enemy: 'builtin@pf2e',
            scene: '_templates/scene.md',
            quest: '_templates/gone.md',
          },
          battleRule: 'builtin:pf2e',
        }),
      ),
      file('c/_templates/scene.md', '---\ntitle: "{{title}}"\n---\n'),
      file('c/factions/guild.md', '# Guild\n'),
    ]);

    expect(result.slug).toBe('phandalin');
    const settings = sectionModel.readCampaignSectionSettings(vault, 'phandalin');
    expect(settings.hidden).toEqual(['spells']);
    expect(settings.labels).toEqual({ characters: 'NPCs' });
    expect(settings.custom.map((section) => section.key)).toEqual(['factions']);
    expect(templateModel.readCampaignRules(vault, 'phandalin')).toEqual({
      enemy: 'builtin@pf2e',
      scene: 'phandalin/_templates/scene.md',
    });
    expect(battleRuleModel.readCampaignChoice(vault, 'phandalin')).toBe('builtin:pf2e');
    expect(result.warnings).toContainEqual({ code: 'template-missing', field: 'templates' });
    expect(Object.keys(readVaultConfig(vault).sections.campaigns)).toEqual(['phandalin']);
  });

  it('takes the name the user typed, and the slug follows it', async () => {
    const result = await importZip(
      [file('c/lazydm.json', manifest({ title: 'Original' })), file('c/a.md')],
      { name: 'My Own Name' },
    );

    expect(result).toMatchObject({ slug: 'my-own-name', name: 'My Own Name' });
    expect(await campaignModel.readCampaign(vault, 'my-own-name')).toMatchObject({
      name: 'My Own Name',
    });
  });

  it('keeps the card, but not a system the app does not ship', async () => {
    const result = await importZip([
      file('c/campaign.md', '---\ntitle: C\nsystem: starfinder\n---\n# C\n'),
      file('c/a.md'),
    ]);

    expect(result.warnings).toContainEqual({ code: 'unknown-system', field: 'system' });
    expect((await campaignModel.readCampaign(vault, result.slug)).system).toBeNull();
  });
});

describe('importBundle: never overwrites, never merges', () => {
  it('gives a taken name a suffix and leaves the campaign that is there as it was', async () => {
    await campaignModel.createCampaign(vault, { slug: 'lost-mine', name: 'Lost Mine' });
    fs.mkdirSync(path.join(vault, 'lost-mine', 'scenes'));
    fs.writeFileSync(path.join(vault, 'lost-mine', 'scenes', 'mine.md'), 'MINE');
    const before = tree();

    const result = await importZip([
      file('lost-mine/lazydm.json', manifest({ title: 'Lost Mine' })),
      file('lost-mine/scenes/mine.md', 'THEIRS'),
    ]);

    expect(result.slug).toBe('lost-mine-2');
    expect(read('lost-mine/scenes/mine.md')).toBe('MINE');
    expect(read('lost-mine-2/scenes/mine.md')).toBe('THEIRS');
    expect(tree().filter((entry) => !entry.startsWith('lost-mine-2'))).toEqual(before);
  });

  it('counts up for a third import of the same zip', async () => {
    writeZip(zipPath(), [file('c/lazydm.json', manifest({ title: 'Same' })), file('c/a.md')]);

    const slugs = [];
    for (let index = 0; index < 3; index += 1) {
      slugs.push((await importBundle(vault, zipPath(), options())).slug);
    }

    expect(slugs).toEqual(['same', 'same-2', 'same-3']);
  });

  it('never takes the name of a folder that is not a campaign', async () => {
    fs.mkdirSync(path.join(vault, 'compendium'));
    fs.mkdirSync(path.join(vault, '_templates'));

    const result = await importZip([
      file('c/lazydm.json', manifest({ title: 'Compendium' })),
      file('c/a.md'),
    ]);

    expect(result.slug).toBe('compendium-2');
  });

  it('takes the name of an existing folder without case as taken', async () => {
    fs.mkdirSync(path.join(vault, 'Lost-Mine'));

    const result = await importZip([
      file('c/lazydm.json', manifest({ title: 'Lost Mine' })),
      file('c/a.md'),
    ]);

    expect(result.slug).toBe('lost-mine-2');
  });

  it('copes with a title that has no letters at all', async () => {
    const result = await importZip([
      file('c/lazydm.json', manifest({ title: '!!!' })),
      file('c/a.md'),
    ]);

    expect(result.slug).toBe('c');
  });
});

describe('importBundle: what it leaves out', () => {
  it('never writes the party roster, hidden files or files of types it does not take', async () => {
    const result = await importZip([
      file('c/scenes/a.md'),
      file('c/encounters/_party.json', '{"players":["A real name"]}'),
      file('c/.DS_Store'),
      file('c/assets/app.exe', 'MZ'),
      file('c/scenes/run.sh', 'rm -rf'),
      file('c/scenes/con.md'),
    ]);

    expect(exists(`${result.slug}/encounters`)).toBe(false);
    expect(exists(`${result.slug}/assets`)).toBe(false);
    expect(exists(`${result.slug}/.DS_Store`)).toBe(false);
    expect(exists(`${result.slug}/scenes/run.sh`)).toBe(false);
    expect(exists(`${result.slug}/scenes/con.md`)).toBe(false);
    expect(result.skippedTotal).toBe(4);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        { path: 'assets/app.exe', reason: IMPORT_SKIPS.type },
        { path: 'scenes/run.sh', reason: IMPORT_SKIPS.type },
        { path: 'scenes/con.md', reason: IMPORT_SKIPS.name },
        { path: 'encounters/_party.json', reason: IMPORT_SKIPS.party },
      ]),
    );
  });

  it('skips an encounter or a map that is not JSON, and says so', async () => {
    const result = await importZip([
      file('c/encounters/good.json', '{"name":"Good"}'),
      file('c/encounters/broken.json', '{nope'),
      file('c/encounters/list.json', '[1,2,3]'),
      file('c/maps/null.json', 'null'),
      file('c/scenes/a.md'),
    ]);

    expect(exists(`${result.slug}/encounters/good.json`)).toBe(true);
    expect(exists(`${result.slug}/encounters/broken.json`)).toBe(false);
    expect(exists(`${result.slug}/encounters/list.json`)).toBe(false);
    expect(exists(`${result.slug}/maps/null.json`)).toBe(false);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        { path: 'encounters/broken.json', reason: IMPORT_SKIPS.invalid },
        { path: 'encounters/list.json', reason: IMPORT_SKIPS.invalid },
        { path: 'maps/null.json', reason: IMPORT_SKIPS.invalid },
      ]),
    );
  });

  it('writes encounters and maps as the app itself would read them, dropping what it does not know', async () => {
    const result = await importZip([
      file(
        'c/encounters/e.json',
        JSON.stringify({
          name: 'E',
          hacked: '<script>',
          entities: [{ id: 'a', name: 'Orc', evil: 1 }, 'text', { id: 'a' }],
        }),
      ),
      file(
        'c/maps/m.json',
        JSON.stringify({ name: 'M', image: '../../etc/passwd', pins: 'no', extra: true }),
      ),
    ]);

    const encounter = JSON.parse(read(`${result.slug}/encounters/e.json`));
    expect(encounter).not.toHaveProperty('hacked');
    expect(encounter.entities).toHaveLength(1);
    expect(encounter.entities[0]).not.toHaveProperty('evil');
    const map = JSON.parse(read(`${result.slug}/maps/m.json`));
    expect(map.image).toBeNull();
    expect(map).not.toHaveProperty('extra');
    expect(map.pins).toEqual([]);
  });
});

describe('importBundle: a bad zip writes nothing', () => {
  /** Runs the import, expects it to fail, and checks the Codex is exactly as it was. */
  async function failsWith(entries, extra) {
    writeZip(zipPath(), entries);
    const before = tree();
    const configBefore = readVaultConfig(vault);
    let caught = null;
    try {
      await importBundle(vault, zipPath(), options(extra));
    } catch (error) {
      caught = error;
    }

    expect(caught).not.toBeNull();
    expect(tree()).toEqual(before);
    expect(readVaultConfig(vault)).toEqual(configBefore);
    expect(reindexed).toEqual([]);
    return caught;
  }

  it.each([
    ['zip-slip', [file('c/a.md'), file('c/../../evil.md')], ZIP_REFUSALS.unsafePath],
    ['a link', [file('c/a.md'), file('c/l', 'x', { mode: 0o120777 })], ZIP_REFUSALS.specialFile],
    ['encryption', [file('c/a.md', 'x', { flags: 1 })], ZIP_REFUSALS.encrypted],
    ['two folders', [file('a/x.md'), file('b/y.md')], ZIP_REFUSALS.multipleFolders],
    ['duplicates', [file('c/a.md'), file('c/A.md')], ZIP_REFUSALS.duplicate],
    ['no folder', [file('a.md')], ZIP_REFUSALS.noFolder],
    [
      'a newer version',
      [file('c/lazydm.json', '{"formatVersion":2}'), file('c/a.md')],
      ZIP_REFUSALS.newerVersion,
    ],
  ])('refuses %s before it creates anything', async (_name, entries, code) => {
    const error = await failsWith(entries);

    expect(error).toBeInstanceOf(ZipRefusedError);
    expect(error.code).toBe(code);
  });

  it('refuses a file that is not a zip', async () => {
    fs.writeFileSync(zipPath(), 'not a zip');

    await expect(importBundle(vault, zipPath(), options())).rejects.toMatchObject({
      code: ZIP_REFUSALS.notAZip,
    });
    expect(tree()).toEqual([]);
  });

  it('removes the new campaign and its settings when an entry turns out bad half-way', async () => {
    const error = await failsWith([
      file('c/lazydm.json', manifest({ title: 'Doomed', sections: { hidden: ['spells'] } })),
      file('c/scenes/a.md', '# fine\n'),
      file('c/scenes/b.md', 'hello', { crc: 4242 }),
      file('c/scenes/c.md', '# never reached\n'),
    ]);

    expect(error.code).toBe(ZIP_REFUSALS.corrupt);
  });

  it('removes the new campaign when an entry lies about its size', async () => {
    const error = await failsWith([
      file('c/scenes/a.md', '# fine\n'),
      file('c/scenes/big.md', 'x'.repeat(3000), { declaredUncompressed: 10 }),
    ]);

    expect(error).toBeInstanceOf(Error);
  });

  it('refuses a zip that unpacks past the total cap before it creates anything', async () => {
    const error = await failsWith(
      [
        file('c/a.md', 'a'.repeat(300)),
        file('c/b.md', 'b'.repeat(300)),
        file('c/c.md', 'c'.repeat(300)),
      ],
      { limits: { ...ZIP_LIMITS, maxTotalBytes: 700 } },
    );

    expect(error.code).toBe(ZIP_REFUSALS.tooManyBytes);
  });

  it('forgets the settings it already wrote when a later step fails', async () => {
    writeZip(zipPath(), [
      file('c/lazydm.json', manifest({ title: 'Doomed', sections: { hidden: ['spells'] } })),
      file('c/a.md'),
    ]);
    const realApply = bundleModel.applyManifest;
    bundleModel.applyManifest = (...args) => {
      realApply(...args);
      // The settings are in the vault config now; fail as if a later write went wrong.
      expect(readVaultConfig(vault).sections.campaigns.doomed.hidden).toEqual(['spells']);
      throw new Error('disk full');
    };

    try {
      await expect(importBundle(vault, zipPath(), options())).rejects.toThrow('disk full');
    } finally {
      bundleModel.applyManifest = realApply;
    }

    expect(tree()).toEqual([]);
    expect(readVaultConfig(vault).sections?.campaigns?.doomed).toBeUndefined();
    expect(reindexed).toEqual([]);
  });

  it('does not touch another campaign when it fails', async () => {
    await campaignModel.createCampaign(vault, { slug: 'keep', name: 'Keep' });
    sectionModel.saveCampaignSectionSettings(vault, 'keep', { hidden: ['spells'] });

    await failsWith([
      file('c/lazydm.json', manifest({ title: 'Doomed', sections: { hidden: ['world'] } })),
      file('c/a.md', 'hello', { crc: 1 }),
    ]);

    expect(sectionModel.readCampaignSectionSettings(vault, 'keep').hidden).toEqual(['spells']);
  });
});

describe('importBundle: a zip that changed after the scan', () => {
  it('checks everything again, so a zip swapped for a hostile one is refused', async () => {
    writeZip(zipPath(), [file('c/a.md')]);
    const preview = await importModel.scanBundle(zipPath(), { isMedia });
    expect(preview.counts.notes).toBe(1);

    writeZip(zipPath(), [file('c/a.md'), file('c/../../evil.md')]);

    await expect(importBundle(vault, zipPath(), options())).rejects.toMatchObject({
      code: ZIP_REFUSALS.unsafePath,
    });
    expect(tree()).toEqual([]);
    expect(fs.existsSync(path.join(root, 'evil.md'))).toBe(false);
  });
});

describe('export then import: a round trip', () => {
  let source;

  beforeEach(async () => {
    source = path.join(root, 'source');
    fs.mkdirSync(path.join(source, '.lazydm'), { recursive: true });
    fs.writeFileSync(
      path.join(source, '.lazydm', 'vault.json'),
      '{"schemaVersion":1,"name":"s"}\n',
    );
    await campaignModel.createCampaign(source, {
      slug: 'lost-mine',
      name: 'Lost Mine',
      description: 'A mine, lost.',
      system: 'dnd5e',
    });
  });

  const put = (rel, content = '# x\n') => {
    const target = path.join(source, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };

  it('brings back the same files, card, settings and templates in an empty Codex', async () => {
    put('lost-mine/scenes/intro.md', '# Intro\n[[bandit]]\n');
    put('lost-mine/enemies/humans/bandit.md', '---\nhp: 11\n---\n# Bandit\n');
    put('lost-mine/encounters/ambush.json', '{"name":"Ambush","entities":[{"id":"a","name":"Orc"}]}');
    put('lost-mine/encounters/_party.json', '{"entities":[{"id":"p","name":"A real name"}]}');
    put('lost-mine/maps/cave.json', '{"name":"Cave"}');
    put('lost-mine/assets/cave.png', 'png-bytes');
    put('lost-mine/agents.md', 'Be nice.');
    put('_templates/enemy.md', '---\ntitle: "{{title}}"\nhp: \n---\n');
    sectionModel.saveCampaignSectionSettings(source, 'lost-mine', {
      hidden: ['spells'],
      labels: { characters: 'NPCs' },
      custom: [{ label: 'Factions', type: 'faction', icon: 'flag', description: 'Who.' }],
    });
    templateModel.setCampaignRule(source, 'lost-mine', 'enemy', '_templates/enemy.md');
    templateModel.setCampaignRule(source, 'lost-mine', 'item', 'builtin@dnd5e');
    battleRuleModel.setCampaignChoice(source, 'lost-mine', 'builtin:dnd5e');
    const out = path.join(root, 'out.zip');
    await exportModel.exportCampaign(source, 'lost-mine', out, { isMedia, appVersion: '1.0.0' });

    const result = await importBundle(vault, out, options());

    expect(result.slug).toBe('lost-mine');
    expect(result.skippedTotal).toBe(0);
    expect(result.warnings).toEqual([]);
    // Notes, media and agent rules come back byte for byte.
    for (const rel of [
      'scenes/intro.md',
      'enemies/humans/bandit.md',
      'assets/cave.png',
      'agents.md',
    ]) {
      expect(read(`lost-mine/${rel}`)).toBe(
        fs.readFileSync(path.join(source, 'lost-mine', rel), 'utf8'),
      );
    }
    // Encounters and maps are written in the app's own form (defaults filled in), with the same content.
    expect(JSON.parse(read('lost-mine/encounters/ambush.json')).entities[0].name).toBe('Orc');
    expect(JSON.parse(read('lost-mine/maps/cave.json'))).toMatchObject({ name: 'Cave', pins: [] });
    expect(exists('lost-mine/encounters/_party.json')).toBe(false);
    expect(await campaignModel.readCampaign(vault, 'lost-mine')).toMatchObject({
      name: 'Lost Mine',
      description: 'A mine, lost.',
      system: 'dnd5e',
    });
    const settings = sectionModel.readCampaignSectionSettings(vault, 'lost-mine');
    expect(settings.hidden).toEqual(['spells']);
    expect(settings.labels).toEqual({ characters: 'NPCs' });
    expect(settings.custom.map((section) => section.key)).toEqual(['factions']);
    expect(templateModel.readCampaignRules(vault, 'lost-mine')).toEqual({
      enemy: 'lost-mine/_templates/enemy.md',
      item: 'builtin@dnd5e',
    });
    expect(read('lost-mine/_templates/enemy.md')).toContain('hp:');
    expect(battleRuleModel.readCampaignChoice(vault, 'lost-mine')).toBe('builtin:dnd5e');
  });

  it('gives the same settings when the imported campaign is exported again', async () => {
    put('lost-mine/scenes/intro.md', '# Intro\n');
    sectionModel.saveCampaignSectionSettings(source, 'lost-mine', {
      hidden: ['spells'],
      labels: { characters: 'NPCs' },
    });
    battleRuleModel.setCampaignChoice(source, 'lost-mine', 'builtin:pf2e');
    const first = path.join(root, 'first.zip');
    await exportModel.exportCampaign(source, 'lost-mine', first, { isMedia });
    await importBundle(vault, first, options());
    const second = path.join(root, 'second.zip');

    await exportModel.exportCampaign(vault, 'lost-mine', second, { isMedia });

    const settingsOf = async (zip) => {
      const archive = await zipReader.openZip(zip);
      try {
        const entry = archive.entries.find((item) => item.name.endsWith('lazydm.json'));
        return bundleModel.parseManifest(await zipReader.readEntryBuffer(archive, entry)).manifest;
      } finally {
        archive.close();
      }
    };
    expect(await settingsOf(second)).toEqual(await settingsOf(first));
  });
});
