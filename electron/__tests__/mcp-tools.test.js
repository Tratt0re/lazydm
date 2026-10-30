import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createMcpServer } = require('../mcp/tools');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');

/** The built-in tracker layout, as the app returns it (labels are i18n keys). */
const GENERIC_RULE = {
  name: 'Generic',
  template: 'builtin:enemy',
  initiative: { roll: '1d20 + {initiative_mod}' },
  fields: [
    {
      key: 'initiative',
      component: 'initiative',
      label: 'encounters.fields.initiative',
      source: 'entity',
      showInRow: true,
    },
    {
      key: 'ac',
      component: 'number',
      label: 'encounters.fields.ac',
      source: 'frontmatter:ac',
      showInRow: true,
    },
    {
      key: 'hp',
      component: 'healthbar',
      label: 'encounters.fields.hp',
      source: 'frontmatter:hp',
      showInRow: true,
    },
    {
      key: 'statuses',
      component: 'statuses',
      label: 'encounters.fields.statuses',
      source: 'entity',
      showInRow: true,
    },
    {
      key: 'note',
      component: 'note-link',
      label: 'encounters.fields.note',
      source: 'entity',
      showInRow: true,
    },
  ],
};

/** A campaign's own layout: a Pathfinder-style rule with a side, a text field and its own keys. */
const CUSTOM_RULE = {
  name: 'Pathfinder 2e',
  template: '_templates/pf-enemy.md',
  initiative: { roll: '1d20 + {perception}' },
  fields: [
    {
      key: 'initiative',
      component: 'initiative',
      label: 'Init',
      source: 'entity',
      showInRow: true,
    },
    {
      key: 'side',
      component: 'side',
      label: 'Side',
      source: 'entity',
      showInRow: true,
      options: ['foe', 'pc'],
    },
    { key: 'hp', component: 'healthbar', label: 'HP', source: 'frontmatter:hp', showInRow: true },
    { key: 'trait', component: 'text', label: 'Trait', source: 'entity', showInRow: true },
    { key: 'note', component: 'note-link', label: 'Note', source: 'entity', showInRow: true },
  ],
};

/** Controllers that only record their calls: the tools' wiring and scope checks are what is under test. */
function createStubControllers() {
  const calls = [];
  const record = (name, result = {}) =>
    vi.fn(async (payload) => {
      calls.push({ name, payload });
      return typeof result === 'function' ? result(payload) : result;
    });

  return {
    calls,
    vaultPath: () => {
      throw new Error('The tests that import set their own Codex.');
    },
    reindex: async () => {},
    asset: {
      isMediaFileName: (name) => /\.(png|jpg|pdf|mp3)$/i.test(name),
      save: record('asset.save', { path: 'lost-mine/assets/map.png', linkTarget: 'map.png' }),
    },
    campaign: {
      list: record('campaign.list', {
        rows: [{ slug: 'lost-mine' }, { slug: 'other' }],
      }),
      getAgentRules: record('campaign.getAgentRules', ({ slug }) => ({
        path: `${slug}/agents.md`,
        exists: slug === 'lost-mine',
      })),
    },
    compendium: {
      list: record('compendium.list', { rows: [{ slug: 'dnd-5e' }, { slug: 'pf2e' }] }),
      create: record('compendium.create', { slug: 'new-system' }),
    },
    document: {
      list: record('document.list'),
      read: record('document.read', {
        path: 'lost-mine/scenes/a.md',
        content: '# A',
        contentHash: 'h1',
        links: [
          { resolvedPath: 'lost-mine/enemies/goblin.md' },
          { resolvedPath: 'other/enemies/orc.md' },
          { resolvedPath: null },
        ],
      }),
      write: record('document.write', { status: 'saved' }),
      create: record('document.create', { path: 'lost-mine/enemies/boss.md' }),
      createFolder: record('document.createFolder'),
      move: record('document.move', { updatedPaths: [], failedPaths: [], linkCount: 0 }),
      rename: record('document.rename', { updatedPaths: [], failedPaths: [], linkCount: 0 }),
      renameAsset: record('document.renameAsset', { updatedPaths: [], failedPaths: [] }),
      renameFolder: record('document.renameFolder', { moved: [], updatedPaths: [] }),
      deleteFile: record('document.deleteFile', { updatedPaths: [], failedPaths: [] }),
      deleteFolder: record('document.deleteFolder', { status: 'deleted' }),
      copy: record('document.copy', { status: 'copied' }),
      copyPlan: record('document.copyPlan', { linked: [], subfolder: null }),
      links: record('document.links', {
        backlinks: [{ sourcePath: 'lost-mine/a.md' }, { sourcePath: 'other/b.md' }],
        outgoingLinks: [{ resolvedPath: 'other/c.md' }],
        brokenLinks: [],
      }),
      brokenLinks: record('document.brokenLinks', { rows: [] }),
    },
    encounter: {
      read: record('encounter.read'),
      rule: record('encounter.rule', GENERIC_RULE),
      create: record('encounter.create', (payload) => ({
        path: `${payload.folder}/${payload.name.toLowerCase().replace(/\s+/g, '-')}.json`,
        encounter: { version: 1, name: payload.name, notes: '', rule: null, entities: [] },
        contentHash: 'e1',
      })),
      write: record('encounter.write', { status: 'saved', contentHash: 'e2' }),
    },
    battleRule: {
      getChoice: record('battleRule.getChoice', { rule: null }),
      read: record('battleRule.read', { rule: CUSTOM_RULE }),
      list: record('battleRule.list', { rows: [], builtIn: GENERIC_RULE }),
      attributes: record('battleRule.attributes', { keys: ['ac', 'hp', 'initiative_mod'] }),
    },
    map: {
      read: record('map.read', { path: 'lost-mine/maps/world.json', map: {}, contentHash: 'm1' }),
      create: record('map.create', (payload) => ({
        path: `${payload.folder}/${payload.name.toLowerCase().replace(/\s+/g, '-')}.json`,
        map: {
          version: 1,
          name: payload.name,
          image: payload.image,
          pins: [],
          paths: [],
          notes: [],
        },
        contentHash: 'm1',
      })),
      write: record('map.write', { status: 'saved', contentHash: 'm2' }),
    },
    search: { query: record('search.query', { rows: [] }) },
    section: {
      list: record('section.list', {
        rows: [
          { key: 'enemies', type: 'enemy', label: 'Monsters', isCustom: false, isHidden: false },
          { key: 'scenes', type: 'scene', label: null, isCustom: false, isHidden: true },
          {
            key: 'factions',
            type: 'faction',
            label: 'Factions',
            icon: 'flag',
            description: 'x',
            isCustom: true,
            isHidden: false,
          },
        ],
      }),
      save: record('section.save', { rows: [] }),
    },
    template: {
      list: record('template.list', {
        rows: [
          { path: '_templates/enemy.md' },
          { path: 'lost-mine/_templates/enemy.md' },
          { path: 'other/_templates/enemy.md' },
        ],
        types: ['enemy'],
      }),
      getRules: record('template.getRules', { rules: {} }),
      setRule: record('template.setRule', { rules: {} }),
      create: record('template.create', { path: '_templates/boss.md' }),
    },
  };
}

