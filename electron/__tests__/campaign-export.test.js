import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const yauzl = require('yauzl');
const exportModel = require('../models/campaign-export.model');
const bundle = require('../models/campaign-bundle.model');
const campaignModel = require('../models/campaign.model');
const sectionModel = require('../models/section.model');
const templateModel = require('../models/template.model');
const battleRuleModel = require('../models/battle-rule.model');
const { ZIP_LIMITS } = require('../utils/zip-limits');

const { ExportLimitError, SKIP_REASONS, assertDestination, collectCampaignFiles, exportCampaign } =
  exportModel;
const isMedia = (name) => /\.(png|jpg|pdf|mp3)$/i.test(name);

let root;
let vault;
let out;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-export-'));
  vault = path.join(root, 'codex');
  out = path.join(root, 'out');
  fs.mkdirSync(path.join(vault, '.lazydm'), { recursive: true });
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(vault, '.lazydm', 'vault.json'), '{"schemaVersion":1,"name":"t"}\n');
  await campaignModel.createCampaign(vault, {
    slug: 'lost-mine',
    name: 'Lost Mine',
    description: 'A mine, lost.',
    system: 'dnd5e',
  });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const put = (rel, content = '# x\n') => {
  const file = path.join(vault, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

/** Entries of a zip as { name: Buffer }, read with yauzl like the importer will. */
function readZip(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (error, zip) => {
      if (error) {
        reject(error);
        return;
      }
      const entries = {};
      zip.on('error', reject);
      zip.on('end', () => resolve(entries));
      zip.on('entry', (entry) => {
        if (entry.fileName.endsWith('/')) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) {
            reject(streamError);
            return;
          }
          const chunks = [];
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('end', () => {
            entries[entry.fileName] = Buffer.concat(chunks);
            zip.readEntry();
          });
          stream.on('error', reject);
        });
      });
      zip.readEntry();
    });
  });
}

const options = { isMedia, appVersion: '1.0.0' };

