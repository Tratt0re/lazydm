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
  trashVaultItem,
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
/** The entity row is a grid of this many columns and (at most) this many rows; a field takes `span` columns. */
const LAYOUT_COLUMNS = 12;
const LAYOUT_ROWS_MAX = 4;
/** Columns a field takes when the rule gives it no place of its own. */
const DEFAULT_SPANS = Object.freeze({
  initiative: 1,
  name: 3,
  side: 1,
  number: 1,
  'note-link': 1,
  healthbar: 3,
  text: 3,
  statuses: 6,
});
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

function area(row, column, span) {
  return Object.freeze({ row, column, span });
}

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
 * Rule shipped with the app: system-neutral layout (initiative, linked note, name, AC, HP bar, statuses) that
 * rolls `1d20 + {initiative_mod}` (the enemy template's key). Read-only; *Customize* copies it out.
 */
const DEFAULT_BATTLE_RULE = Object.freeze({
  version: BATTLE_RULE_VERSION,
  name: 'Generic',
  // Where the frontmatter keys a field can read (and a formula can use) come from: a template.
  template: 'builtin:enemy',
  initiative: Object.freeze({ roll: '1d20 + {initiative_mod}' }),
  // Where the name sits in the row grid (it is in every rule).
  nameArea: area(1, 2, 5),
  fields: Object.freeze([
    entityField('initiative', 'initiative', { area: area(1, 1, 1) }),
    entityField('ac', 'number', {
      source: `${FRONTMATTER_SOURCE_PREFIX}ac`,
      area: area(2, 1, 1),
    }),
    entityField('hp', 'healthbar', {
      source: `${FRONTMATTER_SOURCE_PREFIX}hp`,
      area: area(1, 7, 6),
    }),
    entityField('statuses', 'statuses', { area: area(2, 2, 10) }),
    entityField('note', 'note-link', { area: area(2, 12, 1) }),
  ]),
});

const BUILT_IN_RULE_PREFIX = 'builtin:';

/** A number tile read from the entity's note (`ac`, `fortitude`…). */
function noteNumber(key, place) {
  return entityField(key, 'number', { source: `${FRONTMATTER_SOURCE_PREFIX}${key}`, area: place });
}

/**
 * Rules shipped with the app, by reference: `builtin` (Generic, above) and one per game system. They are data:
 * the battle code never names a game, it only reads fields and areas. Each reads the keys of the enemy template
 * of its system (`builtin:enemy@<system>`). Read-only; *Customize* copies one out.
 */
const SYSTEM_BATTLE_RULES = Object.freeze({
  dnd5e: Object.freeze({
    version: BATTLE_RULE_VERSION,
    name: 'D&D 5e',
    template: 'builtin:enemy@dnd5e',
    initiative: Object.freeze({ roll: '1d20 + {initiative_mod}' }),
    nameArea: area(1, 2, 4),
    fields: Object.freeze([
      entityField('initiative', 'initiative', { area: area(1, 1, 1) }),
      entityField('side', 'side', { area: area(1, 6, 2), options: DEFAULT_SIDES }),
      entityField('hp', 'healthbar', { source: `${FRONTMATTER_SOURCE_PREFIX}hp`, area: area(1, 8, 5) }),
      noteNumber('ac', area(2, 1, 1)),
      entityField('statuses', 'statuses', { area: area(2, 2, 10) }),
      entityField('note', 'note-link', { area: area(2, 12, 1) }),
    ]),
  }),
  pf2e: Object.freeze({
    version: BATTLE_RULE_VERSION,
    name: 'Pathfinder 2e',
    template: 'builtin:enemy@pf2e',
    // Initiative is a Perception check.
    initiative: Object.freeze({ roll: '1d20 + {perception}' }),
    nameArea: area(1, 2, 4),
    fields: Object.freeze([
      entityField('initiative', 'initiative', { area: area(1, 1, 1) }),
      entityField('side', 'side', { area: area(1, 6, 2), options: DEFAULT_SIDES }),
      entityField('hp', 'healthbar', { source: `${FRONTMATTER_SOURCE_PREFIX}hp`, area: area(1, 8, 5) }),
      noteNumber('ac', area(2, 1, 1)),
      noteNumber('fortitude', area(2, 2, 1)),
      noteNumber('reflex', area(2, 3, 1)),
      noteNumber('will', area(2, 4, 1)),
      entityField('statuses', 'statuses', { area: area(2, 5, 7) }),
      entityField('note', 'note-link', { area: area(2, 12, 1) }),
    ]),
  }),
});

/** Every built-in rule by reference, the default (`builtin`) first. */
const BUILT_IN_RULES = Object.freeze({
  [BUILT_IN_RULE]: DEFAULT_BATTLE_RULE,
  ...Object.fromEntries(
    Object.entries(SYSTEM_BATTLE_RULES).map(([system, rule]) => [
      `${BUILT_IN_RULE_PREFIX}${system}`,
      rule,
    ]),
  ),
});

/** Whether `value` names a built-in rule (`builtin`, `builtin:dnd5e`…). */
function isBuiltInRuleRef(value) {
  return typeof value === 'string' && Object.hasOwn(BUILT_IN_RULES, value);
}

/** The built-in rule a reference names; the default one for anything else. */
function getBuiltInRule(ref) {
  return isBuiltInRuleRef(ref) ? BUILT_IN_RULES[ref] : DEFAULT_BATTLE_RULE;
}

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
  const placed = normalizeArea(field.area);
  return {
    key,
    component: field.component,
    label: toText(field.label, FIELD_LABEL_MAX_LENGTH) ?? key,
    source: normalizeSource(field.source),
    showInRow: field.showInRow !== false,
    ...(placed ? { area: placed } : {}),
    ...(options.length > 0 ? { options } : {}),
  };
}