let client = null;
let server = null;
let tempDir = null;

async function connect(options) {
  const controllers = createStubControllers();
  server = createMcpServer({ controllers, ...options });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'test', version: '0' });
  await client.connect(clientTransport);
  return controllers;
}

async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content[0].text;
  return { isError: result.isError === true, text, json: result.isError ? null : safeParse(text) };
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-mcp-'));
});

afterEach(async () => {
  await client?.close();
  await server?.close();
  client = null;
  server = null;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('tool list', () => {
  it('offers only read tools without Allow changes', async () => {
    await connect({ allowWrite: false });
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);

    expect(names).toContain('get_syntax_guide');
    expect(names).toContain('read_note');
    expect(names).not.toContain('create_note');
    expect(names).not.toContain('move_note');
    expect(names).not.toContain('create_template');
  });

  it('adds the write tools with Allow changes, but no trash tool', async () => {
    await connect({ allowWrite: true });
    const names = (await client.listTools()).tools.map((tool) => tool.name);

    for (const name of [
      'create_note',
      'update_note',
      'append_to_note',
      'create_folder',
      'create_section',
      'move_note',
      'add_asset',
      'create_template',
      'set_section_template',
      'create_compendium_system',
      'copy_note',
      'rename_note',
      'rename_asset',
      'rename_folder',
      'import_campaign',
      'scan_import_source',
    ]) {
      expect(names).toContain(name);
    }
    expect(names).not.toContain('trash_file');
    expect(names).not.toContain('trash_folder');
  });

  it('adds the trash tools only with Allow deleting on top of Allow changes', async () => {
    await connect({ allowWrite: true, allowDelete: true });
    const names = (await client.listTools()).tools.map((tool) => tool.name);

    expect(names).toContain('trash_file');
    expect(names).toContain('trash_folder');
    // Nothing deletes for good, empties the Trash or removes a whole campaign, section or system.
    expect(
      names.filter(
        (name) =>
          /campaign|section|system|empty|purge|permanent/.test(name) &&
          /trash|delete|remove/.test(name),
      ),
    ).toEqual([]);
    expect(names.filter((name) => /^(delete|remove)_/.test(name))).toEqual([]);
  });

  it('never offers trash tools when only Allow deleting is set', async () => {
    await connect({ allowWrite: false, allowDelete: true });
    const names = (await client.listTools()).tools.map((tool) => tool.name);

    expect(names).not.toContain('trash_file');
    expect(names).not.toContain('rename_note');
  });

  it('scan_import_source is a read tool, import_campaign needs Allow changes', async () => {
    await connect({ allowWrite: false });
    const names = (await client.listTools()).tools.map((tool) => tool.name);

    expect(names).toContain('scan_import_source');
    expect(names).not.toContain('import_campaign');
  });
});

describe('get_encounter_rule', () => {
  it('gives the built-in layout, its fields and how to fill them, when the campaign chose none', async () => {
    await connect({ allowWrite: false });

    const result = await call('get_encounter_rule', { scope: 'lost-mine' });

    expect(result.isError).toBe(false);
    expect(result.json.ruleName).toBe('Generic');
    expect(result.json.ruleChosenBy).toBe('the built-in default');
    expect(result.json.initiativeRoll).toBe('1d20 + {initiative_mod}');
    expect(result.json.noteKeys).toEqual(['ac', 'hp', 'initiative_mod']);
    const hp = result.json.fields.find((field) => field.key === 'hp');
    expect(hp.component).toBe('healthbar');
    expect(hp.valueFormat).toMatch(/current.*max/);
    expect(hp.valueFormat).toMatch(/frontmatter key "hp"/);
    // The built-in labels are i18n keys: the agent gets the field key instead.
    expect(result.json.fields.find((field) => field.key === 'ac').label).toBe('ac');
  });

  it('gives the rule the campaign chose, with its own fields and side options', async () => {
    const controllers = await connect({ allowWrite: false });
    controllers.battleRule.getChoice = vi.fn(async () => ({ rule: '_battle-rules/pf2e.json' }));

    const result = await call('get_encounter_rule', { scope: 'lost-mine' });

    expect(result.json.ruleName).toBe('Pathfinder 2e');
    expect(result.json.ruleChosenBy).toBe('the campaign');
    expect(result.json.rulePath).toBe('_battle-rules/pf2e.json');
    expect(result.json.noteTemplate).toBe('_templates/pf-enemy.md');
    expect(result.json.fields.find((field) => field.key === 'side').valueFormat).toMatch(/foe, pc/);
    expect(controllers.battleRule.read).toHaveBeenCalledWith({ path: '_battle-rules/pf2e.json' });
  });

  it('asks the app which rule one existing encounter uses', async () => {
    const controllers = await connect({ allowWrite: false });

    await call('get_encounter_rule', {
      scope: 'lost-mine',
      encounter: 'lost-mine/encounters/ambush.json',
    });

    expect(controllers.encounter.rule).toHaveBeenCalledWith({
      path: 'lost-mine/encounters/ambush.json',
    });
  });

  it('refuses another campaign, a path that is not a scope, and an encounter of another campaign', async () => {
    await connect({ allowWrite: false, roots: ['lost-mine'] });

    expect((await call('get_encounter_rule', { scope: 'other' })).isError).toBe(true);
    expect((await call('get_encounter_rule', { scope: 'lost-mine/encounters' })).isError).toBe(
      true,
    );
    expect(
      (
        await call('get_encounter_rule', {
          scope: 'lost-mine',
          encounter: 'other/encounters/a.json',
        })
      ).isError,
    ).toBe(true);
  });
});

describe('create_encounter', () => {
  const folder = 'lost-mine/encounters';

  it('creates the file and fills it with checked values, numbering the copies', async () => {
    const controllers = await connect({ allowWrite: true });

    const result = await call('create_encounter', {
      folder,
      name: 'Goblin Ambush',
      notes: 'They hide in the brush.',
      entities: [
        {
          name: 'Goblin',
          quantity: 3,
          values: {
            hp: { max: 7 },
            ac: 15,
            statuses: [{ name: 'hidden', rounds: 2 }],
            note: 'lost-mine/enemies/goblin.md',
          },
        },
        { name: 'Klarg', values: { hp: 27, initiative: 12 } },
      ],
    });

    expect(result.isError).toBe(false);
    expect(result.json).toMatchObject({
      path: 'lost-mine/encounters/goblin-ambush.json',
      linkTarget: 'goblin-ambush.json',
      entities: 4,
      rule: 'Generic',
    });

    const written = controllers.encounter.write.mock.calls[0][0];
    expect(written.expectedHash).toBe('e1');
    expect(written.encounter.notes).toBe('They hide in the brush.');
    expect(written.encounter.entities.map((entity) => entity.name)).toEqual([
      'Goblin 1',
      'Goblin 2',
      'Goblin 3',
      'Klarg',
    ]);
    expect(written.encounter.entities[0].values).toEqual({
      hp: { current: 7, max: 7 },
      ac: 15,
      statuses: [{ name: 'hidden', rounds: 2 }],
      note: 'lost-mine/enemies/goblin.md',
    });
    expect(written.encounter.entities[3].values).toEqual({
      hp: { current: 27, max: 27 },
      initiative: 12,
    });
    expect(written.encounter.entities.every((entity) => entity.isDead === false)).toBe(true);
    // Copies never share one values object.
    written.encounter.entities[0].values.hp.current = 1;
    expect(written.encounter.entities[1].values.hp.current).toBe(7);
  });

  it('uses the rule the campaign chose to check the values', async () => {
    const controllers = await connect({ allowWrite: true });
    controllers.battleRule.getChoice = vi.fn(async () => ({ rule: '_battle-rules/pf2e.json' }));

    const good = await call('create_encounter', {
      folder,
      name: 'Bandits',
      entities: [{ name: 'Bandit', values: { side: 'foe', trait: 'sneaky' } }],
    });
    const wrongSide = await call('create_encounter', {
      folder,
      name: 'Bandits 2',
      entities: [{ name: 'Bandit', values: { side: 'enemy' } }],
    });
    // "ac" exists in the built-in layout but not in this campaign's.
    const unknownField = await call('create_encounter', {
      folder,
      name: 'Bandits 3',
      entities: [{ name: 'Bandit', values: { ac: 15 } }],
    });

    expect(good.isError).toBe(false);
    expect(wrongSide.isError).toBe(true);
    expect(wrongSide.text).toMatch(/one of: foe, pc/);
    expect(unknownField.isError).toBe(true);
    expect(unknownField.text).toMatch(/Pathfinder 2e.*no field "ac"/);
  });

  it('checks every value before creating anything', async () => {
    const controllers = await connect({ allowWrite: true });
    const bad = (values) =>
      call('create_encounter', { folder, name: 'X', entities: [{ name: 'Orc', values }] });

    for (const values of [
      { hp: 'lots' },
      { hp: { current: 'x' } },
      { hp: {} },
      { ac: '15' },
      { initiative: Number.NaN },
      { statuses: 'stunned' },
      { statuses: [{ name: 'stunned', rounds: 0 }] },
      { statuses: [{ rounds: 2 }] },
      { note: 'lost-mine/enemies/orc.txt' },
      { note: 'other/enemies/orc.md' },
      { note: '../escape.md' },
      { unknown: 1 },
    ]) {
      expect((await bad(values)).isError, JSON.stringify(values)).toBe(true);
    }
    expect(controllers.encounter.create).not.toHaveBeenCalled();
    expect(controllers.encounter.write).not.toHaveBeenCalled();
  });

  it('refuses a folder that is not an Encounters folder, another campaign, and too many combatants', async () => {
    const controllers = await connect({ allowWrite: true, roots: ['lost-mine'] });

    expect(
      (await call('create_encounter', { folder: 'lost-mine/scenes', name: 'X' })).isError,
    ).toBe(true);
    expect((await call('create_encounter', { folder: 'lost-mine', name: 'X' })).isError).toBe(true);
    expect(
      (await call('create_encounter', { folder: 'other/encounters', name: 'X' })).isError,
    ).toBe(true);
    expect(
      (
        await call('create_encounter', {
          folder,
          name: 'Horde',
          entities: [{ name: 'Rat', quantity: 15 }].concat(
            Array.from({ length: 7 }, (_, index) => ({ name: `Rat ${index}`, quantity: 15 })),
          ),
        })
      ).isError,
    ).toBe(true);
    expect(controllers.encounter.create).not.toHaveBeenCalled();
  });

  it('creates an empty encounter without a second write, and starts it idle', async () => {
    const controllers = await connect({ allowWrite: true });

    const result = await call('create_encounter', { folder, name: 'Empty' });

    expect(result.json.entities).toBe(0);
    expect(controllers.encounter.write).not.toHaveBeenCalled();
    expect(controllers.encounter.create.mock.calls[0][0]).toEqual({ folder, name: 'Empty' });
  });

  it('says so when the file was created but could not be filled', async () => {
    const controllers = await connect({ allowWrite: true });
    controllers.encounter.write = vi.fn(async () => ({ status: 'conflict' }));

    const result = await call('create_encounter', {
      folder,
      name: 'Ambush',
      entities: [{ name: 'Goblin' }],
    });

    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/Created lost-mine\/encounters\/ambush\.json but it changed/);
  });

  it('is not offered without Allow changes', async () => {
    await connect({ allowWrite: false });
    const names = (await client.listTools()).tools.map((tool) => tool.name);

    expect(names).toContain('get_encounter_rule');
    expect(names).toContain('read_map');
    expect(names).not.toContain('create_encounter');
    expect(names).not.toContain('create_map');
  });
});

