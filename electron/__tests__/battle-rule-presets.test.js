import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const battleRuleModel = require('../models/battle-rule.model');
const templateModel = require('../models/template.model');

const { BUILT_IN_RULES, DEFAULT_BATTLE_RULE, getBuiltInRule, isBuiltInRuleRef } = battleRuleModel;
const FRONTMATTER_PREFIX = 'frontmatter:';

describe('built-in battle rules', () => {
  it('ships the default rule and one per game system', () => {
    expect(Object.keys(BUILT_IN_RULES)).toEqual(['builtin', 'builtin:dnd5e', 'builtin:pf2e']);
    expect(BUILT_IN_RULES.builtin).toBe(DEFAULT_BATTLE_RULE);
  });

  it('recognises references, and only those', () => {
    expect(isBuiltInRuleRef('builtin')).toBe(true);
    expect(isBuiltInRuleRef('builtin:dnd5e')).toBe(true);
    expect(isBuiltInRuleRef('builtin:nope')).toBe(false);
    expect(isBuiltInRuleRef('builtin-camp/_battle-rules/x.json')).toBe(false);
    expect(isBuiltInRuleRef('__proto__')).toBe(false);
    expect(isBuiltInRuleRef(null)).toBe(false);
  });

  it('gives the default rule for an unknown reference', () => {
    expect(getBuiltInRule('builtin:nope')).toBe(DEFAULT_BATTLE_RULE);
    expect(getBuiltInRule(undefined)).toBe(DEFAULT_BATTLE_RULE);
  });

  it('keeps the default rule as it was', () => {
    expect(DEFAULT_BATTLE_RULE.name).toBe('Generic');
    expect(DEFAULT_BATTLE_RULE.template).toBe('builtin:enemy');
    expect(DEFAULT_BATTLE_RULE.initiative.roll).toBe('1d20 + {initiative_mod}');
  });

  it.each(Object.entries(BUILT_IN_RULES))('%s survives normalisation unchanged', (_ref, rule) => {
    const normalized = battleRuleModel.normalizeBattleRule(JSON.parse(JSON.stringify(rule)));
    expect(normalized.fields.map((field) => [field.key, field.area])).toEqual(
      rule.fields.map((field) => [field.key, field.area]),
    );
    expect(normalized.nameArea).toEqual(rule.nameArea);
  });

  it.each(Object.entries(BUILT_IN_RULES))(
    '%s reads only keys its template declares, and rolls with them',
    async (_ref, rule) => {
      const keys = await templateModel.readTemplateKeys('/unused', rule.template);
      const read = rule.fields
        .filter((field) => field.source.startsWith(FRONTMATTER_PREFIX))
        .map((field) => field.source.slice(FRONTMATTER_PREFIX.length));
      expect(read.filter((key) => !keys.includes(key))).toEqual([]);

      const variables = [...(rule.initiative.roll ?? '').matchAll(/\{(\w+)\}/g)].map(
        (match) => match[1],
      );
      expect(variables.filter((key) => !keys.includes(key))).toEqual([]);
    },
  );

  it.each(Object.entries(BUILT_IN_RULES))('%s gives every side field its choices', (_ref, rule) => {
    for (const field of rule.fields.filter((item) => item.component === 'side')) {
      expect(field.options, field.key).toEqual(['enemy', 'player', 'ally']);
    }
  });

  it.each(Object.entries(BUILT_IN_RULES))('%s has no overlapping places', (_ref, rule) => {
    const places = [
      ...rule.fields.filter((field) => field.showInRow).map((field) => field.area),
      rule.nameArea,
    ];
    for (const [index, first] of places.entries()) {
      for (const second of places.slice(index + 1)) {
        const sameRow = first.row === second.row;
        const overlap =
          first.column <= second.column + second.span - 1 &&
          second.column <= first.column + first.span - 1;
        expect(sameRow && overlap, JSON.stringify([first, second])).toBe(false);
      }
    }
  });
});

describe('battle rule choices', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'lazydm-rule-presets-'));
    fs.mkdirSync(path.join(root, 'camp', 'encounters'), { recursive: true });
    fs.mkdirSync(path.join(root, '.lazydm'), { recursive: true });
    fs.writeFileSync(path.join(root, '.lazydm', 'vault.json'), '{}');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('keeps a campaign choice of a system rule', () => {
    expect(battleRuleModel.setCampaignChoice(root, 'camp', 'builtin:pf2e')).toBe('builtin:pf2e');
    expect(battleRuleModel.readCampaignChoice(root, 'camp')).toBe('builtin:pf2e');
  });

  it('keeps a campaign choice of the default built-in, as before', () => {
    expect(battleRuleModel.setCampaignChoice(root, 'camp', 'builtin')).toBe('builtin');
  });

  it('drops a choice of a reference it does not ship', () => {
    battleRuleModel.setCampaignChoice(root, 'camp', 'builtin:nope');
    expect(battleRuleModel.readCampaignChoice(root, 'camp')).toBeNull();
  });

  it('resolves an encounter to the rule it names', async () => {
    const rule = await battleRuleModel.resolveBattleRule(root, 'camp/encounters/a.json', 'builtin:dnd5e');
    expect(rule.name).toBe('D&D 5e');
  });

  it('resolves to the campaign choice when the encounter has none', async () => {
    battleRuleModel.setCampaignChoice(root, 'camp', 'builtin:pf2e');
    const rule = await battleRuleModel.resolveBattleRule(root, 'camp/encounters/a.json', null);
    expect(rule.name).toBe('Pathfinder 2e');
  });

  it("lets an encounter's own choice win over the campaign's", async () => {
    battleRuleModel.setCampaignChoice(root, 'camp', 'builtin:pf2e');
    const rule = await battleRuleModel.resolveBattleRule(root, 'camp/encounters/a.json', 'builtin');
    expect(rule).toBe(DEFAULT_BATTLE_RULE);
  });

  it('falls through to the default for an unknown reference', async () => {
    const rule = await battleRuleModel.resolveBattleRule(root, 'camp/encounters/a.json', 'builtin:nope');
    expect(rule).toBe(DEFAULT_BATTLE_RULE);
  });

  it('starts a new rule file from the built-in it is asked to', async () => {
    const rulePath = await battleRuleModel.createBattleRuleFile(root, 'my-pf', 'My PF', 'builtin:pf2e');
    const file = await battleRuleModel.readBattleRuleFile(root, rulePath);
    expect(file.rule.name).toBe('My PF');
    expect(file.rule.template).toBe('builtin:enemy@pf2e');
    expect(file.rule.fields.map((field) => field.key)).toContain('fortitude');
  });

  it('starts a new rule file from the default when no built-in is named', async () => {
    const rulePath = await battleRuleModel.createBattleRuleFile(root, 'my', 'My');
    const file = await battleRuleModel.readBattleRuleFile(root, rulePath);
    expect(file.rule.template).toBe('builtin:enemy');
  });
});

describe('built-in rule labels', () => {
  const LANGUAGES = ['en', 'it', 'de', 'es', 'fr', 'uk', 'zh'];
  const lookup = (messages, key) => key.split('.').reduce((node, part) => node?.[part], messages);

  it.each(LANGUAGES)('has a %s translation for every label of every built-in rule', (language) => {
    const messages = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'i18n', `${language}.json`), 'utf8'),
    );
    const missing = Object.values(BUILT_IN_RULES)
      .flatMap((rule) => rule.fields.map((field) => field.label))
      .filter((label) => label.startsWith('encounters.') && typeof lookup(messages, label) !== 'string');

    expect(missing).toEqual([]);
  });
});
