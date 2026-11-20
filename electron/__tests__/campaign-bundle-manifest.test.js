import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const bundle = require('../models/campaign-bundle.model');
const campaignModel = require('../models/campaign.model');
const sectionModel = require('../models/section.model');
const templateModel = require('../models/template.model');
const battleRuleModel = require('../models/battle-rule.model');
const { readVaultConfig } = require('../models/vault.model');

const { ManifestError, MANIFEST_ERRORS, applyManifest, buildManifest, parseManifest } = bundle;

let vault;

beforeEach(async () => {
  vault = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-bundle-'));
  fs.mkdirSync(path.join(vault, '.lazydm'), { recursive: true });
  fs.writeFileSync(path.join(vault, '.lazydm', 'vault.json'), '{"schemaVersion":1,"name":"t"}\n');
  await campaignModel.createCampaign(vault, {
    slug: 'lost-mine',
    name: 'Lost Mine',
    description: 'A mine, lost.',
    system: 'dnd5e',
  });
});
afterEach(() => fs.rmSync(vault, { recursive: true, force: true }));

const put = (rel, content = '# x\n') => {
  const file = path.join(vault, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

const raw = (value) => JSON.stringify({ formatVersion: 1, ...value });

function codeOf(text) {
  try {
    parseManifest(text);
  } catch (error) {
    expect(error).toBeInstanceOf(ManifestError);
    return error.code;
  }
  return null;
}

describe('parseManifest: refused as a whole', () => {
  it.each([
    ['not JSON', '{nope', MANIFEST_ERRORS.invalidJson],
    ['an array', '[1,2]', MANIFEST_ERRORS.notObject],
    ['a string', '"x"', MANIFEST_ERRORS.notObject],
    ['null', 'null', MANIFEST_ERRORS.notObject],
    ['no version', '{"title":"x"}', MANIFEST_ERRORS.noVersion],
    ['version 0', '{"formatVersion":0}', MANIFEST_ERRORS.noVersion],
    ['a text version', '{"formatVersion":"1"}', MANIFEST_ERRORS.noVersion],
    ['a fractional version', '{"formatVersion":1.5}', MANIFEST_ERRORS.noVersion],
    ['a newer version', '{"formatVersion":2}', MANIFEST_ERRORS.newerVersion],
    ['a very new version', '{"formatVersion":9007199254740991}', MANIFEST_ERRORS.newerVersion],
  ])('%s', (_name, text, code) => {
    expect(codeOf(text)).toBe(code);
  });

  it('refuses a manifest over the text limit and anything that is not text', () => {
    expect(codeOf(`{"formatVersion":1,"title":"${'a'.repeat(3 * 1024 * 1024)}"}`)).toBe(
      MANIFEST_ERRORS.tooLarge,
    );
    expect(codeOf(undefined)).toBe(MANIFEST_ERRORS.tooLarge);
    expect(codeOf(42)).toBe(MANIFEST_ERRORS.tooLarge);
  });

  it('reads a Buffer like its text', () => {
    expect(parseManifest(Buffer.from(raw({ title: 'x' }))).manifest.title).toBe('x');
  });
});

describe('parseManifest: clamps and reports', () => {
  it('gives plain defaults for a bare manifest', () => {
    const { manifest, warnings } = parseManifest('{"formatVersion":1}');
    expect(warnings).toEqual([]);
    expect(manifest).toEqual({
      formatVersion: 1,
      title: null,
      description: null,
      system: 'generic',
      sections: { hidden: [], order: [], removed: [], labels: {}, custom: [] },
      templates: {},
      battleRule: null,
    });
  });

  it('cuts long text, strips control characters and keeps unknown keys out', () => {
    const { manifest } = parseManifest(
      raw({
        title: `  ${'T'.repeat(500)}\u0007  `,
        description: 'd'.repeat(2000),
        theme: 'dark',
        vaultPath: '/Users/someone/Codex',
        mcp: { token: 'secret' },
      }),
    );
    expect(manifest.title).toHaveLength(80);
    expect(manifest.title).not.toMatch(/[\u0000-\u001f]/);
    expect(manifest.description).toHaveLength(500);
    expect(JSON.stringify(manifest)).not.toMatch(/dark|someone|secret|theme|vaultPath|mcp/);
  });

  it('drops an unknown game system with a warning', () => {
    const { manifest, warnings } = parseManifest(raw({ system: 'starfinder' }));
    expect(manifest.system).toBe('generic');
    expect(warnings).toContainEqual({ code: 'unknown-system', field: 'system' });
    expect(parseManifest(raw({ system: 'pf2e' })).manifest.system).toBe('pf2e');
    expect(parseManifest(raw({ system: 7 })).manifest.system).toBe('generic');
  });

  it('accepts only a built-in battle rule, never a path to a file', () => {
    expect(parseManifest(raw({ battleRule: 'builtin:dnd5e' })).manifest.battleRule).toBe(
      'builtin:dnd5e',
    );
    for (const value of ['../../rule.json', '_battle-rules/mine.json', '/etc/passwd', 5, {}]) {
      const { manifest, warnings } = parseManifest(raw({ battleRule: value }));
      expect(manifest.battleRule).toBeNull();
      expect(warnings).toContainEqual({ code: 'invalid-field', field: 'battleRule' });
    }
  });

  it('keeps well-formed section keys and drops the rest', () => {
    const { manifest, warnings } = parseManifest(
      raw({
        sections: {
          hidden: ['scenes', 'scenes', '__proto__', '../x', 'Bad Key', 5, 'world'],
          order: 'scenes',
          labels: { characters: 'NPCs', constructor: 'x', world: 7, '': 'y' },
        },
      }),
    );
    expect(manifest.sections.hidden).toEqual(['scenes', 'world']);
    expect(manifest.sections.order).toEqual([]);
    expect(manifest.sections.labels).toEqual({ characters: 'NPCs' });
    expect(warnings.length).toBeGreaterThanOrEqual(4);
  });

  it('survives prototype keys and does not pollute Object', () => {
    const text =
      '{"formatVersion":1,"__proto__":{"polluted":true},"sections":{"__proto__":{"polluted":true},' +
      '"labels":{"__proto__":"x","constructor":"y"}},"templates":{"__proto__":"builtin"}}';
    const { manifest } = parseManifest(text);
    expect({}.polluted).toBeUndefined();
    expect(manifest.sections.labels).toEqual({});
    expect(manifest.templates).toEqual({});
    expect(Object.getPrototypeOf(manifest.templates)).toBe(Object.prototype);
  });

  it('checks custom sections one by one', () => {
    const { manifest, warnings } = parseManifest(
      raw({
        sections: {
          custom: [
            { key: 'factions', type: 'faction', label: 'Factions', icon: 'flag', description: 'Who.' },
            { key: 'factions', label: 'Again' },
            { key: 'Bad Key', label: 'x' },
            { key: 'cults' },
            'text',
            { key: 'cults', label: 'Cults' },
          ],
        },
      }),
    );
    expect(manifest.sections.custom).toEqual([
      { key: 'factions', type: 'faction', label: 'Factions', icon: 'flag', description: 'Who.' },
      { key: 'cults', type: 'cults', label: 'Cults', icon: 'folder', description: '' },
    ]);
    expect(warnings.filter((warning) => warning.field === 'sections.custom')).toHaveLength(4);
  });

  it('caps the number of custom sections', () => {
    const custom = Array.from({ length: 40 }, (_, index) => ({
      key: `section-${index}`,
      label: `Section ${index}`,
    }));
    const { manifest, warnings } = parseManifest(raw({ sections: { custom } }));
    expect(manifest.sections.custom).toHaveLength(30);
    expect(warnings).toContainEqual({ code: 'too-many', field: 'sections.custom' });
  });

  it('accepts a built-in template choice or a template in the zip, and nothing else', () => {
    const { manifest, warnings } = parseManifest(
      raw({
        templates: {
          enemy: 'builtin@dnd5e',
          scene: '_templates/my-scene.md',
          npc: '../../etc/passwd',
          item: '_templates/../escape.md',
          spell: '/abs/_templates/x.md',
          quest: 'other/_templates/x.md',
          world: '_templates/.hidden.md',
          session: '_templates/sub/deep.md',
          handout: 'builtin@nosuchsystem',
          location: 5,
        },
      }),
    );
    expect(manifest.templates).toEqual({ enemy: 'builtin@dnd5e', scene: '_templates/my-scene.md' });
    expect(warnings.filter((warning) => warning.field === 'templates')).toHaveLength(8);
  });
});

describe('buildManifest', () => {
  it('writes the campaign card and settings, and nothing personal', async () => {
    sectionModel.saveCampaignSectionSettings(vault, 'lost-mine', {
      hidden: ['spells'],
      order: ['world', 'scenes'],
      labels: { characters: 'NPCs' },
      custom: [{ label: 'Factions', type: 'faction', icon: 'flag', description: 'Who is who.' }],
    });
    battleRuleModel.setCampaignChoice(vault, 'lost-mine', 'builtin:dnd5e');
    templateModel.setCampaignRule(vault, 'lost-mine', 'enemy', 'builtin@dnd5e');

    const { manifest, dropped } = await buildManifest(vault, 'lost-mine', {
      appVersion: '1.0.0',
      now: new Date('2026-11-20T10:00:00Z'),
    });

    expect(dropped).toEqual([]);
    expect(manifest).toMatchObject({
      formatVersion: 1,
      app: { name: 'lazydm', version: '1.0.0' },
      exportedAt: '2026-11-20',
      title: 'Lost Mine',
      description: 'A mine, lost.',
      system: 'dnd5e',
      sections: {
        hidden: ['spells'],
        order: ['world', 'scenes'],
        labels: { characters: 'NPCs' },
        custom: [{ key: 'factions', type: 'faction', label: 'Factions', icon: 'flag' }],
      },
      templates: { enemy: 'builtin@dnd5e' },
      battleRule: 'builtin:dnd5e',
    });

    const text = JSON.stringify(manifest);
    expect(text).not.toContain(vault);
    expect(text).not.toMatch(/theme|language|token|mcp|tabs|vault\.json|schemaVersion/i);
    expect(Object.keys(manifest).sort()).toEqual(
      [
        'app',
        'battleRule',
        'description',
        'exportedAt',
        'formatVersion',
        'sections',
        'system',
        'templates',
        'title',
      ].sort(),
    );
  });

  it('writes a campaign with no settings as plain defaults', async () => {
    const { manifest } = await buildManifest(vault, 'lost-mine');
    expect(manifest.sections).toEqual({ hidden: [], order: [], removed: [], labels: {}, custom: [] });
    expect(manifest.templates).toEqual({});
    expect(manifest.battleRule).toBeNull();
    expect(manifest.app.version).toBeNull();
  });

  it('writes a generic campaign as "generic"', async () => {
    await campaignModel.createCampaign(vault, { slug: 'plain', name: 'Plain' });
    expect((await buildManifest(vault, 'plain')).manifest.system).toBe('generic');
  });

  it('rewrites template choices relative to the zip', async () => {
    put('lost-mine/_templates/scene.md', '---\ntitle: "{{title}}"\n---\n');
    put('_templates/enemy.md', '---\ntitle: "{{title}}"\n---\n');
    put('compendium/dnd/_templates/spell.md', '---\ntitle: "{{title}}"\n---\n');
    put('compendium/dnd/_templates/item.md', '---\ntitle: "{{title}}"\n---\n');
    templateModel.setCampaignRule(vault, 'lost-mine', 'scene', 'lost-mine/_templates/scene.md');
    templateModel.setCampaignRule(vault, 'lost-mine', 'enemy', '_templates/enemy.md');
    templateModel.setCampaignRule(vault, 'lost-mine', 'spell', 'compendium/dnd/_templates/spell.md');
    templateModel.setCampaignRule(vault, 'lost-mine', 'item', 'compendium/dnd/_templates/item.md');

    const { manifest, dropped } = await buildManifest(vault, 'lost-mine', {
      templateMap: new Map([
        ['_templates/enemy.md', '_templates/enemy.md'],
        ['compendium/dnd/_templates/spell.md', '_templates/spell.md'],
      ]),
    });

    expect(manifest.templates).toEqual({
      scene: '_templates/scene.md',
      enemy: '_templates/enemy.md',
      spell: '_templates/spell.md',
    });
    expect(dropped).toEqual(['compendium/dnd/_templates/item.md']);
  });

  it('throws for a campaign that does not exist', async () => {
    await expect(buildManifest(vault, 'nope')).rejects.toThrow(/does not exist/);
  });
});

describe('manifest round trip', () => {
  it('parse(build(x)) gives back the same settings', async () => {
    sectionModel.saveCampaignSectionSettings(vault, 'lost-mine', {
      hidden: ['spells'],
      order: ['world', 'scenes'],
      removed: ['items'],
      labels: { characters: 'NPCs' },
      custom: [{ label: 'Factions', type: 'faction', icon: 'flag', description: 'Who is who.' }],
    });
    battleRuleModel.setCampaignChoice(vault, 'lost-mine', 'builtin:pf2e');
    templateModel.setCampaignRule(vault, 'lost-mine', 'enemy', 'builtin@dnd5e');

    const { manifest } = await buildManifest(vault, 'lost-mine');
    const { manifest: parsed, warnings } = parseManifest(JSON.stringify(manifest));

    expect(warnings).toEqual([]);
    const { app: _app, exportedAt: _exportedAt, ...built } = manifest;
    expect(parsed).toEqual(built);
  });
});

describe('applyManifest', () => {
  async function newCampaign(slug = 'copy') {
    await campaignModel.createCampaign(vault, { slug, name: 'Copy' });
    return slug;
  }

  it('applies sections, template choices and the tracker layout to the new slug only', async () => {
    sectionModel.saveCampaignSectionSettings(vault, 'lost-mine', {
      hidden: ['spells'],
      labels: { characters: 'NPCs' },
      custom: [{ label: 'Factions', type: 'faction', icon: 'flag', description: 'Who.' }],
    });
    battleRuleModel.setCampaignChoice(vault, 'lost-mine', 'builtin:dnd5e');
    templateModel.setCampaignRule(vault, 'lost-mine', 'enemy', 'builtin@dnd5e');
    const { manifest } = await buildManifest(vault, 'lost-mine');
    const { manifest: parsed } = parseManifest(JSON.stringify(manifest));

    const slug = await newCampaign();
    const { warnings } = applyManifest(vault, slug, parsed);

    expect(warnings).toEqual([]);
    const settings = sectionModel.readCampaignSectionSettings(vault, slug);
    expect(settings.hidden).toEqual(['spells']);
    expect(settings.labels).toEqual({ characters: 'NPCs' });
    expect(settings.custom.map((section) => section.key)).toEqual(['factions']);
    expect(templateModel.readCampaignRules(vault, slug)).toEqual({ enemy: 'builtin@dnd5e' });
    expect(battleRuleModel.readCampaignChoice(vault, slug)).toBe('builtin:dnd5e');
    // The other campaign keeps its own, untouched.
    expect(battleRuleModel.readCampaignChoice(vault, 'lost-mine')).toBe('builtin:dnd5e');
    expect(Object.keys(readVaultConfig(vault).sections.campaigns).sort()).toEqual([
      'copy',
      'lost-mine',
    ]);
  });

  it('links a template the zip carried, now in the new campaign', async () => {
    const slug = await newCampaign();
    put(`${slug}/_templates/scene.md`, '---\ntitle: "{{title}}"\n---\n');
    const { manifest } = parseManifest(raw({ templates: { scene: '_templates/scene.md' } }));

    const { warnings } = applyManifest(vault, slug, manifest);

    expect(warnings).toEqual([]);
    expect(templateModel.readCampaignRules(vault, slug)).toEqual({
      scene: `${slug}/_templates/scene.md`,
    });
  });

  it('skips a template choice whose file is not there, and says so', async () => {
    const slug = await newCampaign();
    const { manifest } = parseManifest(
      raw({ templates: { scene: '_templates/gone.md', enemy: 'builtin' } }),
    );

    const { warnings } = applyManifest(vault, slug, manifest);

    expect(warnings).toContainEqual({ code: 'template-missing', field: 'templates' });
    expect(templateModel.readCampaignRules(vault, slug)).toEqual({ enemy: 'builtin' });
  });

  it('skips a choice for a note type the campaign does not have', async () => {
    const slug = await newCampaign();
    const { manifest } = parseManifest(raw({ templates: { dragon: 'builtin' } }));

    const { warnings } = applyManifest(vault, slug, manifest);

    expect(warnings).toContainEqual({ code: 'unknown-note-type', field: 'templates' });
    expect(templateModel.readCampaignRules(vault, slug)).toEqual({});
  });

  it('keeps the campaign usable when its sections are rejected', async () => {
    const slug = await newCampaign();
    // A custom section that takes the note type of a default one is refused by the section model.
    const { manifest } = parseManifest(
      raw({
        sections: { custom: [{ key: 'acts', type: 'scene', label: 'Acts' }], hidden: ['world'] },
      }),
    );

    const { warnings } = applyManifest(vault, slug, manifest);

    expect(warnings).toContainEqual({ code: 'sections-rejected', field: 'sections' });
    expect(fs.existsSync(path.join(vault, slug, 'campaign.md'))).toBe(true);
  });

  it('writes nothing for a manifest with nothing to apply', async () => {
    const slug = await newCampaign();
    const { manifest } = parseManifest('{"formatVersion":1}');

    expect(applyManifest(vault, slug, manifest).warnings).toEqual([]);
    expect(readVaultConfig(vault).battleRules).toBeUndefined();
    expect(readVaultConfig(vault).templates?.campaigns?.[slug]).toBeUndefined();
  });
});