describe('create_map', () => {
  const folder = 'lost-mine/maps';
  let codex;

  beforeEach(() => {
    codex = path.join(tempDir, 'codex');
    fs.mkdirSync(path.join(codex, 'lost-mine/assets'), { recursive: true });
    fs.writeFileSync(path.join(codex, 'lost-mine/assets/world.png'), 'PNG');
  });

  async function connectWithCodex(options) {
    const controllers = await connect(options);
    controllers.vaultPath = () => codex;
    return controllers;
  }

  it('creates the map on an existing image and fills pins, paths and notes', async () => {
    const controllers = await connectWithCodex({ allowWrite: true });

    const result = await call('create_map', {
      folder,
      name: 'World Map',
      image: 'lost-mine/assets/world.png',
      pins: [
        {
          x: 0.25,
          y: 0.5,
          label: 'Phandalin',
          icon: 'house',
          color: 'green',
          link: 'lost-mine/locations/phandalin.md',
        },
        { x: 0.8, y: 0.1, label: 'Cave', icon: 'skull' },
      ],
      paths: [
        {
          points: [
            { x: 0.1, y: 0.1 },
            { x: 0.4, y: 0.4 },
          ],
          label: 'Road',
          width: 4,
        },
      ],
      notes: [{ x: 0.5, y: 0.5, text: 'Ambush here', color: 'red' }],
    });

    expect(result.isError).toBe(false);
    expect(result.json).toMatchObject({
      path: 'lost-mine/maps/world-map.json',
      linkTarget: 'world-map.json',
      pins: 2,
      paths: 1,
      notes: 1,
    });
    expect(controllers.map.create.mock.calls[0][0]).toEqual({
      folder,
      name: 'World Map',
      image: 'lost-mine/assets/world.png',
    });
    const written = controllers.map.write.mock.calls[0][0];
    expect(written.expectedHash).toBe('m1');
    expect(written.map.pins[0]).toMatchObject({
      x: 0.25,
      y: 0.5,
      link: 'lost-mine/locations/phandalin.md',
    });
    expect(written.map.pins[1].link).toBeNull();
  });

  it('refuses an image that is missing, not an image, or in another campaign', async () => {
    const controllers = await connectWithCodex({ allowWrite: true });
    const create = (image) => call('create_map', { folder, name: 'M', image });

    const missing = await create('lost-mine/assets/nope.png');
    expect(missing.isError).toBe(true);
    expect(missing.text).toMatch(/add_asset first/);
    expect((await create('lost-mine/assets/world.pdf')).isError).toBe(true);
    expect((await create('other/assets/world.png')).isError).toBe(true);
    expect((await create('../world.png')).isError).toBe(true);
    expect(controllers.map.create).not.toHaveBeenCalled();
  });

  it("keeps pin links inside the map's own campaign and the scope", async () => {
    const controllers = await connectWithCodex({ allowWrite: true, roots: ['lost-mine', 'other'] });

    const crossCampaign = await call('create_map', {
      folder,
      name: 'M',
      image: 'lost-mine/assets/world.png',
      pins: [{ x: 0.5, y: 0.5, link: 'other/locations/x.md' }],
    });
    const escape = await call('create_map', {
      folder,
      name: 'M',
      image: 'lost-mine/assets/world.png',
      pins: [{ x: 0.5, y: 0.5, link: 'lost-mine/../other/x.md' }],
    });

    expect(crossCampaign.isError).toBe(true);
    expect(crossCampaign.text).toMatch(/only uses files of its own campaign/);
    expect(escape.isError).toBe(true);
    expect(controllers.map.create).not.toHaveBeenCalled();
  });

  it('refuses a folder that is not a Maps folder, another campaign, and bad coordinates', async () => {
    const controllers = await connectWithCodex({ allowWrite: true, roots: ['lost-mine'] });

    expect(
      (
        await call('create_map', {
          folder: 'lost-mine/scenes',
          name: 'M',
          image: 'lost-mine/assets/world.png',
        })
      ).isError,
    ).toBe(true);
    expect(
      (
        await call('create_map', {
          folder: 'other/maps',
          name: 'M',
          image: 'other/assets/world.png',
        })
      ).isError,
    ).toBe(true);
    for (const bad of [
      { pins: [{ x: 1.5, y: 0.5 }] },
      { pins: [{ x: 0.5, y: 0.5, color: 'magenta' }] },
      { pins: [{ x: 0.5, y: 0.5, icon: 'rocket' }] },
      { paths: [{ points: [{ x: 0, y: 0 }] }] },
      { notes: [{ x: 0.5, y: 0.5, text: 'x'.repeat(2001) }] },
    ]) {
      const result = await call('create_map', {
        folder,
        name: 'M',
        image: 'lost-mine/assets/world.png',
        ...bad,
      });
      expect(result.isError, JSON.stringify(bad)).toBe(true);
    }
    expect(controllers.map.create).not.toHaveBeenCalled();
  });

  it('read_map is limited to the scope', async () => {
    const controllers = await connect({ allowWrite: false, roots: ['lost-mine'] });

    expect((await call('read_map', { path: 'lost-mine/maps/world.json' })).isError).toBe(false);
    expect((await call('read_map', { path: 'other/maps/world.json' })).isError).toBe(true);
    expect(controllers.map.read).toHaveBeenCalledTimes(1);
  });
});

