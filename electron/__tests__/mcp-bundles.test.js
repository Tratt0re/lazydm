import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createMcpServer } = require('../mcp/tools');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { writeZip } = require('./helpers/raw-zip');
const campaignModel = require('../models/campaign.model');
const sectionModel = require('../models/section.model');
const templateModel = require('../models/template.model');
const battleRuleModel = require('../models/battle-rule.model');
const yauzl = require('yauzl');

const isMedia = (name) => /\.(png|jpg|pdf|mp3)$/i.test(name);

let root;
let codex;
let outside;
let client = null;
let server = null;
let reindexed;

/** The app's own controllers are replaced by what the bundle tools need: the Codex path, the media test, reindex. */
async function connect(options) {
  const controllers = {
    vaultPath: () => codex,
    reindex: vi.fn(async (paths) => {
      reindexed.push(...paths);
    }),
    asset: { isMediaFileName: isMedia },
    campaign: {
      list: async () => ({ rows: [] }),
      getAgentRules: async () => ({ exists: false }),
    },
  };
  server = createMcpServer({ controllers, ...options });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'test', version: '0' });
  await client.connect(clientTransport);
}

async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content[0].text;
  let json = null;
  try {
    json = result.isError ? null : JSON.parse(text);
  } catch {
    json = null;
  }
  return { isError: result.isError === true, text, json };
}

function put(rel, content = '# x\n') {
  const target = path.join(codex, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function entriesOf(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (error, zip) => {
      if (error) {
        reject(error);
        return;
      }
      const names = [];
      zip.on('entry', (entry) => {
        names.push(entry.fileName);
        zip.readEntry();
      });
      zip.on('end', () => resolve(names));
      zip.on('error', reject);
      zip.readEntry();
    });
  });
}

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-mcp-bundle-'));
  codex = path.join(root, 'codex');
  outside = path.join(root, 'outside');
  reindexed = [];
  fs.mkdirSync(path.join(codex, '.lazydm'), { recursive: true });
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(codex, '.lazydm', 'vault.json'), '{"schemaVersion":1,"name":"t"}\n');
  await campaignModel.createCampaign(codex, {
    slug: 'lost-mine',
    name: 'Lost Mine',
    description: 'A mine, lost.',
    system: 'dnd5e',
  });
  await campaignModel.createCampaign(codex, { slug: 'other', name: 'Other' });
});

afterEach(async () => {
  await client?.close();
  await server?.close();
  client = null;
  server = null;
  fs.rmSync(root, { recursive: true, force: true });
});

