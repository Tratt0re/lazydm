import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Functional check through the MCP server, with the real controllers and models on a real folder (nothing
 * stubbed but the open-vault lookup and the index): what an agent gets from the system presets.
 */
const require = createRequire(import.meta.url);
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');

let vault;
let client;
let templateController;
let ruleController;

function stub(file, exports) {
  const resolved = require.resolve(file);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content?.[0]?.text ?? '';
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    // Errors come back as plain text.
  }

  return { isError: result.isError === true, data };
}

beforeEach(async () => {
  vault = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-mcp-systems-'));
  stub('../controllers/vault.controller.js', {
    getReadyVaultPath: () => vault,
    getCurrent: () => ({ status: 'ready', vault: { path: vault } }),
  });
  stub('../controllers/indexer.controller.js', { isOpen: () => false, reindexPaths: async () => {} });
  const { createMcpServer } = require('../mcp/tools');
  templateController = require('../controllers/template.controller');
  ruleController = require('../controllers/battle-rule.controller');
  await require('../controllers/campaign.controller').create({ slug: 'lost-mine', name: 'Lost Mine' });

  const server = createMcpServer({ allowWrite: true });
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
});

afterEach(async () => {
  await client.close();
  fs.rmSync(vault, { recursive: true, force: true });
});

describe('templates by system, through MCP', () => {
  it('lists which note types have a variant per system', async () => {
    const { data } = await call('list_templates');
    expect(data.systems.enemy).toEqual(['dnd5e', 'pf2e']);
    expect(data.systems.character).toEqual(['dnd5e', 'pf2e']);
    expect(data.systems.spell).toEqual(['dnd5e', 'pf2e']);
    expect(data.systems.quest).toEqual([]);
  });

  it('creates a D&D 5e enemy template with playable keys', async () => {
    const { data, isError } = await call('create_template', {
      name: 'Goblin sheet',
      type: 'enemy',
      system: 'dnd5e',
    });
    expect(isError).toBe(false);

    const text = fs.readFileSync(path.join(vault, data.path), 'utf8');
    for (const key of ['ac:', 'hp:', 'hit_dice:', 'speed:', 'initiative_mod:', 'dex:', 'legendary:']) {
      expect(text).toContain(`\n${key}`);
    }
    expect(text).toContain('## Legendary actions');
  });

  it('keeps the default system when none is given', async () => {
    const { data } = await call('create_template', { name: 'Plain', type: 'enemy' });
    const text = fs.readFileSync(path.join(vault, data.path), 'utf8');
    expect(text).toContain('\nac:');
    expect(text).not.toContain('hit_dice:');
  });

  it('refuses a system it does not ship', async () => {
    const { data, isError } = await call('create_template', {
      name: 'Bad',
      type: 'enemy',
      system: '../etc',
    });
    expect(isError).toBe(true);
    expect(data).toMatch(/not a built-in system/);
    expect(fs.existsSync(path.join(vault, '_templates'))).toBe(false);
  });

  it('gives new notes of a section the keys of the template linked to it', async () => {
    const customized = await templateController.customize({ type: 'enemy', system: 'pf2e' });
    await call('set_section_template', {
      campaign: 'lost-mine',
      type: 'enemy',
      template: customized.path,
    });

    const { data } = await call('create_note', {
      folder: 'lost-mine/enemies',
      title: 'Wolf',
      type: 'enemy',
    });
    expect(Object.keys(data.frontmatter)).toEqual(
      expect.arrayContaining(['level', 'ac', 'hp', 'perception', 'fortitude', 'reflex', 'will']),
    );
  });
});

describe('tracker layouts by system, through MCP', () => {
  it('describes the default layout until a campaign chooses another', async () => {
    const { data } = await call('get_encounter_rule', { scope: 'lost-mine' });
    expect(data.ruleName).toBe('Generic');
    expect(data.noteKeys).toEqual(['cr', 'hp', 'ac', 'initiative_mod']);
  });

  it('describes the D&D 5e layout a campaign chose, with the keys of its template', async () => {
    await ruleController.setChoice({ campaign: 'lost-mine', rule: 'builtin:dnd5e' });
    const { data } = await call('get_encounter_rule', { scope: 'lost-mine' });

    expect(data.ruleName).toBe('D&D 5e');
    expect(data.ruleChosenBy).toMatch(/campaign/);
    expect(data.noteTemplate).toBe('builtin:enemy@dnd5e');
    expect(data.initiativeRoll).toBe('1d20 + {initiative_mod}');
    expect(data.noteKeys).toEqual(expect.arrayContaining(['ac', 'hp', 'dex', 'hit_dice']));
    expect(data.fields.map((field) => field.key)).toEqual([
      'initiative',
      'side',
      'hp',
      'ac',
      'statuses',
      'note',
      'speed',
      'senses',
    ]);
  });

  it('says from which row size of the tracker a field shows, without changing how it is filled', async () => {
    await ruleController.setChoice({ campaign: 'lost-mine', rule: 'builtin:pf2e' });
    const { data } = await call('get_encounter_rule', { scope: 'lost-mine' });
    const from = Object.fromEntries(data.fields.map((field) => [field.key, field.shownFrom]));

    expect(from.ac).toBe('compact');
    expect(from.fortitude).toBe('card');
    expect(from.speed).toBe('expanded');
  });

  it('describes the Pathfinder 2e layout, which rolls Perception and shows the saves', async () => {
    await ruleController.setChoice({ campaign: 'lost-mine', rule: 'builtin:pf2e' });
    const { data } = await call('get_encounter_rule', { scope: 'lost-mine' });

    expect(data.ruleName).toBe('Pathfinder 2e');
    expect(data.initiativeRoll).toBe('1d20 + {perception}');
    expect(data.fields.map((field) => field.key)).toEqual(
      expect.arrayContaining(['fortitude', 'reflex', 'will']),
    );
  });

  it('checks a new encounter against the chosen layout', async () => {
    await ruleController.setChoice({ campaign: 'lost-mine', rule: 'builtin:dnd5e' });

    const created = await call('create_encounter', {
      folder: 'lost-mine/encounters',
      name: 'Ambush',
      entities: [
        { name: 'Goblin', quantity: 2, values: { side: 'enemy' } },
        { name: 'Bugbear', values: { ac: 16, hp: { current: 27, max: 27 } } },
      ],
    });
    expect(created.isError).toBe(false);
    expect(created.data.rule).toBe('D&D 5e');
    expect(created.data.entities).toBe(3);

    // Pathfinder's saves are not fields of the D&D layout.
    const refused = await call('create_encounter', {
      folder: 'lost-mine/encounters',
      name: 'Wrong',
      entities: [{ name: 'X', values: { fortitude: 5 } }],
    });
    expect(refused.isError).toBe(true);
    expect(refused.data).toMatch(/has no field "fortitude"/);
  });

  it('accepts the Pathfinder saves under the Pathfinder layout', async () => {
    await ruleController.setChoice({ campaign: 'lost-mine', rule: 'builtin:pf2e' });
    const { isError, data } = await call('create_encounter', {
      folder: 'lost-mine/encounters',
      name: 'Crypt',
      entities: [{ name: 'Ghoul', values: { ac: 18, fortitude: 9, reflex: 7, will: 6 } }],
    });
    expect(isError).toBe(false);
    expect(data.rule).toBe('Pathfinder 2e');
  });
});

