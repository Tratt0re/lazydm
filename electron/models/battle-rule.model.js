/**
 * Battle rules: the configuration of an encounter's entity rows (like a note template, for the initiative
 * list). A rule lists the fields of a row in order; the encounter stores each entity's values by field key.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  hashContent,
  resolveInsideVault,
  safeWriteFileAtomic,
} = require('../utils/file-utils');
const { listCampaigns } = require('./campaign.model');
const { COMPENDIUM_DIR_NAME, listSystems } = require('./compendium.model');
const { readVaultConfig, writeVaultConfig } = require('./vault.model');

const BATTLE_RULE_VERSION = 1;
const BATTLE_RULES_DIR_NAME = '_battle-rules';
const BATTLE_RULE_EXTENSION = '.json';
const TEMPLATE_REF_MAX_LENGTH = 255;
const BATTLE_RULE_NAME_MAX_LENGTH = 80;
const BATTLE_RULE_FIELDS_MAX = 40;
const FIELD_KEY_MAX_LENGTH = 40;
const FIELD_LABEL_MAX_LENGTH = 60;
const INITIATIVE_ROLL_MAX_LENGTH = 40;
const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const FRONTMATTER_SOURCE_PREFIX = 'frontmatter:';

/** What a field shows and edits: the components the encounter page knows. */
const FIELD_COMPONENTS = Object.freeze([
  'initiative',
  'text',
  'number',
  'healthbar',
  'statuses',
  'side',
  'note-link',
]);

/** Sides an entity can take when the rule's `side` field does not list its own. */
const DEFAULT_SIDES = Object.freeze(['enemy', 'player', 'ally']);

/** Rule value of a campaign or an encounter that uses the built-in rule. */
const BUILT_IN_RULE = 'builtin';

function entityField(key, component, extra = {}) {
  return Object.freeze({
    key,
    component,
    label: `encounters.fields.${key}`,
    source: 'entity',
    showInRow: true,
    ...extra,
  });
}

/**
 * Rule shipped with the app: system-neutral (initiative, side, AC, HP bar, statuses, linked note). It has no
 * roll formula, so *Roll initiative* is not offered. Read-only; *Customize* copies it out.
 */
const DEFAULT_BATTLE_RULE = Object.freeze({
  version: BATTLE_RULE_VERSION,
  name: 'Generic',
  // Where the frontmatter keys a field can read (and a formula can use) come from: a template.
  template: 'builtin:enemy',
  initiative: Object.freeze({ roll: null }),
  fields: Object.freeze([
    entityField('initiative', 'initiative'),
    entityField('side', 'side', { options: DEFAULT_SIDES }),
    entityField('ac', 'number', { source: `${FRONTMATTER_SOURCE_PREFIX}ac` }),
    entityField('hp', 'healthbar', { source: `${FRONTMATTER_SOURCE_PREFIX}hp` }),
    entityField('statuses', 'statuses'),
    entityField('note', 'note-link'),
  ]),
});