describe('export_campaign', () => {
  it('writes the campaign as a zip outside the Codex and says what went in', async () => {
    await connect({ allowWrite: true });
    put('lost-mine/scenes/intro.md', '# Intro\n');
    put('lost-mine/encounters/_party.json', '{"entities":[{"id":"p","name":"A real name"}]}');
    const destination = path.join(outside, 'lost-mine.zip');

    const result = await call('export_campaign', { slug: 'lost-mine', destination });

    expect(result.isError).toBe(false);
    expect(result.json).toMatchObject({ slug: 'lost-mine', skipped: [] });
    expect(result.json.path).toBe(path.join(fs.realpathSync(outside), 'lost-mine.zip'));
    const names = await entriesOf(destination);
    expect(names).toEqual(
      expect.arrayContaining(['lost-mine/lazydm.json', 'lost-mine/scenes/intro.md']),
    );
    expect(names.join()).not.toContain('_party');
  });

  it('never overwrites a file that is there', async () => {
    await connect({ allowWrite: true });
    const destination = path.join(outside, 'taken.zip');
    fs.writeFileSync(destination, 'precious');

    const result = await call('export_campaign', { slug: 'lost-mine', destination });

    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/already exists/);
    expect(fs.readFileSync(destination, 'utf8')).toBe('precious');
  });

  it.each([
    ['inside the Codex', () => path.join(codex, 'lost-mine', 'x.zip'), /outside the Codex/],
    ['at the root of the Codex', () => path.join(codex, 'x.zip'), /outside the Codex/],
    ['a relative path', () => 'x.zip', /absolute/],
    ['a path that is not .zip', () => path.join(outside, 'x.txt'), /\.zip/],
    ['a folder that is not there', () => path.join(outside, 'nope', 'x.zip'), /does not exist/],
  ])('refuses a destination %s, and writes nothing', async (_name, destination, message) => {
    await connect({ allowWrite: true });
    const before = fs.readdirSync(codex).sort();

    const result = await call('export_campaign', { slug: 'lost-mine', destination: destination() });

    expect(result.isError).toBe(true);
    expect(result.text).toMatch(message);
    expect(fs.readdirSync(codex).sort()).toEqual(before);
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it('refuses a destination that reaches the Codex through a link', async () => {
    await connect({ allowWrite: true });
    fs.symlinkSync(codex, path.join(outside, 'into-codex'));

    const result = await call('export_campaign', {
      slug: 'lost-mine',
      destination: path.join(outside, 'into-codex', 'x.zip'),
    });

    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/outside the Codex/);
    expect(fs.existsSync(path.join(codex, 'x.zip'))).toBe(false);
  });

  it.each([
    ['one that is not there', 'nope'],
    ['a path', '../other'],
    ['a hidden folder', '.lazydm'],
    ['a nested path', 'lost-mine/scenes'],
    ['nothing', ''],
  ])('refuses %s as the campaign', async (_name, slug) => {
    await connect({ allowWrite: true });

    const result = await call('export_campaign', {
      slug,
      destination: path.join(outside, 'x.zip'),
    });

    expect(result.isError).toBe(true);
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it('under an access limit exports an allowed campaign, and not any other', async () => {
    await connect({ allowWrite: true, roots: ['lost-mine'] });

    const allowed = await call('export_campaign', {
      slug: 'lost-mine',
      destination: path.join(outside, 'a.zip'),
    });
    const refused = await call('export_campaign', {
      slug: 'other',
      destination: path.join(outside, 'b.zip'),
    });

    expect(allowed.isError).toBe(false);
    expect(refused.isError).toBe(true);
    expect(refused.text).toMatch(/Outside the scope/);
    expect(fs.existsSync(path.join(outside, 'b.zip'))).toBe(false);
  });

  it('under an access limit leaves out templates that live outside the campaign', async () => {
    await connect({ allowWrite: true, roots: ['lost-mine'] });
    put('_templates/enemy.md', '---\ntitle: "{{title}}"\n---\nroot secret\n');
    put('lost-mine/_templates/scene.md', '---\ntitle: "{{title}}"\n---\nown\n');
    templateModel.setCampaignRule(codex, 'lost-mine', 'enemy', '_templates/enemy.md');
    templateModel.setCampaignRule(codex, 'lost-mine', 'scene', 'lost-mine/_templates/scene.md');
    const destination = path.join(outside, 'limited.zip');

    const result = await call('export_campaign', { slug: 'lost-mine', destination });

    expect(result.isError).toBe(false);
    expect(result.json.droppedTemplates).toBe(1);
    const names = await entriesOf(destination);
    expect(names).toContain('lost-mine/_templates/scene.md');
    expect(names).not.toContain('lost-mine/_templates/enemy.md');
  });

  it('without a limit copies those templates in', async () => {
    await connect({ allowWrite: true });
    put('_templates/enemy.md', '---\ntitle: "{{title}}"\n---\nroot\n');
    templateModel.setCampaignRule(codex, 'lost-mine', 'enemy', '_templates/enemy.md');
    const destination = path.join(outside, 'full.zip');

    await call('export_campaign', { slug: 'lost-mine', destination });

    expect(await entriesOf(destination)).toContain('lost-mine/_templates/enemy.md');
  });

  it('does not change the Codex', async () => {
    await connect({ allowWrite: true });
    put('lost-mine/scenes/intro.md');
    const snapshot = () =>
      fs
        .readdirSync(codex, { recursive: true })
        .map(String)
        .sort()
        .map((entry) => `${entry}:${fs.statSync(path.join(codex, entry)).mtimeMs}`)
        .join('\n');
    const before = snapshot();

    await call('export_campaign', { slug: 'lost-mine', destination: path.join(outside, 'x.zip') });

    expect(snapshot()).toBe(before);
  });
});

describe('scan_import_source with a zip', () => {
  it('gives the same preview the modal shows, and writes nothing', async () => {
    await connect({ allowWrite: false });
    const zip = path.join(outside, 'in.zip');
    writeZip(zip, [
      {
        name: 'sunken/lazydm.json',
        data: '{"formatVersion":1,"title":"Sunken Vault","system":"pf2e"}',
      },
      { name: 'sunken/scenes/a.md', data: '# A\n' },
      { name: 'sunken/assets/run.sh', data: 'rm -rf' },
    ]);
    const before = fs.readdirSync(codex).sort();

    const result = await call('scan_import_source', { sourcePath: zip });

    expect(result.isError).toBe(false);
    expect(result.json).toMatchObject({
      kind: 'zip',
      title: 'Sunken Vault',
      system: 'pf2e',
      counts: { notes: 1 },
      skippedTotal: 1,
    });
    expect(fs.readdirSync(codex).sort()).toEqual(before);
  });

  it('still scans a folder as before', async () => {
    await connect({ allowWrite: false });
    const source = path.join(outside, 'notes');
    fs.mkdirSync(path.join(source, 'NPCs'), { recursive: true });
    fs.writeFileSync(path.join(source, 'NPCs', 'Boss.md'), 'Hello.\n');

    const result = await call('scan_import_source', { sourcePath: source });

    expect(result.json.folders.map((folder) => folder.name)).toEqual(['NPCs']);
    expect(result.json.kind).toBeUndefined();
  });

  it('refuses a zip inside the Codex', async () => {
    await connect({ allowWrite: false });
    const zip = path.join(codex, 'lost-mine', 'in.zip');
    writeZip(zip, [{ name: 'c/a.md', data: 'x' }]);

    const result = await call('scan_import_source', { sourcePath: zip });

    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/inside the Codex/);
  });

  it.each([
    ['a relative path', () => 'in.zip', /absolute/],
    ['a file that is not there', () => path.join(outside, 'gone.zip'), /not a zip/i],
  ])('refuses %s', async (_name, sourcePath, message) => {
    await connect({ allowWrite: false });

    const result = await call('scan_import_source', { sourcePath: sourcePath() });

    expect(result.isError).toBe(true);
    expect(result.text).toMatch(message);
  });

  it('refuses a hostile zip with a plain sentence', async () => {
    await connect({ allowWrite: false });
    const zip = path.join(outside, 'evil.zip');
    writeZip(zip, [
      { name: 'c/a.md', data: 'x' },
      { name: 'c/../../evil.md', data: 'x' },
    ]);

    const result = await call('scan_import_source', { sourcePath: zip });

    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/not allowed/);
  });

  it('is refused under an access limit', async () => {
    await connect({ allowWrite: false, roots: ['lost-mine'] });
    const zip = path.join(outside, 'in.zip');
    writeZip(zip, [{ name: 'c/a.md', data: 'x' }]);

    const result = await call('scan_import_source', { sourcePath: zip });

    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/limited to some campaigns/);
  });
});