describe('what an agent is told about systems', () => {
  it('has list_templates and create_template say what the systems are', async () => {
    const tools = (await client.listTools()).tools;
    const byName = (name) => tools.find((tool) => tool.name === name);

    expect(byName('list_templates').description).toMatch(/systems/);
    expect(JSON.stringify(byName('create_template').inputSchema)).toMatch(/dnd5e/);
  });

  it('documents the systems in the syntax guide', async () => {
    const { data } = await call('get_syntax_guide');
    expect(String(data)).toMatch(/Game systems/);
    expect(String(data)).toMatch(/pf2e/);
  });
});

describe('a campaign with a game system', () => {
  const campaignController = () => require('../controllers/campaign.controller');
  const ruleOf = async (scope) => (await call('get_encounter_rule', { scope })).data;

  it('stores the system in campaign.md and lists it', async () => {
    await campaignController().create({ name: 'Crypt', system: 'pf2e' });
    const text = fs.readFileSync(path.join(vault, 'crypt', 'campaign.md'), 'utf8');
    expect(text).toMatch(/^system: pf2e$/m);

    const { data } = await call('list_campaigns');
    expect(data.rows.find((row) => row.slug === 'crypt').system).toBe('pf2e');
    expect(data.rows.find((row) => row.slug === 'lost-mine').system).toBeNull();
  });

  it('refuses a system the app does not ship', async () => {
    await expect(campaignController().create({ name: 'Bad', system: '../x' })).rejects.toThrow(
      /not a built-in system/,
    );
  });

  it('follows its system for the tracker layout until a layout is chosen', async () => {
    await campaignController().create({ name: 'Crypt', system: 'pf2e' });
    expect((await ruleOf('crypt')).ruleName).toBe('Pathfinder 2e');
    expect((await ruleOf('crypt')).ruleChosenBy).toMatch(/game system/);

    await ruleController.setChoice({ campaign: 'crypt', rule: 'builtin:dnd5e' });
    expect((await ruleOf('crypt')).ruleName).toBe('D&D 5e');
    expect((await ruleOf('crypt')).ruleChosenBy).toMatch(/its choice/);
  });

  it('gives new notes the template of its system, and "automatic" is that one', async () => {
    await campaignController().create({ name: 'Crypt', system: 'dnd5e' });
    const { data } = await call('create_note', { folder: 'crypt/enemies', title: 'Ghoul', type: 'enemy' });
    expect(Object.keys(data.frontmatter)).toEqual(expect.arrayContaining(['hit_dice', 'legendary']));
  });

  it('lets a section pick the built-in of another system', async () => {
    await campaignController().create({ name: 'Crypt', system: 'dnd5e' });
    await call('set_section_template', { campaign: 'crypt', type: 'enemy', template: 'builtin@pf2e' });
    const { data } = await call('create_note', { folder: 'crypt/enemies', title: 'Ghoul', type: 'enemy' });
    expect(Object.keys(data.frontmatter)).toEqual(expect.arrayContaining(['fortitude', 'reflex']));
    expect(Object.keys(data.frontmatter)).not.toContain('hit_dice');
  });

  it('changes the system of an existing campaign and drops its old layout choice', async () => {
    await campaignController().create({ name: 'Crypt', system: 'dnd5e' });
    await ruleController.setChoice({ campaign: 'crypt', rule: 'builtin:dnd5e' });
    await campaignController().update({ slug: 'crypt', name: 'Crypt', system: 'pf2e' });

    expect((await ruleOf('crypt')).ruleName).toBe('Pathfinder 2e');
    await campaignController().update({ slug: 'crypt', name: 'Crypt' });
    expect((await ruleOf('crypt')).ruleName).toBe('Pathfinder 2e');
    await campaignController().update({ slug: 'crypt', name: 'Crypt', system: 'generic' });
    expect(fs.readFileSync(path.join(vault, 'crypt', 'campaign.md'), 'utf8')).not.toMatch(/^system:/m);
  });
});