describe('rename tools', () => {
  it('pass the new name through and check the scope', async () => {
    const controllers = await connect({ allowWrite: true, roots: ['lost-mine'] });

    expect(
      (
        await call('rename_note', {
          path: 'lost-mine/enemies/a.md',
          title: 'Boss',
          updateLinks: false,
        })
      ).isError,
    ).toBe(false);
    expect(
      (await call('rename_asset', { path: 'lost-mine/assets/m.png', name: 'Map' })).isError,
    ).toBe(false);
    expect(
      (await call('rename_folder', { folder: 'lost-mine/enemies/humans', name: 'People' })).isError,
    ).toBe(false);

    expect((await call('rename_note', { path: 'other/enemies/a.md', title: 'Boss' })).isError).toBe(
      true,
    );
    expect(
      (await call('rename_folder', { folder: 'other/enemies/humans', name: 'x' })).isError,
    ).toBe(true);

    expect(controllers.calls.map((entry) => entry.name)).toEqual([
      'document.rename',
      'document.renameAsset',
      'document.renameFolder',
    ]);
    expect(controllers.calls[0].payload).toEqual({
      path: 'lost-mine/enemies/a.md',
      title: 'Boss',
      updateLinks: false,
    });
  });
});

describe('trash tools', () => {
  it('trash a file or a sub-folder inside the scope, with the chosen link handling', async () => {
    const controllers = await connect({
      allowWrite: true,
      allowDelete: true,
      roots: ['lost-mine'],
    });

    expect((await call('trash_file', { path: 'lost-mine/enemies/a.md' })).isError).toBe(false);
    expect(
      (
        await call('trash_folder', {
          folder: 'lost-mine/enemies/humans',
          mode: 'moveToMain',
          rewriteLinks: false,
        })
      ).isError,
    ).toBe(false);

    expect((await call('trash_file', { path: 'other/enemies/a.md' })).isError).toBe(true);
    expect(
      (await call('trash_folder', { folder: 'other/enemies/humans', mode: 'delete' })).isError,
    ).toBe(true);
    expect(
      (await call('trash_folder', { folder: 'lost-mine/enemies/humans', mode: 'everything' }))
        .isError,
    ).toBe(true);

    expect(controllers.calls.map((entry) => entry.name)).toEqual([
      'document.deleteFile',
      'document.deleteFolder',
    ]);
    expect(controllers.calls[1].payload).toEqual({
      folder: 'lost-mine/enemies/humans',
      mode: 'moveToMain',
      rewriteLinks: false,
    });
  });

  it('are marked destructive so a client can ask before running them', async () => {
    await connect({ allowWrite: true, allowDelete: true });
    const { tools } = await client.listTools();

    for (const name of ['trash_file', 'trash_folder']) {
      expect(tools.find((tool) => tool.name === name).annotations.destructiveHint).toBe(true);
    }
  });
});