describe('collectCampaignFiles', () => {
  it('takes notes, encounters, maps and media, in code-point order', async () => {
    put('lost-mine/scenes/intro.md');
    put('lost-mine/enemies/humans/bandit.md');
    put('lost-mine/encounters/ambush.json', '{}');
    put('lost-mine/maps/cave.json', '{}');
    put('lost-mine/assets/cave.png', 'png');
    put('lost-mine/assets/theme.mp3', 'mp3');

    const { files, skipped } = await collectCampaignFiles(vault, 'lost-mine', isMedia);

    expect(files.map((file) => file.rel)).toEqual([
      'assets/cave.png',
      'assets/theme.mp3',
      'campaign.md',
      'encounters/ambush.json',
      'enemies/humans/bandit.md',
      'maps/cave.json',
      'scenes/intro.md',
    ]);
    expect(skipped).toEqual([]);
  });

  it('leaves out the party roster and hidden entries without listing them, and lists links', async () => {
    put('lost-mine/encounters/_party.json', '{"players":["A real name"]}');
    put('lost-mine/.obsidian/app.json', '{}');
    put('lost-mine/scenes/.hidden.md');
    put('lost-mine/scenes/intro.md');
    fs.symlinkSync(
      path.join(vault, 'lost-mine', 'scenes', 'intro.md'),
      path.join(vault, 'lost-mine', 'scenes', 'link.md'),
    );
    fs.symlinkSync(root, path.join(vault, 'lost-mine', 'outside'));

    const { files, skipped } = await collectCampaignFiles(vault, 'lost-mine', isMedia);

    expect(files.map((file) => file.rel).join()).not.toMatch(/_party|obsidian|hidden|link\.md|outside/);
    expect(skipped).toEqual([
      { path: 'outside', reason: SKIP_REASONS.symlink },
      { path: 'scenes/link.md', reason: SKIP_REASONS.symlink },
    ]);
  });

  it('skips files the importer would refuse, and says why', async () => {
    put('lost-mine/assets/script.sh', 'rm -rf');
    put('lost-mine/assets/app.exe', 'MZ');
    put('lost-mine/world/data.json', '{}');
    put('lost-mine/scenes/con.md');
    put('lost-mine/scenes/odd?.md');
    put('lost-mine/lazydm.json', '{"formatVersion":1}');

    const { files, skipped } = await collectCampaignFiles(vault, 'lost-mine', isMedia);

    expect(skipped).toEqual([
      { path: 'assets/app.exe', reason: SKIP_REASONS.type },
      { path: 'assets/script.sh', reason: SKIP_REASONS.type },
      { path: 'lazydm.json', reason: SKIP_REASONS.reserved },
      { path: 'scenes/con.md', reason: SKIP_REASONS.name },
      { path: 'scenes/odd?.md', reason: SKIP_REASONS.name },
      { path: 'world/data.json', reason: SKIP_REASONS.type },
    ]);
    expect(files.map((file) => file.rel)).toEqual(['campaign.md']);
  });

  it('skips a note or a medium over its own size cap', async () => {
    put('lost-mine/scenes/long.md', 'x'.repeat(ZIP_LIMITS.maxTextBytes + 1));
    put('lost-mine/scenes/ok.md', 'x'.repeat(ZIP_LIMITS.maxTextBytes));
    put('lost-mine/assets/big.png', 'x'.repeat(50));

    const { files, skipped } = await collectCampaignFiles(vault, 'lost-mine', isMedia, {
      ...ZIP_LIMITS,
      maxMediaBytes: 10,
    });

    expect(skipped).toEqual([
      { path: 'assets/big.png', reason: SKIP_REASONS.tooLarge },
      { path: 'scenes/long.md', reason: SKIP_REASONS.tooLarge },
    ]);
    expect(files.map((file) => file.rel)).toContain('scenes/ok.md');
  });

  it('refuses a campaign with more files than the entry cap', async () => {
    for (let index = 0; index < 5; index += 1) {
      put(`lost-mine/scenes/n${index}.md`);
    }

    await expect(
      collectCampaignFiles(vault, 'lost-mine', isMedia, { ...ZIP_LIMITS, maxEntries: 3 }),
    ).rejects.toBeInstanceOf(ExportLimitError);
  });

  it('refuses a campaign over the total size cap', async () => {
    put('lost-mine/scenes/a.md', 'x'.repeat(100));
    put('lost-mine/scenes/b.md', 'x'.repeat(100));

    await expect(
      collectCampaignFiles(vault, 'lost-mine', isMedia, { ...ZIP_LIMITS, maxTotalBytes: 150 }),
    ).rejects.toThrow(/too big/);
  });
});

