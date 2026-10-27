import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createMcpServer } = require('../mcp/tools');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');

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
    encounter: { read: record('encounter.read') },
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
    expect(names.filter((name) => /campaign|section|system|empty|purge|permanent/.test(name) && /trash|delete|remove/.test(name))).toEqual([]);
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

describe('rename tools', () => {
  it('pass the new name through and check the scope', async () => {
    const controllers = await connect({ allowWrite: true, roots: ['lost-mine'] });

    expect(
      (await call('rename_note', { path: 'lost-mine/enemies/a.md', title: 'Boss', updateLinks: false })).isError,
    ).toBe(false);
    expect((await call('rename_asset', { path: 'lost-mine/assets/m.png', name: 'Map' })).isError).toBe(false);
    expect((await call('rename_folder', { folder: 'lost-mine/enemies/humans', name: 'People' })).isError).toBe(false);

    expect((await call('rename_note', { path: 'other/enemies/a.md', title: 'Boss' })).isError).toBe(true);
    expect((await call('rename_folder', { folder: 'other/enemies/humans', name: 'x' })).isError).toBe(true);

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
    const controllers = await connect({ allowWrite: true, allowDelete: true, roots: ['lost-mine'] });

    expect((await call('trash_file', { path: 'lost-mine/enemies/a.md' })).isError).toBe(false);
    expect(
      (await call('trash_folder', { folder: 'lost-mine/enemies/humans', mode: 'moveToMain', rewriteLinks: false })).isError,
    ).toBe(false);

    expect((await call('trash_file', { path: 'other/enemies/a.md' })).isError).toBe(true);
    expect((await call('trash_folder', { folder: 'other/enemies/humans', mode: 'delete' })).isError).toBe(true);
    expect((await call('trash_folder', { folder: 'lost-mine/enemies/humans', mode: 'everything' })).isError).toBe(true);

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