describe('import tools', () => {
  it('are refused while MCP is limited to some campaigns, before touching the disk', async () => {
    await connect({ allowWrite: true, roots: ['lost-mine'] });

    const scan = await call('scan_import_source', { sourcePath: tempDir });
    const run = await call('import_campaign', {
      sourcePath: tempDir,
      name: 'New',
      mapping: { a: 'characters' },
    });

    expect(scan.isError).toBe(true);
    expect(scan.text).toMatch(/limited to some campaigns/);
    expect(run.isError).toBe(true);
    expect(run.text).toMatch(/limited to some campaigns/);
  });

  it('scan a folder and import it as a new campaign through the app controllers', async () => {
    const controllers = await connect({ allowWrite: true });
    const codex = path.join(tempDir, 'codex');
    const source = path.join(tempDir, 'notes');
    fs.mkdirSync(path.join(codex, '.lazydm'), { recursive: true });
    fs.mkdirSync(path.join(source, 'NPCs'), { recursive: true });
    fs.writeFileSync(path.join(source, 'NPCs', 'Boss.md'), 'Hello [[Boss]].\n');
    controllers.vaultPath = () => codex;
    controllers.reindex = vi.fn(async () => {});
    controllers.asset.isMediaFileName = (name) => /\.png$/i.test(name);

    const scan = await call('scan_import_source', { sourcePath: source });
    expect(scan.json.folders.map((folder) => folder.name)).toEqual(['NPCs']);

    const dry = await call('import_campaign', {
      sourcePath: source,
      name: 'Lost Mine',
      mapping: { NPCs: 'characters' },
      dryRun: true,
    });
    expect(dry.json.dryRun).toBe(true);
    expect(fs.existsSync(path.join(codex, 'lost-mine'))).toBe(false);

    const real = await call('import_campaign', {
      sourcePath: source,
      name: 'Lost Mine',
      mapping: { NPCs: 'characters' },
    });
    expect(real.isError).toBe(false);
    expect(fs.existsSync(path.join(codex, 'lost-mine/characters/boss.md'))).toBe(true);
    expect(controllers.reindex).toHaveBeenCalledTimes(1);
  });
});