describe('exportCampaign', () => {
  it('writes a zip with the manifest first and the campaign folder after it', async () => {
    put('lost-mine/scenes/intro.md', '# Intro\n');
    put('lost-mine/assets/cave.png', 'png-bytes');
    put('lost-mine/encounters/ambush.json', '{"version":1}');
    put('lost-mine/agents.md', 'Be nice.');
    const destination = path.join(out, 'lost-mine.zip');

    const result = await exportCampaign(vault, 'lost-mine', destination, options);

    expect(result.path).toBe(path.join(fs.realpathSync(out), 'lost-mine.zip'));
    expect(result.skipped).toEqual([]);
    const entries = await readZip(destination);
    expect(Object.keys(entries)).toEqual([
      'lost-mine/lazydm.json',
      'lost-mine/agents.md',
      'lost-mine/assets/cave.png',
      'lost-mine/campaign.md',
      'lost-mine/encounters/ambush.json',
      'lost-mine/scenes/intro.md',
    ]);
    expect(result.files).toBe(6);
    expect(result.bytes).toBe(fs.statSync(destination).size);
    expect(entries['lost-mine/scenes/intro.md'].toString()).toBe('# Intro\n');
    expect(entries['lost-mine/assets/cave.png'].toString()).toBe('png-bytes');
  });

  it('writes a manifest that parses back to the campaign settings', async () => {
    sectionModel.saveCampaignSectionSettings(vault, 'lost-mine', {
      hidden: ['spells'],
      labels: { characters: 'NPCs' },
    });
    battleRuleModel.setCampaignChoice(vault, 'lost-mine', 'builtin:dnd5e');
    const destination = path.join(out, 'a.zip');

    await exportCampaign(vault, 'lost-mine', destination, options);
    const entries = await readZip(destination);
    const { manifest, warnings } = bundle.parseManifest(entries['lost-mine/lazydm.json']);

    expect(warnings).toEqual([]);
    expect(manifest).toMatchObject({
      title: 'Lost Mine',
      system: 'dnd5e',
      battleRule: 'builtin:dnd5e',
      sections: { hidden: ['spells'], labels: { characters: 'NPCs' } },
    });
    const text = entries['lost-mine/lazydm.json'].toString();
    expect(text).not.toContain(vault);
    expect(text).toContain('"version": "1.0.0"');
  });

  it('never includes the party roster, hidden files or links', async () => {
    put('lost-mine/encounters/_party.json', '{"players":["A real name"]}');
    put('lost-mine/.obsidian/app.json', '{}');
    fs.symlinkSync(root, path.join(vault, 'lost-mine', 'outside'));
    const destination = path.join(out, 'b.zip');

    await exportCampaign(vault, 'lost-mine', destination, options);
    const names = Object.keys(await readZip(destination)).join('\n');

    expect(names).not.toMatch(/_party|obsidian|outside|\.lazydm/);
  });

  it('copies templates from outside the campaign and points the manifest at the copies', async () => {
    put('_templates/enemy.md', '---\ntitle: "{{title}}"\n---\nroot enemy\n');
    put('compendium/dnd/_templates/enemy.md', '---\ntitle: "{{title}}"\n---\nsystem enemy\n');
    put('lost-mine/_templates/scene.md', '---\ntitle: "{{title}}"\n---\nown scene\n');
    templateModel.setCampaignRule(vault, 'lost-mine', 'enemy', '_templates/enemy.md');
    templateModel.setCampaignRule(
      vault,
      'lost-mine',
      'spell',
      'compendium/dnd/_templates/enemy.md',
    );
    templateModel.setCampaignRule(vault, 'lost-mine', 'scene', 'lost-mine/_templates/scene.md');
    templateModel.setCampaignRule(vault, 'lost-mine', 'item', 'builtin@dnd5e');
    const destination = path.join(out, 'c.zip');

    const result = await exportCampaign(vault, 'lost-mine', destination, options);
    const entries = await readZip(destination);
    const { manifest } = bundle.parseManifest(entries['lost-mine/lazydm.json']);

    expect(Object.keys(entries)).toEqual(
      expect.arrayContaining([
        'lost-mine/_templates/scene.md',
        'lost-mine/_templates/enemy.md',
        'lost-mine/_templates/enemy-2.md',
      ]),
    );
    expect(manifest.templates).toEqual({
      scene: '_templates/scene.md',
      enemy: '_templates/enemy.md',
      spell: '_templates/enemy-2.md',
      item: 'builtin@dnd5e',
    });
    expect(entries['lost-mine/_templates/enemy.md'].toString()).toContain('root enemy');
    expect(entries['lost-mine/_templates/enemy-2.md'].toString()).toContain('system enemy');
    expect(result.droppedTemplates).toBe(0);
  });

  it('leaves out a template choice whose file is gone', async () => {
    put('_templates/enemy.md', '---\ntitle: "{{title}}"\n---\n');
    templateModel.setCampaignRule(vault, 'lost-mine', 'enemy', '_templates/enemy.md');
    fs.rmSync(path.join(vault, '_templates', 'enemy.md'));
    const destination = path.join(out, 'd.zip');

    await exportCampaign(vault, 'lost-mine', destination, options);
    const { manifest } = bundle.parseManifest(
      (await readZip(destination))['lost-mine/lazydm.json'],
    );

    expect(manifest.templates).toEqual({});
  });

  it('gives the same entries and bytes for the same campaign', async () => {
    put('lost-mine/scenes/intro.md', '# Intro\n');
    put('lost-mine/assets/cave.png', 'png-bytes');
    const first = path.join(out, 'one.zip');
    const second = path.join(out, 'two.zip');

    await exportCampaign(vault, 'lost-mine', first, options);
    await exportCampaign(vault, 'lost-mine', second, options);

    expect(await readZip(second)).toEqual(await readZip(first));
  });

  it('does not touch the Codex', async () => {
    put('lost-mine/scenes/intro.md', '# Intro\n');
    const snapshot = () =>
      fs
        .readdirSync(vault, { recursive: true })
        .sort()
        .map((entry) => `${entry}:${fs.statSync(path.join(vault, entry)).mtimeMs}`)
        .join('\n');
    const before = snapshot();

    await exportCampaign(vault, 'lost-mine', path.join(out, 'e.zip'), options);

    expect(snapshot()).toBe(before);
  });

  it('leaves nothing half-written when a file cannot be read', async () => {
    put('lost-mine/scenes/intro.md', '# Intro\n');
    const destination = path.join(out, 'f.zip');
    const original = fs.createReadStream;
    fs.createReadStream = (file, ...rest) =>
      original(String(file).endsWith('intro.md') ? path.join(root, 'missing') : file, ...rest);

    try {
      await expect(exportCampaign(vault, 'lost-mine', destination, options)).rejects.toThrow();
    } finally {
      fs.createReadStream = original;
    }

    expect(fs.existsSync(destination)).toBe(false);
    expect(fs.readdirSync(out)).toEqual([]);
  });

  it('replaces an existing zip only when overwriting is allowed', async () => {
    const destination = path.join(out, 'g.zip');
    fs.writeFileSync(destination, 'old');

    await expect(
      exportCampaign(vault, 'lost-mine', destination, { ...options, overwrite: false }),
    ).rejects.toThrow(/already exists/);
    expect(fs.readFileSync(destination, 'utf8')).toBe('old');

    await exportCampaign(vault, 'lost-mine', destination, options);
    expect(fs.readFileSync(destination).subarray(0, 2).toString()).toBe('PK');
  });
});

