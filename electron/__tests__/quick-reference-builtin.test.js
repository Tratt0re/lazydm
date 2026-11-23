import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const builtin = require('../models/quick-reference-builtin.model');
const model = require('../models/quick-reference.model');
const campaignModel = require('../models/campaign.model');

const { QUICK_REFERENCE_ICONS, QUICK_REFERENCE_LIMITS: LIMITS } = model;
const DATA_DIR = path.join(__dirname, '..', 'data', 'quick-reference');
const SYSTEMS_WITH_RULES = ['dnd5e'];

const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, ...parts), 'utf8'));
const hasFile = (...parts) => fs.existsSync(path.join(DATA_DIR, ...parts));

describe.each(SYSTEMS_WITH_RULES)('built-in rules of %s: structure', (system) => {
  const structure = readJson(system, 'rules.json');

  it('has unique, slug-shaped ids and a known system', () => {
    expect(structure.system).toBe(system);
    const ids = structure.rules.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [...ids, ...structure.categories]) {
      expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
    expect(new Set(structure.categories).size).toBe(structure.categories.length);
  });

  it('only uses icons the app has and categories that exist', () => {
    for (const rule of structure.rules) {
      expect(QUICK_REFERENCE_ICONS, `${rule.id}: icon ${rule.icon}`).toContain(rule.icon);
      expect(rule.categories.length, `${rule.id} has a category`).toBeGreaterThan(0);
      for (const category of rule.categories) {
        expect(structure.categories, `${rule.id}: category ${category}`).toContain(category);
      }
    }
  });

  it('keeps every rule in at least one category and no rule twice', () => {
    for (const rule of structure.rules) {
      expect(rule.categories.length, rule.id).toBeGreaterThan(0);
      expect(new Set(rule.categories).size, rule.id).toBe(rule.categories.length);
    }
  });

  it('puts every category to use', () => {
    const used = new Set(structure.rules.flatMap((rule) => rule.categories));
    for (const category of structure.categories) {
      expect(used.has(category), `category ${category} is empty`).toBe(true);
    }
  });

  it('carries the SRD 5.1 attribution statement and says the text was adapted', () => {
    expect(structure.attribution).toContain(
      'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC',
    );
    expect(structure.attribution).toContain(
      'https://dnd.wizards.com/resources/systems-reference-document',
    );
    expect(structure.attribution).toContain(
      'https://creativecommons.org/licenses/by/4.0/legalcode',
    );
    expect(structure.attribution).toMatch(/shortened and rearranged/);
    expect(structure.attribution.length).toBeLessThanOrEqual(LIMITS.attribution);
  });
});

describe.each(SYSTEMS_WITH_RULES)('built-in rules of %s: words', (system) => {
  const structure = readJson(system, 'rules.json');
  const present = builtin.BUILTIN_LANGUAGES.filter((language) =>
    hasFile(system, `${language}.json`),
  );

  it('ships English, the language every other one falls back to', () => {
    expect(present).toContain('en');
  });

  describe.each(present)('%s', (language) => {
    const words = readJson(system, `${language}.json`);

    it('has every category and every rule, and nothing else', () => {
      expect(Object.keys(words.categories).sort()).toEqual([...structure.categories].sort());
      expect(Object.keys(words.rules).sort()).toEqual(structure.rules.map((r) => r.id).sort());
    });

    it('has text everywhere and stays inside the caps, so nothing is cut when it is read', () => {
      for (const name of Object.values(words.categories)) {
        expect(name.trim().length).toBeGreaterThan(0);
        expect(name.length).toBeLessThanOrEqual(LIMITS.categoryName);
      }
      for (const [id, rule] of Object.entries(words.rules)) {
        expect(Object.keys(rule).sort(), id).toEqual(['full', 'short', 'title']);
        expect(rule.title.trim().length, `${id} title`).toBeGreaterThan(0);
        expect(rule.short.trim().length, `${id} short`).toBeGreaterThan(0);
        expect(rule.full.trim().length, `${id} full`).toBeGreaterThan(0);
        expect(rule.title.length, `${id} title`).toBeLessThanOrEqual(LIMITS.title);
        expect(rule.short.length, `${id} short`).toBeLessThanOrEqual(LIMITS.short);
        expect(rule.full.length, `${id} full`).toBeLessThanOrEqual(LIMITS.full);
        expect(rule.short, `${id} short is one line`).not.toMatch(/\n/);
      }
    });

    it('reads back without a single warning or change', () => {
      const data = builtin.buildBuiltin(system, language);
      expect(model.normalizeQuickReference(data)).toEqual({ data, warnings: [] });
      expect(data.rules).toHaveLength(structure.rules.length);
      expect(data.rules.every((rule) => rule.source === `${system}/${rule.id}`)).toBe(true);
    });

    it('does not use raw HTML in the text', () => {
      for (const [id, rule] of Object.entries(words.rules)) {
        expect(rule.full, id).not.toMatch(/<\/?[a-z][^>]*>/i);
      }
    });
  });
});