/** `key`, or `key_2`, `key_3`… when the rule already uses it. */
function pickFreeKey(taken, key) {
  for (let index = 1; ; index++) {
    const candidate = index === 1 ? key : `${key}_${index}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toText(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().slice(0, maxLength)
    : null;
}

/** `entity` or `frontmatter:<key>`; anything else is the entity itself. */
function normalizeSource(value) {
  if (typeof value !== 'string' || !value.startsWith(FRONTMATTER_SOURCE_PREFIX)) {
    return 'entity';
  }

  const key = value.slice(FRONTMATTER_SOURCE_PREFIX.length).trim().slice(0, FIELD_KEY_MAX_LENGTH);
  return key.length > 0 ? `${FRONTMATTER_SOURCE_PREFIX}${key}` : 'entity';
}

function normalizeField(field) {
  if (!isPlainObject(field)) {
    return null;
  }

  const key = typeof field.key === 'string' ? field.key.trim() : '';
  if (
    !FIELD_KEY_PATTERN.test(key) ||
    key.length > FIELD_KEY_MAX_LENGTH ||
    !FIELD_COMPONENTS.includes(field.component)
  ) {
    return null;
  }

  const options = Array.isArray(field.options)
    ? field.options.map((option) => toText(option, FIELD_KEY_MAX_LENGTH)).filter(Boolean)
    : [];
  return {
    key,
    component: field.component,
    label: toText(field.label, FIELD_LABEL_MAX_LENGTH) ?? key,
    source: normalizeSource(field.source),
    showInRow: field.showInRow !== false,
    ...(options.length > 0 ? { options } : {}),
  };
}

/**
 * A rule read from a file: unknown components, bad keys and duplicate keys are dropped instead of failing, so
 * a hand-edited rule still opens. A rule left with no field falls back to the built-in one.
 */
function normalizeBattleRule(value) {
  if (!isPlainObject(value)) {
    return DEFAULT_BATTLE_RULE;
  }

  const seen = new Set();
  const listed = (Array.isArray(value.fields) ? value.fields : [])
    .slice(0, BATTLE_RULE_FIELDS_MAX)
    .map(normalizeField)
    .filter((field) => {
      if (!field || seen.has(field.key)) {
        return false;
      }

      seen.add(field.key);
      return true;
    });
  if (listed.length === 0) {
    return DEFAULT_BATTLE_RULE;
  }

  // Every rule has an initiative (with the name, the one thing a battle cannot do without).
  const fields = listed.some((field) => field.component === 'initiative')
    ? listed
    : [normalizeField({ ...DEFAULT_BATTLE_RULE.fields[0], key: pickFreeKey(seen, 'initiative') }), ...listed];

  return {
    version: BATTLE_RULE_VERSION,
    name: toText(value.name, BATTLE_RULE_NAME_MAX_LENGTH) ?? DEFAULT_BATTLE_RULE.name,
    template: toText(value.template, TEMPLATE_REF_MAX_LENGTH),
    initiative: {
      roll: isPlainObject(value.initiative)
        ? toText(value.initiative.roll, INITIATIVE_ROLL_MAX_LENGTH)
        : null,
    },
    fields,
  };
}

/** `_battle-rules/x.json`, `<campaign>/_battle-rules/x.json` or `compendium/<system>/_battle-rules/x.json`. */
function isBattleRulePath(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.endsWith(BATTLE_RULE_EXTENSION)) {
    return false;
  }

  const segments = relativePath.split('/');
  if (segments.some((segment) => segment.length === 0 || segment.startsWith('.'))) {
    return false;
  }

  if (segments.length === 2) {
    return segments[0] === BATTLE_RULES_DIR_NAME;
  }

  if (segments.length === 3) {
    return segments[1] === BATTLE_RULES_DIR_NAME && segments[0] !== COMPENDIUM_DIR_NAME;
  }

  return (
    segments.length === 4 &&
    segments[0] === COMPENDIUM_DIR_NAME &&
    segments[2] === BATTLE_RULES_DIR_NAME
  );
}

async function listRuleFiles(rootPath, folderPath) {
  const absolutePath = resolveInsideVault(rootPath, folderPath);
  if (!fs.existsSync(absolutePath)) {
    return [];
  }

  const entries = await fs.promises.readdir(absolutePath, { withFileTypes: true });
  return entries
    .filter(
      (entry) =>
        entry.isFile() && entry.name.endsWith(BATTLE_RULE_EXTENSION) && !entry.name.startsWith('.'),
    )
    .map((entry) => `${folderPath}/${entry.name}`)
    .sort((left, right) => left.localeCompare(right));
}

async function readRuleName(rootPath, rulePath) {
  try {
    const parsed = JSON.parse(await fs.promises.readFile(resolveInsideVault(rootPath, rulePath), 'utf8'));
    return normalizeBattleRule(parsed).name;
  } catch {
    return path.posix.basename(rulePath, BATTLE_RULE_EXTENSION);
  }
}

async function toRuleRow(rootPath, rulePath, source) {
  return { path: rulePath, name: await readRuleName(rootPath, rulePath), ...source };
}

/** Every rule file of the vault: vault-level first, then each compendium system, then each campaign. */
async function listBattleRules(rootPath) {
  const rows = [];
  for (const rulePath of await listRuleFiles(rootPath, BATTLE_RULES_DIR_NAME)) {
    rows.push(await toRuleRow(rootPath, rulePath, { source: 'vault', scope: null, scopeName: null }));
  }

  for (const system of await listSystems(rootPath)) {
    for (const rulePath of await listRuleFiles(rootPath, `${system.path}/${BATTLE_RULES_DIR_NAME}`)) {
      rows.push(
        await toRuleRow(rootPath, rulePath, { source: 'system', scope: system.path, scopeName: system.name }),
      );
    }
  }

  for (const campaign of await listCampaigns(rootPath)) {
    for (const rulePath of await listRuleFiles(rootPath, `${campaign.slug}/${BATTLE_RULES_DIR_NAME}`)) {
      rows.push(
        await toRuleRow(rootPath, rulePath, { source: 'campaign', scope: campaign.slug, scopeName: campaign.name }),
      );
    }
  }

  return rows;
}

function serialize(rule) {
  return `${JSON.stringify(normalizeBattleRule(rule), null, 2)}\n`;
}

async function readBattleRuleFile(rootPath, rulePath) {
  if (!isBattleRulePath(rulePath)) {
    throw new Error(`Not a battle rule file: ${rulePath}`);
  }

  const absolutePath = resolveInsideVault(rootPath, rulePath);
  const buffer = await fs.promises.readFile(absolutePath);
  let parsed = null;
  let parseError = null;
  try {
    parsed = JSON.parse(buffer.toString('utf8'));
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }

  return {
    path: rulePath,
    rule: normalizeBattleRule(parsed),
    parseError,
    contentHash: hashContent(buffer),
  };
}

/** Saves a rule only if the file still is what the editor loaded; otherwise returns the current version. */
async function writeBattleRuleFile(rootPath, rulePath, rule, expectedHash) {
  if (!isBattleRulePath(rulePath)) {
    throw new Error(`Not a battle rule file: ${rulePath}`);
  }

  const absolutePath = resolveInsideVault(rootPath, rulePath);
  if (fs.existsSync(absolutePath)) {
    const current = hashContent(await fs.promises.readFile(absolutePath));
    if (current !== expectedHash) {
      return { status: 'conflict', current: await readBattleRuleFile(rootPath, rulePath) };
    }
  }

  const content = serialize(rule);
  safeWriteFileAtomic(absolutePath, content);
  return { status: 'saved', contentHash: hashContent(Buffer.from(content, 'utf8')) };
}

/** A free `_battle-rules/<slug>.json` path (`slug-2`, `slug-3`… when taken). */
function getFreeRulePath(rootPath, slug) {
  for (let index = 1; ; index++) {
    const candidate = `${BATTLE_RULES_DIR_NAME}/${index === 1 ? slug : `${slug}-${index}`}${BATTLE_RULE_EXTENSION}`;
    if (!fs.existsSync(resolveInsideVault(rootPath, candidate))) {
      return candidate;
    }
  }
}

/** Writes a new vault-level rule (a copy of the built-in under `name`) and returns its path. */
async function createBattleRuleFile(rootPath, slug, name) {
  const rulePath = getFreeRulePath(rootPath, slug);
  safeWriteFileAtomic(
    resolveInsideVault(rootPath, rulePath),
    serialize({ ...DEFAULT_BATTLE_RULE, name }),
  );
  return rulePath;
}

function battleRuleExists(rootPath, rulePath) {
  return isBattleRulePath(rulePath) && fs.existsSync(resolveInsideVault(rootPath, rulePath));
}

/** Rule choices of the campaigns (`.lazydm/vault.json` → `battleRules.campaigns.<slug>`): a rule path or `builtin`. */
function readCampaignChoice(rootPath, campaignSlug) {
  const value = readVaultConfig(rootPath)?.battleRules?.campaigns?.[campaignSlug];
  return value === BUILT_IN_RULE || battleRuleExists(rootPath, value) ? value : null;
}

function updateCampaignChoices(rootPath, update) {
  const config = readVaultConfig(rootPath) ?? {};
  const battleRules = config.battleRules && typeof config.battleRules === 'object' ? config.battleRules : {};
  const campaigns = { ...(battleRules.campaigns ?? {}) };
  update(campaigns);
  writeVaultConfig(rootPath, { ...config, battleRules: { ...battleRules, campaigns } });
}

/** Sets (or clears, with null) the rule a campaign's encounters follow by default. */
function setCampaignChoice(rootPath, campaignSlug, value) {
  updateCampaignChoices(rootPath, (campaigns) => {
    if (value === null) {
      delete campaigns[campaignSlug];
    } else {
      campaigns[campaignSlug] = value;
    }
  });

  return readCampaignChoice(rootPath, campaignSlug);
}

async function deleteBattleRuleFile(rootPath, rulePath) {
  await fs.promises.rm(resolveInsideVault(rootPath, rulePath));
  if (readVaultConfig(rootPath)?.battleRules?.campaigns) {
    updateCampaignChoices(rootPath, (campaigns) => {
      for (const [slug, value] of Object.entries(campaigns)) {
        if (value === rulePath) {
          delete campaigns[slug];
        }
      }
    });
  }
}

/**
 * The rule an encounter uses: its own choice (`selection`: a rule path or `builtin`), else its campaign's, else
 * the built-in. A choice whose file is gone falls through to the next.
 */
async function resolveBattleRule(rootPath, encounterPath, selection) {
  const scope = encounterPath.split('/')[0];
  const choices = [
    selection,
    scope === COMPENDIUM_DIR_NAME ? null : readCampaignChoice(rootPath, scope),
  ];
  for (const choice of choices) {
    if (choice === BUILT_IN_RULE) {
      return DEFAULT_BATTLE_RULE;
    }

    if (choice && battleRuleExists(rootPath, choice)) {
      return (await readBattleRuleFile(rootPath, choice)).rule;
    }
  }

  return DEFAULT_BATTLE_RULE;
}

module.exports = {
  BATTLE_RULES_DIR_NAME,
  BATTLE_RULE_VERSION,
  BUILT_IN_RULE,
  DEFAULT_BATTLE_RULE,
  DEFAULT_SIDES,
  FIELD_COMPONENTS,
  FRONTMATTER_SOURCE_PREFIX,
  battleRuleExists,
  createBattleRuleFile,
  deleteBattleRuleFile,
  isBattleRulePath,
  listBattleRules,
  normalizeBattleRule,
  readBattleRuleFile,
  readCampaignChoice,
  resolveBattleRule,
  setCampaignChoice,
  writeBattleRuleFile,
};