describe('assertDestination', () => {
  const settings = () => ({ vaultPath: vault, allowInsideVault: false, overwrite: false });

  it('accepts a new .zip in an existing folder outside the Codex', async () => {
    expect(await assertDestination(path.join(out, 'new.zip'), settings())).toBe(
      path.join(fs.realpathSync(out), 'new.zip'),
    );
  });

  it.each([
    ['a relative path', () => 'relative/x.zip', /absolute/],
    ['a non-string', () => 42, /absolute/],
    ['a wrong extension', () => path.join(out, 'x.txt'), /\.zip/],
    ['a missing folder', () => path.join(out, 'nope', 'x.zip'), /does not exist/],
  ])('refuses %s', async (_name, destination, message) => {
    await expect(assertDestination(destination(), settings())).rejects.toThrow(message);
  });

  it('refuses a destination inside the Codex when it is off limits', async () => {
    await expect(
      assertDestination(path.join(vault, 'lost-mine', 'x.zip'), settings()),
    ).rejects.toThrow(/outside the Codex/);
    await expect(
      assertDestination(path.join(vault, 'x.zip'), { ...settings(), allowInsideVault: true }),
    ).resolves.toBeTruthy();
  });

  it('refuses a destination reached through a link into the Codex', async () => {
    const link = path.join(out, 'into-codex');
    fs.symlinkSync(vault, link);

    await expect(assertDestination(path.join(link, 'x.zip'), settings())).rejects.toThrow(
      /outside the Codex/,
    );
  });

  it('refuses an existing file unless overwriting, and always a folder', async () => {
    fs.writeFileSync(path.join(out, 'taken.zip'), 'x');
    await expect(assertDestination(path.join(out, 'taken.zip'), settings())).rejects.toThrow(
      /already exists/,
    );
    await expect(
      assertDestination(path.join(out, 'taken.zip'), { ...settings(), overwrite: true }),
    ).resolves.toBeTruthy();

    fs.mkdirSync(path.join(out, 'dir.zip'));
    await expect(
      assertDestination(path.join(out, 'dir.zip'), { ...settings(), overwrite: true }),
    ).rejects.toThrow(/folder/);
  });
});