describe('buildBuiltin', () => {
  it('has nothing for Generic, a system without data, or something that is not a system', () => {
    for (const system of ['generic', 'pf2e', 'nope', '', null, '../x']) {
      expect(builtin.buildBuiltin(system, 'en')).toBeNull();
      expect(builtin.hasBuiltin(system)).toBe(false);
    }
    expect(builtin.hasBuiltin('dnd5e')).toBe(true);
  });

  it('answers English for a language it does not have', () => {
    const en = builtin.buildBuiltin('dnd5e', 'en');
    for (const language of ['xx', '', null, undefined, '../en', 'EN']) {
      expect(builtin.buildBuiltin('dnd5e', language)).toEqual(en);
    }
  });

  describe('a language that is only partly written', () => {
    // The loader reads its folder once, so this runs against a copy in a temp folder in a fresh module.
    let temp;
    let partial;
    let english;
    beforeEach(() => {
      temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-qrdata-'));
      fs.cpSync(DATA_DIR, temp, { recursive: true });
      fs.writeFileSync(
        path.join(temp, 'dnd5e', 'de.json'),
        JSON.stringify({
          categories: { movement: 'Bewegung' },
          rules: {
            dodge: { title: 'Ausweichen', short: 'Kurz.', full: 'Lang.' },
            dash: { title: 'Spurt' },
          },
        }),
      );
      const modulePath = require.resolve('../models/quick-reference-builtin.model');
      const saved = process.env.LAZYDM_QUICK_REFERENCE_DATA;
      process.env.LAZYDM_QUICK_REFERENCE_DATA = temp;
      delete require.cache[modulePath];
      partial = require('../models/quick-reference-builtin.model');
      english = partial.buildBuiltin('dnd5e', 'en');
      process.env.LAZYDM_QUICK_REFERENCE_DATA = saved;
      if (saved === undefined) {
        delete process.env.LAZYDM_QUICK_REFERENCE_DATA;
      }
      delete require.cache[modulePath];
    });
    afterEach(() => fs.rmSync(temp, { recursive: true, force: true }));

    it('uses its words where it has them and English for the rest, so no card is empty', () => {
      const de = partial.buildBuiltin('dnd5e', 'de');
      const rule = (data, id) => data.rules.find((r) => r.id === id);
      expect(rule(de, 'dodge')).toMatchObject({ title: 'Ausweichen', short: 'Kurz.', full: 'Lang.' });
      expect(rule(de, 'dash').title).toBe('Spurt');
      expect(rule(de, 'dash').short).toBe(rule(english, 'dash').short);
      expect(rule(de, 'dash').full).toBe(rule(english, 'dash').full);
      expect(rule(de, 'hide')).toEqual(rule(english, 'hide'));
      expect(de.categories.find((c) => c.id === 'movement').name).toBe('Bewegung');
      expect(de.categories.find((c) => c.id === 'actions').name).toBe(
        english.categories.find((c) => c.id === 'actions').name,
      );
      expect(de.rules.every((r) => r.title && r.short && r.full)).toBe(true);
    });
  });

  it('turns any value that is not a language of the app into English', () => {
    expect(builtin.toLanguage('it')).toBe('it');
    for (const value of ['xx', '', null, undefined, 3, {}, '../en', 'EN', 'en-US']) {
      expect(builtin.toLanguage(value)).toBe('en');
    }
  });

  it('covers the topics a table looks up in a fight', () => {
    const ids = builtin.listBuiltinRuleIds('dnd5e');
    for (const id of [
      'dodge',
      'dash',
      'disengage',
      'prone',
      'grappled',
      'cover',
      'opportunity-attack',
      'death-saving-throws',
      'exhaustion',
      'falling',
    ]) {
      expect(ids, id).toContain(id);
    }
  });

  it('has all fifteen conditions of the SRD', () => {
    const data = builtin.buildBuiltin('dnd5e', 'en');
    const names = data.rules
      .filter((rule) => rule.categories.includes('conditions') && rule.id !== 'about-conditions')
      .map((rule) => rule.title)
      .sort();
    expect(names).toEqual(
      [
        'Blinded',
        'Charmed',
        'Deafened',
        'Exhaustion',
        'Frightened',
        'Grappled',
        'Incapacitated',
        'Invisible',
        'Paralyzed',
        'Petrified',
        'Poisoned',
        'Prone',
        'Restrained',
        'Stunned',
        'Unconscious',
      ].sort(),
    );
  });

  it('keeps a rule that belongs in two places once, with both categories', () => {
    const data = builtin.buildBuiltin('dnd5e', 'en');
    const prone = data.rules.filter((rule) => rule.id === 'prone');
    expect(prone).toHaveLength(1);
    expect([...prone[0].categories].sort()).toEqual(['conditions', 'movement']);
  });

  it('gets the numbers of the SRD right in the rules most likely to be misquoted', () => {
    const text = (id) => builtin.buildBuiltin('dnd5e', 'en').rules.find((r) => r.id === id).full;
    expect(text('cover')).toMatch(/\+2 bonus to AC/);
    expect(text('cover')).toMatch(/\+5 bonus to AC/);
    expect(text('falling')).toMatch(/1d6 bludgeoning damage for every 10 feet.*20d6/);
    expect(text('exhaustion')).toMatch(/6\. Death/);
    expect(text('exhaustion')).toMatch(/2\. Speed halved/);
    expect(text('death-saving-throws')).toMatch(/10 or higher/);
    expect(text('stabilizing')).toMatch(/DC 10 Wisdom \(Medicine\)/);
    expect(text('prone')).toMatch(/half your speed/);
    expect(text('opportunity-attack')).toMatch(/reaction/);
  });
});