describe('syntax guide', () => {
  it('is served as a tool and as a resource', async () => {
    await connect({ allowWrite: false });

    const tool = await call('get_syntax_guide');
    expect(tool.text).toContain('[[Goblin]]');
    expect(tool.text).toContain('![[map.png]]');

    const { resources } = await client.listResources();
    expect(resources.map((resource) => resource.uri)).toContain('lazydm://syntax-guide');
    const resource = await client.readResource({ uri: 'lazydm://syntax-guide' });
    expect(resource.contents[0].text).toContain('slug');
  });
});

describe('scope limit', () => {
  it('refuses paths outside the allowed campaign, for reads and writes', async () => {
    const controllers = await connect({ allowWrite: true, roots: ['lost-mine'] });

    expect((await call('read_note', { path: 'other/x.md' })).isError).toBe(true);
    expect((await call('read_note', { path: 'lost-mine/../other/x.md' })).isError).toBe(true);
    expect(
      (await call('create_note', { folder: 'other/enemies', title: 'T', type: 'enemy' })).isError,
    ).toBe(true);
    expect((await call('create_folder', { folder: 'other/enemies', name: 'x' })).isError).toBe(
      true,
    );
    expect((await call('list_sections', { campaign: 'other' })).isError).toBe(true);
    expect((await call('get_section_templates', { campaign: 'other' })).isError).toBe(true);
    expect(controllers.calls).toEqual([]);
  });

  it('checks both ends of a move and of a copy', async () => {
    const controllers = await connect({ allowWrite: true, roots: ['lost-mine'] });

    const intoOther = await call('move_note', {
      path: 'lost-mine/enemies/a.md',
      folder: 'other/enemies',
    });
    const fromOther = await call('move_note', {
      path: 'other/enemies/a.md',
      folder: 'lost-mine/enemies',
    });
    const copyOut = await call('copy_note', {
      path: 'lost-mine/enemies/a.md',
      target: 'compendium/dnd-5e',
    });

    expect([intoOther.isError, fromOther.isError, copyOut.isError]).toEqual([true, true, true]);
    expect(controllers.calls).toEqual([]);

    const allowed = await call('move_note', {
      path: 'lost-mine/enemies/a.md',
      folder: 'lost-mine/enemies/humans',
    });
    expect(allowed.isError).toBe(false);
    expect(controllers.calls).toHaveLength(1);
  });

  it('filters lists, links and backlinks that point outside', async () => {
    await connect({ allowWrite: false, roots: ['lost-mine'] });

    const campaigns = await call('list_campaigns');
    expect(campaigns.json.rows.map((row) => row.slug)).toEqual(['lost-mine']);

    const systems = await call('list_compendium_systems');
    expect(systems.json.rows).toEqual([]);

    const note = await call('read_note', { path: 'lost-mine/scenes/a.md' });
    expect(note.json.links).toEqual([
      { resolvedPath: 'lost-mine/enemies/goblin.md' },
      { resolvedPath: null },
    ]);

    const links = await call('get_note_links', { path: 'lost-mine/scenes/a.md' });
    expect(links.json.backlinks).toEqual([{ sourcePath: 'lost-mine/a.md' }]);
    expect(links.json.outgoingLinks).toEqual([]);

    const templates = await call('list_templates');
    expect(templates.json.rows.map((row) => row.path)).toEqual(['lost-mine/_templates/enemy.md']);
  });

  it('reaches a ticked compendium system and nothing else of the compendium', async () => {
    const controllers = await connect({ allowWrite: true, roots: ['compendium/dnd-5e'] });

    expect((await call('list_notes', { folder: 'compendium/dnd-5e/spells' })).isError).toBe(false);
    expect((await call('list_notes', { folder: 'compendium/pf2e/spells' })).isError).toBe(true);
    expect(controllers.calls).toHaveLength(1);
  });
});