/** `{ row, column, span }` inside the grid, or null when it is missing or out of it. */
function normalizeArea(value) {
  if (!isPlainObject(value)) {
    return null;
  }

  const { row, column, span } = value;
  const isInteger = (number) => Number.isInteger(number);
  return isInteger(row) &&
    isInteger(column) &&
    isInteger(span) &&
    row >= 1 &&
    row <= LAYOUT_ROWS_MAX &&
    column >= 1 &&
    span >= 1 &&
    column + span - 1 <= LAYOUT_COLUMNS
    ? { row, column, span }
    : null;
}

function overlaps(first, second) {
  return (
    first.row === second.row &&
    first.column <= second.column + second.span - 1 &&
    second.column <= first.column + first.span - 1
  );
}

/**
 * Gives every element of the row a place in the grid. Elements that have one keep it (the first of two
 * overlapping ones wins); the others, in order, take the first free run of their width, a narrower one when the
 * rows are crowded. `items` are `{ id, area, width }`; returns `id → area`.
 */
function placeInGrid(items) {
  const placed = new Map();
  const taken = [];
  for (const item of items) {
    if (item.area && !taken.some((other) => overlaps(item.area, other))) {
      placed.set(item.id, item.area);
      taken.push(item.area);
    }
  }

  for (const item of items.filter((candidate) => !placed.has(candidate.id))) {
    let found = null;
    for (let width = item.width; width >= 1 && !found; width--) {
      for (let row = 1; row <= LAYOUT_ROWS_MAX && !found; row++) {
        for (let column = 1; column + width - 1 <= LAYOUT_COLUMNS && !found; column++) {
          const candidate = { row, column, span: width };
          if (!taken.some((other) => overlaps(candidate, other))) {
            found = candidate;
          }
        }
      }
    }

    // No room left at all: stack it on the last row (a rule this crowded is hand-made).
    const area = found ?? { row: LAYOUT_ROWS_MAX, column: LAYOUT_COLUMNS, span: 1 };
    placed.set(item.id, area);
    taken.push(area);
  }

  return placed;
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
  const withInitiative = listed.some((field) => field.component === 'initiative')
    ? listed
    : [
        normalizeField({
          ...DEFAULT_BATTLE_RULE.fields[0],
          key: pickFreeKey(seen, 'initiative'),
          area: undefined,
        }),
        ...listed,
      ];

  // The row grid: the name comes right after the initiative when nobody gave it a place.
  const nameIndex = withInitiative.findIndex((field) => field.component === 'initiative') + 1;
  // A field hidden from the row takes no place in the grid (it keeps its own, for when it comes back).
  const items = withInitiative
    .filter((field) => field.showInRow)
    .map((field) => ({
      id: field.key,
      area: field.area ?? null,
      width: DEFAULT_SPANS[field.component] ?? 1,
    }));
  items.splice(nameIndex, 0, {
    id: '$name',
    area: normalizeArea(value.nameArea),
    width: DEFAULT_SPANS.name,
  });
  const places = placeInGrid(items);
  const fields = withInitiative.map((field) => {
    const place = places.get(field.key) ?? field.area;
    return place ? { ...field, area: place } : field;
  });

  return {
    version: BATTLE_RULE_VERSION,
    name: toText(value.name, BATTLE_RULE_NAME_MAX_LENGTH) ?? DEFAULT_BATTLE_RULE.name,
    template: toText(value.template, TEMPLATE_REF_MAX_LENGTH),
    nameArea: places.get('$name'),
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
    const parsed = JSON.parse(
      await fs.promises.readFile(resolveInsideVault(rootPath, rulePath), 'utf8'),
    );
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
    rows.push(
      await toRuleRow(rootPath, rulePath, { source: 'vault', scope: null, scopeName: null }),
    );
  }

  for (const system of await listSystems(rootPath)) {
    for (const rulePath of await listRuleFiles(
      rootPath,
      `${system.path}/${BATTLE_RULES_DIR_NAME}`,
    )) {
      rows.push(
        await toRuleRow(rootPath, rulePath, {
          source: 'system',
          scope: system.path,
          scopeName: system.name,
        }),
      );
    }
  }

  for (const campaign of await listCampaigns(rootPath)) {
    for (const rulePath of await listRuleFiles(
      rootPath,
      `${campaign.slug}/${BATTLE_RULES_DIR_NAME}`,
    )) {
      rows.push(
        await toRuleRow(rootPath, rulePath, {
          source: 'campaign',
          scope: campaign.slug,
          scopeName: campaign.name,
        }),
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
/** A new rule file, started from a built-in one (`from`: a reference, the default when missing). */
async function createBattleRuleFile(rootPath, slug, name, from = BUILT_IN_RULE) {
  const rulePath = getFreeRulePath(rootPath, slug);
  safeWriteFileAtomic(
    resolveInsideVault(rootPath, rulePath),
    serialize({ ...getBuiltInRule(from), name }),
  );
  return rulePath;
}

function battleRuleExists(rootPath, rulePath) {
  return isBattleRulePath(rulePath) && fs.existsSync(resolveInsideVault(rootPath, rulePath));
}

/** Rule choices of the campaigns (`.lazydm/vault.json` → `battleRules.campaigns.<slug>`): a rule path or a built-in reference. */
function readCampaignChoice(rootPath, campaignSlug) {
  const value = readVaultConfig(rootPath)?.battleRules?.campaigns?.[campaignSlug];
  return isBuiltInRuleRef(value) || battleRuleExists(rootPath, value) ? value : null;
}

function updateCampaignChoices(rootPath, update) {
  const config = readVaultConfig(rootPath) ?? {};
  const battleRules =
    config.battleRules && typeof config.battleRules === 'object' ? config.battleRules : {};
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
  await trashVaultItem(resolveInsideVault(rootPath, rulePath));
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
 * The rule an encounter uses: its own choice (`selection`: a rule path or a built-in reference), else its campaign's, else
 * the built-in. A choice whose file is gone falls through to the next.
 */
async function resolveBattleRule(rootPath, encounterPath, selection) {
  const scope = encounterPath.split('/')[0];
  const choices = [
    selection,
    scope === COMPENDIUM_DIR_NAME ? null : readCampaignChoice(rootPath, scope),
  ];
  for (const choice of choices) {
    if (isBuiltInRuleRef(choice)) {
      return getBuiltInRule(choice);
    }

    if (choice && battleRuleExists(rootPath, choice)) {
      return (await readBattleRuleFile(rootPath, choice)).rule;
    }
  }

  return DEFAULT_BATTLE_RULE;
}

module.exports = {
  DEFAULT_SPANS,
  LAYOUT_COLUMNS,
  LAYOUT_ROWS_MAX,
  BATTLE_RULES_DIR_NAME,
  BATTLE_RULE_VERSION,
  BUILT_IN_RULE,
  BUILT_IN_RULES,
  DEFAULT_BATTLE_RULE,
  DEFAULT_SIDES,
  FIELD_COMPONENTS,
  FRONTMATTER_SOURCE_PREFIX,
  battleRuleExists,
  createBattleRuleFile,
  deleteBattleRuleFile,
  getBuiltInRule,
  isBuiltInRuleRef,
  isBattleRulePath,
  listBattleRules,
  normalizeBattleRule,
  readBattleRuleFile,
  readCampaignChoice,
  resolveBattleRule,
  setCampaignChoice,
  writeBattleRuleFile,
};