describe('import_campaign with a zip', () => {
  const zipOf = (entries, name = 'in.zip') => {
    const target = path.join(outside, name);
    writeZip(target, entries);
    return target;
  };

  it('creates a new campaign with no mapping, and reindexes what it wrote', async () => {
    await connect({ allowWrite: true });
    const sourcePath = zipOf([
      {
        name: 'sunken/lazydm.json',
        data: '{"formatVersion":1,"title":"Sunken Vault","system":"dnd5e"}',
      },
      { name: 'sunken/scenes/a.md', data: '# A\n' },
    ]);

    const result = await call('import_campaign', { sourcePath });

    expect(result.isError).toBe(false);
    expect(result.json).toMatchObject({ dryRun: false, kind: 'zip', slug: 'sunken-vault' });
    expect(fs.readFileSync(path.join(codex, 'sunken-vault/scenes/a.md'), 'utf8')).toBe('# A\n');
    expect((await campaignModel.readCampaign(codex, 'sunken-vault')).system).toBe('dnd5e');
    expect(reindexed).toContain('sunken-vault/scenes/a.md');
  });

  it('dryRun only reports, and creates nothing', async () => {
    await connect({ allowWrite: true });
    const sourcePath = zipOf([{ name: 'sunken/scenes/a.md', data: '# A\n' }]);
    const before = fs.readdirSync(codex).sort();

    const result = await call('import_campaign', { sourcePath, dryRun: true });

    expect(result.json).toMatchObject({ dryRun: true, kind: 'zip', counts: { notes: 1 } });
    expect(fs.readdirSync(codex).sort()).toEqual(before);
    expect(reindexed).toEqual([]);
  });

  it('gives a name that is taken a free one, and leaves the campaign that is there', async () => {
    await connect({ allowWrite: true });
    put('lost-mine/scenes/mine.md', 'MINE');
    const sourcePath = zipOf([{ name: 'sunken/scenes/mine.md', data: 'THEIRS' }]);

    const result = await call('import_campaign', { sourcePath, name: 'Lost Mine' });

    expect(result.json.slug).toBe('lost-mine-2');
    expect(fs.readFileSync(path.join(codex, 'lost-mine/scenes/mine.md'), 'utf8')).toBe('MINE');
    expect(fs.readFileSync(path.join(codex, 'lost-mine-2/scenes/mine.md'), 'utf8')).toBe('THEIRS');
  });

  it('is not offered, and so cannot run, without Allow changes', async () => {
    await connect({ allowWrite: false });
    const sourcePath = zipOf([{ name: 'c/a.md', data: 'x' }]);

    const names = (await client.listTools()).tools.map((tool) => tool.name);
    const result = await client
      .callTool({ name: 'import_campaign', arguments: { sourcePath } })
      .catch((error) => ({ isError: true, error }));

    expect(names).not.toContain('import_campaign');
    expect(result.isError).toBe(true);
    expect(fs.readdirSync(codex).sort()).toEqual(['.lazydm', 'lost-mine', 'other']);
  });

  it('is refused under an access limit', async () => {
    await connect({ allowWrite: true, roots: ['lost-mine'] });
    const sourcePath = zipOf([{ name: 'c/a.md', data: 'x' }]);

    const result = await call('import_campaign', { sourcePath });

    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/limited to some campaigns/);
  });

  it('leaves the Codex as it was when the zip is hostile or breaks half-way', async () => {
    await connect({ allowWrite: true });
    const before = fs.readdirSync(codex).sort();
    const hostile = zipOf(
      [
        { name: 'c/a.md', data: 'x' },
        { name: 'c/../../evil.md', data: 'x' },
      ],
      'hostile.zip',
    );
    const broken = zipOf(
      [
        { name: 'c/a.md', data: '# fine\n' },
        { name: 'c/b.md', data: 'hello', crc: 4242 },
      ],
      'broken.zip',
    );

    const first = await call('import_campaign', { sourcePath: hostile });
    const second = await call('import_campaign', { sourcePath: broken });

    expect(first.isError).toBe(true);
    expect(second.isError).toBe(true);
    expect(fs.readdirSync(codex).sort()).toEqual(before);
    expect(reindexed).toEqual([]);
    expect(fs.existsSync(path.join(root, 'evil.md'))).toBe(false);
  });

  it('refuses a zip inside the Codex', async () => {
    await connect({ allowWrite: true });
    const sourcePath = path.join(codex, 'in.zip');
    writeZip(sourcePath, [{ name: 'c/a.md', data: 'x' }]);

    const result = await call('import_campaign', { sourcePath });

    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/inside the Codex/);
  });

  it('still imports a folder with a mapping as before', async () => {
    await connect({ allowWrite: true });
    const source = path.join(outside, 'notes');
    fs.mkdirSync(path.join(source, 'NPCs'), { recursive: true });
    fs.writeFileSync(path.join(source, 'NPCs', 'Boss.md'), 'Hello.\n');

    const result = await call('import_campaign', {
      sourcePath: source,
      name: 'From Folder',
      mapping: { NPCs: 'characters' },
    });

    expect(result.isError).toBe(false);
    expect(fs.existsSync(path.join(codex, 'from-folder/characters/boss.md'))).toBe(true);
  });

  it('still asks a folder import for its name and mapping, though they are optional for zips', async () => {
    await connect({ allowWrite: true });
    const source = path.join(outside, 'notes');
    fs.mkdirSync(path.join(source, 'NPCs'), { recursive: true });
    fs.writeFileSync(path.join(source, 'NPCs', 'Boss.md'), 'Hello.\n');

    const noName = await call('import_campaign', {
      sourcePath: source,
      mapping: { NPCs: 'characters' },
    });
    const noMapping = await call('import_campaign', { sourcePath: source, name: 'X' });

    expect(noName.isError).toBe(true);
    expect(noName.text).toMatch(/name is required/);
    expect(noMapping.isError).toBe(true);
    expect(noMapping.text).toMatch(/mapping/);
    expect(fs.readdirSync(codex).sort()).toEqual(['.lazydm', 'lost-mine', 'other']);
  });
});