describe('shared things need an unlimited server', () => {
  it('refuses new templates and new compendium systems while limited', async () => {
    const controllers = await connect({ allowWrite: true, roots: ['lost-mine'] });

    const template = await call('create_template', { name: 'Boss' });
    const system = await call('create_compendium_system', { name: 'Pathfinder' });

    expect(template.isError).toBe(true);
    expect(template.text).toMatch(/limited to some campaigns/);
    expect(system.isError).toBe(true);
    expect(controllers.calls).toEqual([]);
  });

  it('creates them when the whole Codex is allowed', async () => {
    const controllers = await connect({ allowWrite: true, roots: null });

    expect((await call('create_template', { name: 'Boss', type: 'enemy' })).isError).toBe(false);
    expect((await call('create_compendium_system', { name: 'Pathfinder' })).isError).toBe(false);
    expect(controllers.calls.map((entry) => entry.name)).toEqual([
      'template.create',
      'compendium.create',
    ]);
    expect(controllers.calls[0].payload).toEqual({ name: 'Boss', type: 'enemy' });
  });
});

describe('set_section_template', () => {
  it('links an existing template, builtin or automatic, inside the scope', async () => {
    const controllers = await connect({ allowWrite: true, roots: ['lost-mine'] });

    const own = await call('set_section_template', {
      campaign: 'lost-mine',
      type: 'enemy',
      template: 'lost-mine/_templates/enemy.md',
    });
    const builtin = await call('set_section_template', {
      campaign: 'lost-mine',
      type: 'enemy',
      template: 'builtin',
    });
    const automatic = await call('set_section_template', {
      campaign: 'lost-mine',
      type: 'enemy',
      template: null,
    });
    const vaultWide = await call('set_section_template', {
      campaign: 'lost-mine',
      type: 'enemy',
      template: '_templates/enemy.md',
    });

    expect([own.isError, builtin.isError, automatic.isError]).toEqual([false, false, false]);
    expect(vaultWide.isError).toBe(true);
    expect(controllers.calls.map((entry) => entry.payload.template)).toEqual([
      'lost-mine/_templates/enemy.md',
      'builtin',
      null,
    ]);
  });
});

