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
    ]);
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

describe('adding the keys a layout reads to its template', () => {
  const TEMPLATE = '_templates/old-enemy.md';

  beforeEach(() => {
    fs.mkdirSync(path.join(vault, '_templates'));
    fs.writeFileSync(
      path.join(vault, TEMPLATE),
      '---\ntitle: "{{title}}"\nhp:\n# my own comment\nac: 10\n---\n# {{title}}\n',
    );
  });

  it('adds only the missing keys, empty, and leaves every other line alone', async () => {
    const result = await templateController.addKeys({
      path: TEMPLATE,
      keys: ['ac', 'hp', 'perception', 'fortitude', 'perception'],
    });

    expect(result.added).toEqual(['perception', 'fortitude']);
    expect(fs.readFileSync(path.join(vault, TEMPLATE), 'utf8')).toBe(
      '---\ntitle: "{{title}}"\nhp:\n# my own comment\nac: 10\nperception:\nfortitude:\n---\n# {{title}}\n',
    );
  });

  it('changes nothing the second time', async () => {
    await templateController.addKeys({ path: TEMPLATE, keys: ['perception'] });
    const before = fs.readFileSync(path.join(vault, TEMPLATE), 'utf8');

    const again = await templateController.addKeys({ path: TEMPLATE, keys: ['perception'] });
    expect(again.added).toEqual([]);
    expect(fs.readFileSync(path.join(vault, TEMPLATE), 'utf8')).toBe(before);
  });

  it('makes a layout that was missing keys read them', async () => {
    const rule = await ruleController.attributes({ template: TEMPLATE });
    expect(rule.keys).toEqual(['hp', 'ac']);

    await templateController.addKeys({ path: TEMPLATE, keys: ['perception'] });
    expect((await ruleController.attributes({ template: TEMPLATE })).keys).toEqual([
      'hp',
      'ac',
      'perception',
    ]);
  });

  it.each([['Bad Key'], ['a: b'], ['1st'], ['x'.repeat(41)]])('refuses the key %j', async (key) => {
    await expect(templateController.addKeys({ path: TEMPLATE, keys: [key] })).rejects.toThrow();
  });

  it('refuses anything that is not a list of keys', async () => {
    await expect(templateController.addKeys({ path: TEMPLATE, keys: 'hp' })).rejects.toThrow(
      /list of at most/,
    );
  });

  it('only touches template files of the vault', async () => {
    await expect(templateController.addKeys({ path: '../outside.md', keys: ['x'] })).rejects.toThrow(
      /Template not found/,
    );
    await expect(
      templateController.addKeys({ path: 'lost-mine/agents.md', keys: ['x'] }),
    ).rejects.toThrow(/Template not found/);
  });

  it('adds a frontmatter to a template that has none', async () => {
    fs.writeFileSync(path.join(vault, '_templates/bare.md'), '# {{title}}\n');
    await templateController.addKeys({ path: '_templates/bare.md', keys: ['ac', 'hp'] });
    expect(fs.readFileSync(path.join(vault, '_templates/bare.md'), 'utf8')).toBe(
      '---\nac:\nhp:\n---\n# {{title}}\n',
    );
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