describe('export then import through the tools', () => {
  it('brings a campaign back, settings included, as a new campaign', async () => {
    await connect({ allowWrite: true });
    put('lost-mine/scenes/intro.md', '# Intro\n');
    put('lost-mine/agents.md', 'Be nice.');
    sectionModel.saveCampaignSectionSettings(codex, 'lost-mine', {
      hidden: ['spells'],
      labels: { characters: 'NPCs' },
    });
    battleRuleModel.setCampaignChoice(codex, 'lost-mine', 'builtin:dnd5e');
    const zip = path.join(outside, 'round.zip');

    const exported = await call('export_campaign', { slug: 'lost-mine', destination: zip });
    const scanned = await call('scan_import_source', { sourcePath: zip });
    const imported = await call('import_campaign', { sourcePath: zip });

    expect(exported.isError).toBe(false);
    expect(scanned.json).toMatchObject({
      title: 'Lost Mine',
      system: 'dnd5e',
      hasAgentRules: true,
    });
    expect(imported.json.slug).toBe('lost-mine-2');
    expect(fs.readFileSync(path.join(codex, 'lost-mine-2/scenes/intro.md'), 'utf8')).toBe(
      '# Intro\n',
    );
    expect(sectionModel.readCampaignSectionSettings(codex, 'lost-mine-2').hidden).toEqual([
      'spells',
    ]);
    expect(battleRuleModel.readCampaignChoice(codex, 'lost-mine-2')).toBe('builtin:dnd5e');
    expect(fs.readFileSync(path.join(codex, 'lost-mine/scenes/intro.md'), 'utf8')).toBe(
      '# Intro\n',
    );
  });
});