describe('seeding a campaign', () => {
  let root;
  let vault;

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-qrseed-'));
    vault = path.join(root, 'codex');
    fs.mkdirSync(path.join(vault, '.lazydm'), { recursive: true });
    fs.writeFileSync(path.join(vault, '.lazydm', 'vault.json'), '{"schemaVersion":1,"name":"t"}\n');
    await campaignModel.createCampaign(vault, {
      slug: 'lost-mine',
      name: 'Lost Mine',
      system: 'dnd5e',
    });
    await campaignModel.createCampaign(vault, { slug: 'plain', name: 'Plain' });
    await campaignModel.createCampaign(vault, {
      slug: 'pathfinder',
      name: 'Pathfinder',
      system: 'pf2e',
    });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const file = (slug) => path.join(vault, slug, 'quick-reference.json');

  it('creates the file from the campaign system the first time', async () => {
    const result = await builtin.seedQuickReference(vault, 'lost-mine', 'en');
    expect(result.exists).toBe(true);
    expect(result.data.system).toBe('dnd5e');
    expect(result.data.rules.length).toBeGreaterThan(50);
    expect(result.data.attribution).toContain('System Reference Document 5.1');
    expect(result.warnings).toEqual([]);
    expect(fs.existsSync(file('lost-mine'))).toBe(true);
  });

  it('never touches a file that exists, even an emptied one', async () => {
    fs.writeFileSync(
      file('lost-mine'),
      '{"formatVersion":1,"system":"dnd5e","categories":[],"rules":[]}\n',
    );
    const before = fs.readFileSync(file('lost-mine'), 'utf8');
    const result = await builtin.seedQuickReference(vault, 'lost-mine', 'en');
    expect(result.data.rules).toEqual([]);
    expect(fs.readFileSync(file('lost-mine'), 'utf8')).toBe(before);
  });

  it('keeps a file the user edited, down to a single word', async () => {
    const first = await builtin.seedQuickReference(vault, 'lost-mine', 'en');
    const edited = structuredClone(first.data);
    edited.rules.find((r) => r.id === 'dodge').short = 'My house rule.';
    await model.writeQuickReference(vault, 'lost-mine', edited, first.contentHash);

    const again = await builtin.seedQuickReference(vault, 'lost-mine', 'it');
    expect(again.data.rules.find((r) => r.id === 'dodge').short).toBe('My house rule.');
    expect(again.data.rules.find((r) => r.id === 'dash').short).toBe(
      first.data.rules.find((r) => r.id === 'dash').short,
    );
  });

  it('seeding twice changes nothing', async () => {
    const first = await builtin.seedQuickReference(vault, 'lost-mine', 'en');
    const second = await builtin.seedQuickReference(vault, 'lost-mine', 'en');
    expect(second.contentHash).toBe(first.contentHash);
  });

  it('creates nothing for Generic or for a system with no rules yet', async () => {
    for (const slug of ['plain', 'pathfinder']) {
      const result = await builtin.seedQuickReference(vault, slug, 'en');
      expect(result).toMatchObject({ exists: false, data: { rules: [] } });
      expect(fs.existsSync(file(slug))).toBe(false);
    }
  });

  it('refuses a campaign that does not exist', async () => {
    await expect(builtin.seedQuickReference(vault, 'nope', 'en')).rejects.toThrow(/not found/i);
  });
});