describe('create_section', () => {
  it('adds a section and sends every existing setting back unchanged', async () => {
    const controllers = await connect({ allowWrite: true });

    const result = await call('create_section', {
      campaign: 'lost-mine',
      label: 'Cults',
      icon: 'flame',
    });

    expect(result.isError).toBe(false);
    const saved = controllers.calls.find((entry) => entry.name === 'section.save').payload;
    expect(saved.campaign).toBe('lost-mine');
    expect(saved.settings.hidden).toEqual(['scenes']);
    expect(saved.settings.order).toEqual(['enemies', 'scenes', 'factions']);
    expect(saved.settings.labels).toEqual({ enemies: 'Monsters' });
    expect(saved.settings.custom).toEqual([
      { key: 'factions', type: 'faction', label: 'Factions', icon: 'flag', description: 'x' },
      { label: 'Cults', type: undefined, icon: 'flame', description: undefined },
    ]);
  });
});

describe('add_asset', () => {
  it('reads a local media file and saves it in the assets folder', async () => {
    const controllers = await connect({ allowWrite: true, roots: ['lost-mine'] });
    const file = path.join(tempDir, 'map.png');
    fs.writeFileSync(file, Buffer.from([1, 2, 3]));

    const result = await call('add_asset', { filePath: file, folder: 'lost-mine/assets' });

    expect(result.isError).toBe(false);
    const payload = controllers.calls[0].payload;
    expect(payload.folder).toBe('lost-mine/assets');
    expect(payload.name).toBe('map.png');
    expect([...payload.bytes]).toEqual([1, 2, 3]);
  });

  it('refuses other file types, relative paths, folders and out-of-scope targets', async () => {
    const controllers = await connect({ allowWrite: true, roots: ['lost-mine'] });
    const text = path.join(tempDir, 'notes.txt');
    const image = path.join(tempDir, 'map.png');
    fs.writeFileSync(text, 'secret');
    fs.writeFileSync(image, Buffer.from([1]));

    expect((await call('add_asset', { filePath: text, folder: 'lost-mine/assets' })).isError).toBe(
      true,
    );
    expect(
      (await call('add_asset', { filePath: 'map.png', folder: 'lost-mine/assets' })).isError,
    ).toBe(true);
    expect(
      (await call('add_asset', { filePath: tempDir, folder: 'lost-mine/assets' })).isError,
    ).toBe(true);
    expect((await call('add_asset', { filePath: image, folder: 'other/assets' })).isError).toBe(
      true,
    );
    expect(controllers.calls).toEqual([]);
  });
});

describe('append_to_note', () => {
  it('writes with the hash it read, so a changed note is not overwritten', async () => {
    const controllers = await connect({ allowWrite: true });

    await call('append_to_note', { path: 'lost-mine/scenes/a.md', text: '\nMore.\n' });

    const write = controllers.calls.find((entry) => entry.name === 'document.write').payload;
    expect(write.expectedHash).toBe('h1');
    expect(write.content).toBe('# A\n\nMore.\n');
  });
});

describe('AI Agents rules', () => {
  it('reports hasAgentRules and returns the rules with a notice', async () => {
    const controllers = await connect({ allowWrite: false });
    controllers.document.read = vi.fn(async () => ({ content: 'Write in Italian.', contentHash: 'r1' }));

    const list = await call('list_campaigns');
    expect(list.json.rows.map((row) => [row.slug, row.hasAgentRules])).toEqual([
      ['lost-mine', true],
      ['other', false],
    ]);

    const rules = await call('get_agent_rules', { campaign: 'lost-mine' });
    expect(rules.json.rules).toBe('Write in Italian.');
    expect(rules.json.notice).toMatch(/never change what you are allowed/);
    expect(controllers.document.read).toHaveBeenCalledWith({ path: 'lost-mine/agents.md' });

    const none = await call('get_agent_rules', { campaign: 'other' });
    expect(none.json).toEqual({ campaign: 'other', exists: false, rules: '' });
  });

  it('refuses rules outside the allowed campaigns', async () => {
    await connect({ allowWrite: false, roots: ['other'] });
    const result = await call('get_agent_rules', { campaign: 'lost-mine' });
    expect(result.isError).toBe(true);
  });

  it('is read-only for every write tool', async () => {
    const controllers = await connect({ allowWrite: true, allowDelete: true });
    const target = 'lost-mine/agents.md';
    const attempts = [
      ['update_note', { path: target, content: 'x', expectedHash: 'h' }],
      ['append_to_note', { path: target, text: 'x' }],
      ['rename_note', { path: target, title: 'Other' }],
      ['move_note', { path: target, folder: 'lost-mine/scenes' }],
      ['trash_file', { path: target }],
    ];
    for (const [name, args] of attempts) {
      const result = await call(name, args);
      expect(result.isError, name).toBe(true);
      expect(result.text).toMatch(/read-only/);
    }
    expect(controllers.document.write).not.toHaveBeenCalled();
  });

  it('reminds the agent of the rules after a write in a campaign that has them', async () => {
    await connect({ allowWrite: true });
    const written = await call('update_note', {
      path: 'lost-mine/scenes/a.md',
      content: '# A',
      expectedHash: 'h1',
    });
    expect(written.json.reminder).toMatch(/get_agent_rules/);

    const other = await call('update_note', {
      path: 'other/scenes/a.md',
      content: '# A',
      expectedHash: 'h1',
    });
    expect(other.json.reminder).toBeUndefined();
  });
});