describe('start from a system, and reset', () => {
  let root;
  let vault;

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-qrseed-'));
    vault = path.join(root, 'codex');
    fs.mkdirSync(path.join(vault, '.lazydm'), { recursive: true });
    fs.writeFileSync(path.join(vault, '.lazydm', 'vault.json'), '{"schemaVersion":1,"name":"t"}\n');
    await campaignModel.createCampaign(vault, { slug: 'plain', name: 'Plain' });
    await campaignModel.createCampaign(vault, {
      slug: 'lost-mine',
      name: 'Lost Mine',
      system: 'dnd5e',
    });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('copies a system into an empty Generic campaign', async () => {
    const result = await builtin.addBuiltinRules(vault, 'plain', 'dnd5e', 'en', null);
    expect(result.status).toBe('saved');
    expect(result.data.rules.length).toBe(builtin.listBuiltinRuleIds('dnd5e').length);
    expect(result.data.system).toBe('dnd5e');
    expect(result.data.attribution).toContain('SRD 5.1');
  });

  it('keeps what the user wrote and changed, and running again does not duplicate', async () => {
    const seeded = await builtin.seedQuickReference(vault, 'lost-mine', 'en');
    const edited = structuredClone(seeded.data);
    edited.rules.find((r) => r.id === 'dodge').short = 'My table rule.';
    edited.rules = edited.rules.filter((r) => r.id !== 'dash');
    edited.rules.push({
      id: 'mine',
      title: 'Mine',
      short: 's',
      full: 'f',
      icon: 'star',
      categories: [],
    });
    const saved = await model.writeQuickReference(vault, 'lost-mine', edited, seeded.contentHash);

    const result = await builtin.addBuiltinRules(
      vault,
      'lost-mine',
      'dnd5e',
      'en',
      saved.contentHash,
    );
    expect(result.status).toBe('saved');
    const ids = result.data.rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.data.rules.find((r) => r.id === 'dodge').short).toBe('My table rule.');
    expect(ids).toContain('mine');
    expect(ids).toContain('dash');
    expect(result.data.rules).toHaveLength(builtin.listBuiltinRuleIds('dnd5e').length + 1);

    const again = await builtin.addBuiltinRules(
      vault,
      'lost-mine',
      'dnd5e',
      'en',
      result.contentHash,
    );
    expect(again.data).toEqual(result.data);
  });

  it('refuses a system with no rules and leaves the file alone', async () => {
    await expect(builtin.addBuiltinRules(vault, 'plain', 'pf2e', 'en', null)).rejects.toThrow(
      /no built-in/i,
    );
    await expect(builtin.addBuiltinRules(vault, 'plain', 'generic', 'en', null)).rejects.toThrow();
    expect(fs.existsSync(path.join(vault, 'plain', 'quick-reference.json'))).toBe(false);
  });

  it('answers a conflict instead of overwriting a file changed meanwhile', async () => {
    const seeded = await builtin.seedQuickReference(vault, 'lost-mine', 'en');
    fs.writeFileSync(
      path.join(vault, 'lost-mine', 'quick-reference.json'),
      JSON.stringify({ ...seeded.data, attribution: 'other computer' }),
    );
    const result = await builtin.addBuiltinRules(
      vault,
      'lost-mine',
      'dnd5e',
      'en',
      seeded.contentHash,
    );
    expect(result.status).toBe('conflict');
  });

  it('puts one rule back to its words and icon, keeping its categories and the other rules', async () => {
    const seeded = await builtin.seedQuickReference(vault, 'lost-mine', 'en');
    const edited = structuredClone(seeded.data);
    const dodge = edited.rules.find((r) => r.id === 'dodge');
    Object.assign(dodge, {
      title: 'Duck',
      short: 'x',
      full: 'y',
      icon: 'skull',
      categories: ['reactions'],
    });
    edited.rules.find((r) => r.id === 'dash').short = 'kept';
    const saved = await model.writeQuickReference(vault, 'lost-mine', edited, seeded.contentHash);

    const result = await builtin.resetBuiltinRule(
      vault,
      'lost-mine',
      'dodge',
      'en',
      saved.contentHash,
    );
    expect(result.status).toBe('saved');
    const after = result.data.rules.find((r) => r.id === 'dodge');
    const original = seeded.data.rules.find((r) => r.id === 'dodge');
    expect(after).toEqual({ ...original, categories: ['reactions'] });
    expect(result.data.rules.find((r) => r.id === 'dash').short).toBe('kept');
  });

  it("has nothing to reset for the user's own rule or for a rule that does not exist", async () => {
    const seeded = await builtin.seedQuickReference(vault, 'lost-mine', 'en');
    const edited = structuredClone(seeded.data);
    edited.rules.push({
      id: 'mine',
      title: 'Mine',
      short: '',
      full: '',
      icon: 'star',
      categories: [],
    });
    const saved = await model.writeQuickReference(vault, 'lost-mine', edited, seeded.contentHash);
    await expect(
      builtin.resetBuiltinRule(vault, 'lost-mine', 'mine', 'en', saved.contentHash),
    ).rejects.toThrow(/not a built-in/i);
    await expect(
      builtin.resetBuiltinRule(vault, 'lost-mine', 'nope', 'en', saved.contentHash),
    ).rejects.toThrow(/no rule/i);
  });
});
